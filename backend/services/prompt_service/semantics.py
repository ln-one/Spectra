"""Formal prompt-building semantics shared across prompt workflows."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from .escaping import escape_prompt_text
from .rag import format_rag_context


class PromptCitationStyle(str, Enum):
    INLINE_CITE_TAG = "inline_cite_tag"
    SOURCE_INDEX = "source_index"


class PromptOutputBlock(str, Enum):
    PPT_CONTENT = "PPT_CONTENT"
    LESSON_PLAN = "LESSON_PLAN"


PROMPT_OUTPUT_MARKERS: dict[PromptOutputBlock, tuple[str, str]] = {
    PromptOutputBlock.PPT_CONTENT: (
        "===PPT_CONTENT_START===",
        "===PPT_CONTENT_END===",
    ),
    PromptOutputBlock.LESSON_PLAN: (
        "===LESSON_PLAN_START===",
        "===LESSON_PLAN_END===",
    ),
}


def build_rag_reference_section(
    rag_context: Optional[list[dict]],
    *,
    citation_style: PromptCitationStyle,
) -> str:
    if not rag_context:
        return ""

    if citation_style == PromptCitationStyle.INLINE_CITE_TAG:
        instruction = (
            '若使用资料内容，请在对应句末插入 <cite chunk_id="..."></cite> 标签。'
        )
        prefix = "\n<retrieved_references>\n参考资料（按相关度排序）：\n"
        suffix = "\n</retrieved_references>\n"
    else:
        instruction = "如引用资料，请在句末标注来源编号（如：[来源1]）。"
        prefix = "\n<retrieved_references>\n以下为从项目资料检索到的参考资料：\n"
        suffix = "\n</retrieved_references>\n\n"

    return (
        prefix
        + "<reference_usage_rules>\n"
        + instruction
        + "\n优先利用高相关度内容；当前作用域更贴近的资料优先于远端资料；不要把低相关材料硬塞进回答。\n"
        + "</reference_usage_rules>\n\n"
        + format_rag_context(rag_context)
        + suffix
    )


def build_conversation_history_section(
    conversation_history: Optional[list[dict]],
    *,
    limit: int = 5,
) -> str:
    if not conversation_history:
        return ""

    lines: list[str] = []
    for msg in conversation_history[-limit:]:
        role = "User" if msg.get("role") == "user" else "Assistant"
        lines.append(
            '  <message role="'
            f"{role.lower()}"
            '">'
            f"{escape_prompt_text(msg.get('content', ''))}"
            "</message>"
        )
    return (
        "\n<conversation_history>\n" + "\n".join(lines) + "\n</conversation_history>\n"
    )


def build_session_scope_section(session_id: Optional[str]) -> str:
    if not session_id:
        return ""
    return (
        "\n<session_scope>\n"
        f"  <session_id>{escape_prompt_text(session_id)}</session_id>\n"
        "  <legacy_session_label>"
        f"session_id={escape_prompt_text(session_id)}"
        "</legacy_session_label>\n"
        "  <scope_rule>"
        "请仅基于该会话上下文进行回复与引用，不要混入其他会话信息。"
        "</scope_rule>\n"
        "</session_scope>\n"
    )


def output_block_marker(block: PromptOutputBlock, *, start: bool) -> str:
    markers = PROMPT_OUTPUT_MARKERS[block]
    return markers[0] if start else markers[1]
