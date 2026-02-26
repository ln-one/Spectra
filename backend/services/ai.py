import json
import logging
import os
import re
from typing import Optional

from litellm import acompletion

from schemas.generation import CoursewareContent
from schemas.intent import IntentClassification, IntentType
from schemas.outline import CoursewareOutline, OutlineSection

logger = logging.getLogger(__name__)

# 默认模型从环境变量读取，支持 DashScope Qwen
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "qwen-plus")


def _resolve_model_name(model: str) -> str:
    """
    解析模型名称，为 Qwen 模型自动添加 dashscope/ 前缀

    LiteLLM 要求 DashScope 模型使用 'dashscope/' 前缀。
    """
    if model.startswith(("qwen-", "qwen2")) and not model.startswith("dashscope/"):
        return f"dashscope/{model}"
    return model


class AIService:
    """Service for AI operations using LiteLLM"""

    def __init__(self):
        self.default_model = DEFAULT_MODEL

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = 500,
    ) -> dict:
        """
        Generate AI content using LiteLLM

        Args:
            prompt: The input prompt
            model: The model to use (defaults to DEFAULT_MODEL)
            max_tokens: Maximum tokens to generate

        Returns:
            dict with 'content', 'model', and 'tokens_used'
        """
        requested_model = model or self.default_model
        resolved_model = requested_model
        try:
            resolved_model = _resolve_model_name(requested_model)
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
            }
        except Exception as e:
            # Log the error for debugging and monitoring
            logger.warning(f"AI generation failed: {str(e)}", exc_info=True)
            # Return a stub response if API call fails
            return {
                "content": f"AI stub response for prompt: {prompt[:50]}...",
                "model": resolved_model,
                "tokens_used": 0,
            }

    async def classify_intent(self, user_message: str) -> IntentClassification:
        """
        对用户消息进行意图分类

        使用 LLM 分类，失败时回退到关键词规则。

        Args:
            user_message: 用户消息文本

        Returns:
            IntentClassification: 意图分类结果
        """
        from services.prompt_service import prompt_service

        try:
            prompt = prompt_service.build_intent_prompt(user_message)
            response = await self.generate(prompt=prompt, max_tokens=200)
            content = response["content"].strip()

            # 尝试解析 JSON
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
            return self._classify_intent_by_keywords(user_message)

    @staticmethod
    def _classify_intent_by_keywords(message: str) -> IntentClassification:
        """基于关键词的意图分类回退"""
        msg = message.lower()

        modify_keywords = ["修改", "改一下", "换成", "调整", "删除", "添加", "替换"]
        if any(kw in msg for kw in modify_keywords):
            return IntentClassification(
                intent=IntentType.MODIFY_COURSEWARE,
                confidence=0.6,
                method="keyword_fallback",
            )

        confirm_keywords = ["生成", "开始", "确认", "好的", "可以", "就这样"]
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

    async def _retrieve_rag_context(
        self, project_id: str, query: str, top_k: int = 5
    ) -> Optional[list[dict]]:
        """
        检索 RAG 上下文（如果项目有已索引的文档）

        Returns:
            RAG 结果列表（dict 格式），无结果时返回 None
        """
        from services.rag_service import rag_service

        try:
            results = await rag_service.search(
                project_id=project_id, query=query, top_k=top_k
            )
            if results:
                return [r.model_dump() for r in results]
        except Exception as e:
            logger.warning(f"RAG retrieval failed for project {project_id}: {e}")
        return None

    async def generate_outline(
        self,
        project_id: str,
        user_requirements: str,
        template_style: str = "default",
    ) -> CoursewareOutline:
        """
        生成课件结构化大纲，供用户确认/调整后再生成完整课件

        Args:
            project_id: 项目 ID
            user_requirements: 用户需求描述
            template_style: 模板风格

        Returns:
            CoursewareOutline: 结构化大纲
        """
        from services.prompt_service import STYLE_REQUIREMENTS, _format_rag_context

        rag_context = await self._retrieve_rag_context(project_id, user_requirements)

        rag_hint = ""
        if rag_context:
            rag_hint = (
                "\n\n以下是从用户上传资料中检索到的参考内容，"
                "请据此优化大纲：\n" + _format_rag_context(rag_context)
            )

        style_desc = STYLE_REQUIREMENTS.get(
            template_style, STYLE_REQUIREMENTS["default"]
        )

        prompt = f"""你是一位高级学科教学设计师。请根据以下教学需求生成课件大纲。
{rag_hint}
教学需求：{user_requirements}
模板风格：{template_style} - {style_desc}

请严格返回以下 JSON 格式，不要包含其他内容：
{{
  "title": "课件总标题",
  "sections": [
    {{"title": "章节标题", "key_points": ["知识点1", "知识点2"], "slide_count": 2}},
    ...
  ],
  "summary": "大纲概述（一句话）"
}}

要求：
1. 章节数量 3-8 个，覆盖教学全流程（导入→讲授→练习→总结）
2. 每个章节 2-5 个关键知识点
3. slide_count 根据内容复杂度合理分配，总页数 10-20 页"""

        try:
            response = await self.generate(prompt=prompt, max_tokens=1500)
            content = response["content"].strip()

            # 提取 JSON（兼容 markdown 代码块包裹）
            json_match = re.search(r"\{[\s\S]*\}", content)
            if not json_match:
                raise ValueError("No JSON found in response")

            parsed = json.loads(json_match.group())
            sections = [OutlineSection(**s) for s in parsed.get("sections", [])]
            total = sum(s.slide_count for s in sections) + 2  # +标题页+总结页

            return CoursewareOutline(
                title=parsed.get("title", user_requirements[:50]),
                sections=sections,
                total_slides=total,
                summary=parsed.get("summary"),
            )
        except Exception as e:
            logger.warning(f"Outline generation failed: {e}, using fallback")
            return CoursewareOutline(
                title=user_requirements[:50],
                sections=[
                    OutlineSection(
                        title="导入",
                        key_points=["引入主题", "激发兴趣"],
                        slide_count=2,
                    ),
                    OutlineSection(
                        title="核心内容",
                        key_points=["重点概念", "案例分析"],
                        slide_count=5,
                    ),
                    OutlineSection(
                        title="练习与讨论",
                        key_points=["课堂练习", "小组讨论"],
                        slide_count=3,
                    ),
                    OutlineSection(
                        title="总结",
                        key_points=["回顾要点", "作业布置"],
                        slide_count=2,
                    ),
                ],
                total_slides=14,
                summary="基础教学大纲",
            )

    async def generate_courseware_content(
        self,
        project_id: str,
        user_requirements: Optional[str] = None,
        template_style: str = "default",
    ) -> CoursewareContent:
        """
        生成课件内容（PPT Markdown 和教案 Markdown）

        生成前自动检索 RAG 知识库，将相关内容注入 prompt。
        如果项目无已索引文档则跳过 RAG 步骤。

        Args:
            project_id: 项目 ID
            user_requirements: 用户需求描述（可选，如果为空则从项目中获取）
            template_style: 模板风格

        Returns:
            CoursewareContent: 包含标题、PPT Markdown 和教案 Markdown
        """
        from services.prompt_service import prompt_service

        try:
            if not user_requirements:
                user_requirements = "通用教学课件"

            logger.info(
                f"Generating courseware content for project {project_id}",
                extra={
                    "project_id": project_id,
                    "requirements": user_requirements[:100],
                    "template_style": template_style,
                },
            )

            # RAG 检索：用用户需求作为 query 检索相关知识
            rag_context = await self._retrieve_rag_context(
                project_id, user_requirements
            )
            if rag_context:
                logger.info(
                    f"RAG retrieved {len(rag_context)} chunks for generation",
                    extra={"project_id": project_id},
                )

            # 使用 PromptService 构建 prompt（含 RAG 上下文注入）
            prompt = prompt_service.build_courseware_prompt(
                user_requirements=user_requirements,
                template_style=template_style,
                rag_context=rag_context,
            )

            response = await self.generate(prompt=prompt, max_tokens=4000)

            content = response["content"]
            courseware = self._parse_courseware_response(content, user_requirements)

            logger.info(
                "Courseware content generated successfully",
                extra={
                    "project_id": project_id,
                    "title": courseware.title,
                    "ppt_length": len(courseware.markdown_content),
                    "lesson_plan_length": len(courseware.lesson_plan_markdown),
                },
            )

            return courseware

        except Exception as e:
            logger.error(
                f"Failed to generate courseware content: {str(e)}",
                extra={"project_id": project_id},
                exc_info=True,
            )
            logger.warning(
                f"AI generation failed for project {project_id}, "
                "using fallback content",
                extra={
                    "project_id": project_id,
                    "error": str(e),
                    "template_style": template_style,
                },
            )
            return self._get_fallback_courseware(user_requirements)

    def _parse_courseware_response(
        self, content: str, user_requirements: str
    ) -> CoursewareContent:
        """解析 LLM 返回的课件内容"""
        # 提取 PPT 内容
        ppt_match = re.search(
            r"===PPT_CONTENT_START===(.*?)===PPT_CONTENT_END===",
            content,
            re.DOTALL,
        )
        ppt_content = ppt_match.group(1).strip() if ppt_match else ""

        # 提取教案内容
        lesson_match = re.search(
            r"===LESSON_PLAN_START===(.*?)===LESSON_PLAN_END===",
            content,
            re.DOTALL,
        )
        lesson_plan = lesson_match.group(1).strip() if lesson_match else ""

        # 如果解析失败，尝试简单分割
        if not ppt_content or not lesson_plan:
            logger.warning("Failed to parse structured response, trying simple split")
            parts = content.split("===")
            if len(parts) >= 2:
                ppt_content = parts[0].strip()
                lesson_plan = parts[1].strip() if len(parts) > 1 else ""

        # 提取标题（从 PPT 内容的第一个一级标题）
        title_match = re.search(r"^#\s+(.+)$", ppt_content, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else user_requirements[:50]

        # 验证内容不为空
        if not ppt_content:
            logger.warning("PPT content is empty, using fallback")
            ppt_content = f"# {title}\n\n课件内容生成中...\n\n---\n\n# 总结\n\n感谢观看"

        if not lesson_plan:
            logger.warning("Lesson plan is empty, using fallback")
            lesson_plan = f"# 教学目标\n\n- 完成{title}的教学\n\n# 教学过程\n\n## 讲授环节\n\n内容..."

        return CoursewareContent(
            title=title,
            markdown_content=ppt_content,
            lesson_plan_markdown=lesson_plan,
        )

    def _get_fallback_courseware(self, user_requirements: str) -> CoursewareContent:
        """获取 fallback 课件内容（当 AI 生成失败时使用）"""
        title = user_requirements[:50] if user_requirements else "课件"

        return CoursewareContent(
            title=title,
            markdown_content=f"""# {title}

欢迎学习

---

# 学习目标

- 理解核心概念
- 掌握基本方法
- 能够实际应用

---

# 主要内容

## 概念介绍

基础知识点...

---

# 实践练习

动手实践环节

---

# 总结

- 回顾重点
- 课后作业
- 下节预告
""",
            lesson_plan_markdown=f"""# 教学目标

- 知识目标：理解{title}的基本概念
- 技能目标：掌握{title}的基本方法
- 情感目标：培养学习兴趣

# 教学重点

- 核心概念的理解
- 基本方法的掌握

# 教学难点

- 概念的深入理解
- 方法的灵活应用

# 教学过程

## 导入环节（5分钟）

引入主题，激发兴趣。

## 讲授环节（25分钟）

讲解核心内容。

## 练习环节（10分钟）

学生动手实践。

## 总结环节（5分钟）

回顾重点，布置作业。

# 板书设计

```
{title}
├── 概念
├── 方法
└── 应用
```

# 作业布置

1. 复习课堂内容
2. 完成练习题
3. 预习下节课
""",
        )


# Global AI service instance
ai_service = AIService()
