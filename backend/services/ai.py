"""
AI Service - LLM 统一接口

核心 AI 能力：LLM 调用、意图分类、RAG 上下文检索。
课件生成相关方法见 courseware_ai.py（通过 CoursewareAIMixin 继承）。
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from litellm import acompletion

from schemas.intent import IntentClassification, IntentType, ModifyIntent, ModifyType
from services.courseware_ai import CoursewareAIMixin
from services.model_router import ModelRouteTask, ModelRouter

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)

# 默认模型从环境变量读取，支持 DashScope Qwen
# 是否允许在 LLM 调用失败时返回占位 stub 文本（默认 false，生产建议保持 false）


def _resolve_model_name(model: str) -> str:
    """
    解析模型名称，为 Qwen 模型自动添加 dashscope/ 前缀

    LiteLLM 要求 DashScope 模型使用 'dashscope/' 前缀。
    """
    if model.startswith(("qwen-", "qwen2", "qwen3")) and not model.startswith(
        "dashscope/"
    ):
        return f"dashscope/{model}"
    # MiniMax provider (LiteLLM): normalize common aliases / casing
    minimax_aliases = {
        "minimax-m2.5": "MiniMax-M2.5",
        "minimax-m2.5-lightning": "MiniMax-M2.5-lightning",
        "minimax-m2.1": "MiniMax-M2.1",
        "minimax-m2.1-lightning": "MiniMax-M2.1-lightning",
        "minimax-m2": "MiniMax-M2",
    }
    lowered = model.lower()
    if lowered in minimax_aliases:
        return f"minimax/{minimax_aliases[lowered]}"
    if model.startswith("minimax/"):
        _, suffix = model.split("/", 1)
        canonical = minimax_aliases.get(suffix.lower())
        if canonical:
            return f"minimax/{canonical}"
    if model.startswith(("MiniMax-", "minimax-")) and not model.startswith("minimax/"):
        return f"minimax/{model}"
    return model


class AIService(CoursewareAIMixin):
    """Service for AI operations using LiteLLM"""

    def __init__(self):
        self.default_model = os.getenv("DEFAULT_MODEL", "qwen3.5-plus")
        self.large_model = os.getenv("LARGE_MODEL", self.default_model)
        self.small_model = os.getenv("SMALL_MODEL", self.default_model)
        self.model_router = ModelRouter(
            heavy_model=self.large_model,
            light_model=self.small_model,
        )
        self.allow_ai_stub = os.getenv("ALLOW_AI_STUB", "false").lower() == "true"

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        route_task: Optional[str] = None,
        has_rag_context: bool = False,
        max_tokens: Optional[int] = 500,
    ) -> dict:
        """
        Generate AI content using LiteLLM

        Args:
            prompt: The input prompt
            model: The model to use (defaults to DEFAULT_MODEL env)
            max_tokens: Maximum tokens to generate

        Returns:
            dict with 'content', 'model', and 'tokens_used'
        """
        route_decision = None
        requested_model = model
        if not requested_model:
            if route_task:
                route_decision = self.model_router.route(
                    route_task,
                    prompt=prompt,
                    has_rag_context=has_rag_context,
                )
                requested_model = route_decision.selected_model
            else:
                requested_model = self.default_model
        resolved_model = requested_model
        try:
            resolved_model = _resolve_model_name(requested_model)
            logger.info(
                (
                    "AI generate invoked:"
                    " requested_model=%s resolved_model=%s route_task=%s"
                ),
                requested_model,
                resolved_model,
                route_task,
            )
            response = await acompletion(
                model=resolved_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            )

            content = response.choices[0].message.content
            tokens_used = (
                response.usage.total_tokens if hasattr(response, "usage") else None
            )

            return {
                "content": content,
                "model": resolved_model,
                "tokens_used": tokens_used,
                "route": route_decision.to_dict() if route_decision else None,
            }
        except Exception as e:
            logger.warning(f"AI generation failed: {str(e)}", exc_info=True)
            if self.allow_ai_stub:
                return {
                    "content": f"AI stub response for prompt: {prompt[:50]}...",
                    "model": resolved_model,
                    "tokens_used": 0,
                    "route": route_decision.to_dict() if route_decision else None,
                }
            raise

    async def classify_intent(self, user_message: str) -> IntentClassification:
        """
        对用户消息进行意图分类

        使用 LLM 分类，失败时回退到关键词规则。
        """
        from services.prompt_service import prompt_service

        try:
            prompt = prompt_service.build_intent_prompt(user_message)
            response = await self.generate(
                prompt=prompt,
                route_task=ModelRouteTask.INTENT_CLASSIFICATION.value,
                max_tokens=200,
            )
            content = response["content"].strip()

            parsed = json.loads(content)
            intent_str = parsed.get("intent", "general_chat")
            confidence = float(parsed.get("confidence", 0.8))

            return IntentClassification(
                intent=IntentType(intent_str),
                confidence=confidence,
                method="llm",
            )
        except Exception as e:
            logger.warning(f"LLM intent classification failed: {e}, using fallback")
            try:
                return self._classify_intent_by_keywords(user_message)
            except Exception as fallback_exc:
                logger.error(
                    "Keyword intent fallback failed: %s", fallback_exc, exc_info=True
                )
                return IntentClassification(
                    intent=IntentType.GENERAL_CHAT,
                    confidence=0.0,
                    method="keyword_fallback",
                )

    @staticmethod
    def _classify_intent_by_keywords(message: str) -> IntentClassification:
        """基于关键词的意图分类回退"""
        msg = message.lower()

        modify_keywords = [
            "修改",
            "改一下",
            "换成",
            "调整",
            "删除",
            "添加",
            "替换",
        ]
        if any(kw in msg for kw in modify_keywords):
            return IntentClassification(
                intent=IntentType.MODIFY_COURSEWARE,
                confidence=0.6,
                method="keyword_fallback",
            )

        confirm_keywords = [
            "生成",
            "开始",
            "确认",
            "好的",
            "可以",
            "就这样",
        ]
        if any(kw in msg for kw in confirm_keywords):
            return IntentClassification(
                intent=IntentType.CONFIRM_GENERATION,
                confidence=0.6,
                method="keyword_fallback",
            )

        question_keywords = [
            "吗",
            "什么",
            "怎么",
            "如何",
            "为什么",
            "能不能",
            "？",
            "?",
        ]
        if any(kw in msg for kw in question_keywords):
            return IntentClassification(
                intent=IntentType.ASK_QUESTION,
                confidence=0.5,
                method="keyword_fallback",
            )

        requirement_keywords = [
            "课件",
            "主题",
            "关于",
            "内容",
            "PPT",
            "ppt",
            "教学",
            "讲解",
            "介绍",
        ]
        if any(kw in msg for kw in requirement_keywords):
            return IntentClassification(
                intent=IntentType.DESCRIBE_REQUIREMENT,
                confidence=0.5,
                method="keyword_fallback",
            )

        return IntentClassification(
            intent=IntentType.GENERAL_CHAT,
            confidence=0.4,
            method="keyword_fallback",
        )

    async def parse_modify_intent(self, instruction: str) -> ModifyIntent:
        """
        解析修改指令，提取修改子类型和目标幻灯片页码

        使用 LLM 解析，失败时回退到关键词规则。
        """
        try:
            prompt = (
                "分析以下课件修改指令，返回 JSON：\n"
                f'指令："{instruction}"\n\n'
                "返回格式：\n"
                '{"modify_type": "content|style|structure|global", '
                '"target_slides": [页码数字] 或 null}\n\n'
                "类型说明：\n"
                "- content: 修改文字内容（改标题、改文案、改要点）\n"
                "- style: 修改风格/模板（改颜色、改字体、改排版）\n"
                "- structure: 修改结构（加页、删页、调整顺序）\n"
                "- global: 全局修改（改主题、改整体风格）\n\n"
                "严格返回 JSON，不要包含其他内容。"
            )
            response = await self.generate(
                prompt=prompt,
                route_task=ModelRouteTask.INTENT_CLASSIFICATION.value,
                max_tokens=200,
            )
            content = response["content"].strip()
            parsed = json.loads(content)

            modify_type = ModifyType(parsed.get("modify_type", "content"))
            raw_slides = parsed.get("target_slides")
            target_slides = [int(s) for s in raw_slides] if raw_slides else None
            return ModifyIntent(
                modify_type=modify_type,
                target_slides=target_slides,
                instruction=instruction,
            )
        except Exception as e:
            logger.warning(f"LLM modify intent parse failed: {e}, using fallback")
            try:
                return self._parse_modify_intent_by_keywords(instruction)
            except Exception as fallback_exc:
                logger.error(
                    "Keyword modify fallback failed: %s", fallback_exc, exc_info=True
                )
                return ModifyIntent(
                    modify_type=ModifyType.CONTENT,
                    target_slides=None,
                    instruction=instruction,
                )

    @staticmethod
    def _parse_modify_intent_by_keywords(instruction: str) -> ModifyIntent:
        """基于关键词的修改意图解析回退"""
        msg = instruction.lower()

        # 提取页码
        target_slides = None
        page_patterns = [
            r"第\s*(\d+)\s*页",
            r"第\s*(\d+)\s*张",
            r"slide\s*(\d+)",
            r"第\s*(\d+)\s*[个]?幻灯片",
        ]
        found_pages = []
        for pat in page_patterns:
            found_pages.extend(int(m) for m in re.findall(pat, msg))
        if found_pages:
            target_slides = sorted(set(found_pages))

        # 判断修改类型
        style_kw = ["风格", "模板", "颜色", "字体", "排版", "样式", "主题色"]
        structure_kw = [
            "添加一页",
            "加一页",
            "删除一页",
            "删掉",
            "增加一页",
            "调整顺序",
        ]
        has_structure = any(kw in msg for kw in structure_kw)
        has_style = any(kw in msg for kw in style_kw)
        has_global_scope = any(kw in msg for kw in ["整体", "全部", "所有", "全局"])
        # “主题色”应归到 style，不应触发 global
        has_global_theme = "主题" in msg and "主题色" not in msg

        if has_structure:
            modify_type = ModifyType.STRUCTURE
        elif (has_global_scope or has_global_theme) and not target_slides:
            modify_type = ModifyType.GLOBAL
        elif has_style:
            modify_type = ModifyType.STYLE
        else:
            modify_type = ModifyType.CONTENT

        return ModifyIntent(
            modify_type=modify_type,
            target_slides=target_slides,
            instruction=instruction,
        )

    async def _retrieve_rag_context(
        self, project_id: str, query: str, top_k: int = 5, score_threshold: float = 0.3
    ) -> Optional[list[dict]]:
        """
        检索 RAG 上下文（如果项目有已索引的文档）

        Args:
            score_threshold: 最低相似度阈值，过滤低质量结果（默认 0.3）

        Returns:
            RAG 结果列表（dict 格式），无结果时返回 None
        """
        from services.rag_service import rag_service

        try:
            results = await rag_service.search(
                project_id=project_id,
                query=query,
                top_k=top_k,
                score_threshold=score_threshold,
            )
            if results:
                return [r.model_dump() for r in results]
        except Exception as e:
            logger.warning(f"RAG retrieval failed for project {project_id}: {e}")
        return None


# Global AI service instance
ai_service = AIService()
