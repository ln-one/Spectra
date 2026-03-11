"""
Prompt Service

Centralized prompt builders for courseware generation and chat workflows.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_RAG_CHUNK_MAX_CHARS = 600


def _format_rag_context(rag_results: list[dict]) -> str:
    """Format retrieved chunks into a compact, source-aware prompt section."""
    if not rag_results:
        return ""

    sections: list[str] = []
    for i, item in enumerate(rag_results, 1):
        source = item.get("source", {}) or {}
        filename = source.get("filename", "unknown_source")
        score = float(item.get("score", 0.0) or 0.0)
        content = str(item.get("content", "") or "")
        if len(content) > _RAG_CHUNK_MAX_CHARS:
            content = content[:_RAG_CHUNK_MAX_CHARS] + "...（已截断）"
        sections.append(f"参考资料 {i}（{filename}，相关度={score:.0%}）\n{content}")
    return "\n\n".join(sections)


STYLE_REQUIREMENTS = {
    "default": "清晰易读的教学风格。",
    "gaia": "现代简洁风格，强调视觉层级。",
    "uncover": "节奏感强的演示风格，强调循序展开。",
    "academic": "学术风格，结构严谨、表述规范。",
}


COURSEWARE_FEW_SHOT = """
示例输出（节选）：

===PPT_CONTENT_START===
# 课程标题
副标题

---

# 学习目标
- 目标 A
- 目标 B
===PPT_CONTENT_END===

===LESSON_PLAN_START===
# 教学目标
- 知识目标
- 技能目标
- 情感目标
===LESSON_PLAN_END===
""".strip()


class PromptService:
    """Prompt template service."""

    def build_courseware_prompt(
        self,
        user_requirements: str,
        template_style: str = "default",
        rag_context: Optional[list[dict]] = None,
        outline_mode: bool = False,
        outline_slide_count: Optional[int] = None,
    ) -> str:
        """Build prompt for courseware generation."""
        style_instruction = STYLE_REQUIREMENTS.get(
            template_style, STYLE_REQUIREMENTS["default"]
        )

        rag_section = ""
        if rag_context:
            rag_section = (
                "\n以下为从项目资料检索到的参考资料，请优先利用高相关度内容。\n"
                "如引用资料，请在句末标注来源编号（如：[来源1]）。\n\n"
                f"{_format_rag_context(rag_context)}\n\n"
            )

        if outline_mode:
            if outline_slide_count and outline_slide_count > 0:
                ppt_constraints = (
                    f"1. Generate exactly {outline_slide_count} slides; "
                    "no extra intro/summary slides.\n"
                    "2. Follow confirmed outline order strictly.\n"
                    "3. Every slide title must match corresponding outline title.\n"
                    "4. Do not include Marp frontmatter in PPT block.\n"
                    "5. Use '---' to separate slides.\n"
                    "6. Expand each slide by its key points (prefer 3-5 bullets).\n"
                    f"7. Visual style: {style_instruction}"
                )
            else:
                ppt_constraints = (
                    "1. Follow confirmed outline order strictly.\n"
                    "2. Every slide title must match corresponding outline title.\n"
                    "3. Do not include Marp frontmatter in PPT block.\n"
                    "4. Use '---' to separate slides.\n"
                    "5. Expand each slide by its key points (prefer 3-5 bullets).\n"
                    f"6. Visual style: {style_instruction}"
                )
        else:
            ppt_constraints = (
                "1. Do not include Marp frontmatter in PPT block.\n"
                "2. Use '---' to separate slides.\n"
                "3. Each slide contains one '# Title' and 3-5 bullets.\n"
                "4. First slide is title slide; last slide is summary.\n"
                f"5. Visual style: {style_instruction}"
            )

        return f"""你是资深学科教学设计师。
请基于以下需求生成完整课件内容。
{rag_section}
需求：{user_requirements}
模板风格：{template_style} - {style_instruction}
默认使用简体中文输出，除非用户明确要求其他语言。

输出格式：

===PPT_CONTENT_START===
(Marp markdown slides)
规则：
{ppt_constraints}
  禁止在正文中出现标记词
  (PPT_CONTENT_START/END, LESSON_PLAN_START/END)。
===PPT_CONTENT_END===

===LESSON_PLAN_START===
(详细教案 markdown)
规则：
1. 必须包含教学目标、教学重点、教学难点。
2. 必须包含分阶段教学过程和时间安排。
3. 必须包含板书设计与作业布置。
===LESSON_PLAN_END===

{COURSEWARE_FEW_SHOT}

请严格按以上标记块返回，不要附加额外说明。"""

    def build_intent_prompt(self, user_message: str) -> str:
        """Build prompt for intent classification."""
        return f"""You are an intent classifier for an education courseware assistant.
User message: {user_message}

Intent candidates (pick one):
- describe_requirement
- ask_question
- modify_courseware
- confirm_generation
- general_chat

Return JSON only:
{{"intent":"<one_intent>","confidence":0.0}}"""

    def build_modify_prompt(
        self,
        current_content: str,
        instruction: str,
        target_slides: Optional[list[str]] = None,
    ) -> str:
        """Build prompt for modifying existing courseware."""
        target_info = ""
        if target_slides:
            target_info = f"\nTarget slides: {', '.join(target_slides)}"

        return f"""你是资深学科教学设计师。
请根据指令修改课件内容。

当前内容：
{current_content}

修改指令：
{instruction}{target_info}

要求：
1. 未指定修改的部分尽量保持不变。
2. 保留 Marp markdown 格式与分隔符。
3. 返回完整修改后的 markdown。"""

    def build_chat_response_prompt(
        self,
        user_message: str,
        intent: str,
        rag_context: Optional[list[dict]] = None,
        conversation_history: Optional[list[dict]] = None,
    ) -> str:
        """Build prompt for general chat responses."""
        rag_section = ""
        if rag_context:
            rag_section = (
                "\n参考资料（按相关度排序）：\n"
                f"{_format_rag_context(rag_context)}\n"
                "如引用资料请标注来源编号（如：[来源1]）。\n"
            )

        history_section = ""
        if conversation_history:
            lines: list[str] = []
            for msg in conversation_history[-5:]:
                role = "User" if msg.get("role") == "user" else "Assistant"
                lines.append(f"{role}: {msg.get('content', '')}")
            history_section = "\nConversation history:\n" + "\n".join(lines) + "\n"

        return f"""你是 Spectra 教学课件助手。
{history_section}{rag_section}
意图：{intent}
用户问题：{user_message}

请结合教学场景，清晰、专业地回答。
默认使用简体中文。"""


prompt_service = PromptService()
