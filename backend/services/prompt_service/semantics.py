"""Formal prompt-building semantics shared across prompt workflows."""

from __future__ import annotations

from enum import Enum
from typing import Optional

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
        prefix = "\n参考资料（按相关度排序）：\n"
        suffix = "\n"
    else:
        instruction = "如引用资料，请在句末标注来源编号（如：[来源1]）。"
        prefix = "\n以下为从项目资料检索到的参考资料，请优先利用高相关度内容。\n"
        suffix = "\n\n"

    return prefix + instruction + "\n\n" + format_rag_context(rag_context) + suffix


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
        lines.append(f"{role}: {msg.get('content', '')}")
    return "\nConversation history:\n" + "\n".join(lines) + "\n"


def build_session_scope_section(session_id: Optional[str]) -> str:
    if not session_id:
        return ""
    return (
        f"\n当前会话：session_id={session_id}\n"
        "请仅基于该会话上下文进行回复与引用，不要混入其他会话信息。\n"
    )


def output_block_marker(block: PromptOutputBlock, *, start: bool) -> str:
    markers = PROMPT_OUTPUT_MARKERS[block]
    return markers[0] if start else markers[1]
