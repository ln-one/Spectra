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
            content = content[:_RAG_CHUNK_MAX_CHARS] + "...(truncated)"
        sections.append(f"[Ref {i}] ({filename}, relevance={score:.0%})\n{content}")
    return "\n\n".join(sections)


STYLE_REQUIREMENTS = {
    "default": "Clean and readable educational layout.",
    "gaia": "Modern minimalist design with strong visual hierarchy.",
    "uncover": "Dynamic presentation style with progressive disclosure.",
    "academic": "Formal academic style with rigorous structure.",
}


COURSEWARE_FEW_SHOT = """
Example output (truncated):

===PPT_CONTENT_START===
# Topic Title
Subtitle

---

# Learning Objectives
- Objective A
- Objective B
===PPT_CONTENT_END===

===LESSON_PLAN_START===
# Teaching Objectives
- Knowledge
- Skills
- Attitude
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
                "\nThe following references are retrieved from project materials. "
                "Prioritize higher relevance references and cite source index "
                "when helpful:\n\n"
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

        return f"""You are an expert instructional designer.
Generate complete courseware content for this requirement.
{rag_section}
Requirement: {user_requirements}
Template style: {template_style} - {style_instruction}
Language: Simplified Chinese unless user explicitly requests another language.

Output format:

===PPT_CONTENT_START===
(Marp markdown slides)
Rules:
{ppt_constraints}
  Never include marker tokens
  (PPT_CONTENT_START/END, LESSON_PLAN_START/END) in slide body.
===PPT_CONTENT_END===

===LESSON_PLAN_START===
(Detailed lesson plan markdown)
Rules:
1. Include objectives, key points, difficult points.
2. Include staged teaching process and timing.
3. Include board plan and homework.
===LESSON_PLAN_END===

{COURSEWARE_FEW_SHOT}

Return strictly with marker blocks above."""

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

        return f"""You are an expert instructional designer.
Modify the courseware content according to instruction.

Current content:
{current_content}

Instruction:
{instruction}{target_info}

Requirements:
1. Keep unchanged parts intact.
2. Preserve Marp markdown format and separators.
3. Return full modified markdown."""

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
                "\nReferences (sorted by relevance):\n"
                f"{_format_rag_context(rag_context)}\n"
            )

        history_section = ""
        if conversation_history:
            lines: list[str] = []
            for msg in conversation_history[-5:]:
                role = "User" if msg.get("role") == "user" else "Assistant"
                lines.append(f"{role}: {msg.get('content', '')}")
            history_section = "\nConversation history:\n" + "\n".join(lines) + "\n"

        return f"""You are Spectra AI assistant for educational courseware.
{history_section}{rag_section}
Intent: {intent}
User message: {user_message}

Respond clearly and professionally in educational context,
in Simplified Chinese by default."""


prompt_service = PromptService()
