"""Chat-oriented prompt helpers."""

from __future__ import annotations

import re
from typing import Optional

from .constants import CHAT_NATURAL_FEW_SHOT
from .semantics import (
    PromptCitationStyle,
    build_conversation_history_section,
    build_rag_reference_section,
    build_session_scope_section,
)

_MECHANICAL_OPTION_PATTERNS = [
    r"请选择\s*[A-Za-zＡ-Ｚａ-ｚ]([/\-、,，\s]*[A-Za-zＡ-Ｚａ-ｚ])+",
    r"你可以选择\s*[A-Za-zＡ-Ｚａ-ｚ]([/\-、,，\s]*[A-Za-zＡ-Ｚａ-ｚ])+",
    r"请选择以下[三3]种方式",
    r"下面给你[三3]个选项",
    r"[A-Za-zＡ-Ｚａ-ｚ][\s）\)]*[:：].*\n[A-Za-zＡ-Ｚａ-ｚ][\s）\)]*[:：]",
]


def contains_mechanical_option_pattern(text: str) -> bool:
    """Detect rigid option-list phrasing such as '请选择 A/B/C'."""
    if not text:
        return False
    compact = text.strip()
    return any(
        re.search(pattern, compact, flags=re.IGNORECASE)
        for pattern in _MECHANICAL_OPTION_PATTERNS
    )


def build_chat_response_prompt(
    user_message: str,
    intent: str,
    session_id: Optional[str] = None,
    rag_context: Optional[list[dict]] = None,
    conversation_history: Optional[list[dict]] = None,
) -> str:
    """Build prompt for general chat responses."""
    rag_section = build_rag_reference_section(
        rag_context, citation_style=PromptCitationStyle.INLINE_CITE_TAG
    )
    history_section = build_conversation_history_section(conversation_history)
    session_section = build_session_scope_section(session_id)

    return f"""你是 Spectra 教学助教。你的任务是与老师自然共创，帮助老师推进教学设计，而不是机械应答。

<task_context>
  <intent>{intent}</intent>
  <teacher_message>{user_message}</teacher_message>
</task_context>
{history_section}{session_section}{rag_section}
<response_contract>
1. 严禁使用机械的 A/B/C 选项格式（例如“请选择 A/B/C”“以下三种方式”）。
2. 优先直接回应老师此刻最需要推进的问题，先给 1-2 个具体切入点，再决定是否追问。
3. 如果信息不足，只补一条最必要、最具体的追问；不要连续追问多个空泛问题。
4. 如果引用资料，必须在相关句末就近插入 `<cite chunk_id="..."></cite>`；未使用资料的句子不要强行加引用。
5. 如果资料不足以支撑结论，明确按教学常识给出建议，不要伪造“资料里写了什么”。
6. 回复长度尽量精炼（通常 3-6 句），默认使用简体中文。
7. 输出必须是 Markdown 自然分段；不同信息点分成独立段落，不要整段堆叠。
8. 优先给出老师下一步可直接使用的表达、讲法或组织方式，而不是抽象原则。
</response_contract>

<good_style_examples>
{CHAT_NATURAL_FEW_SHOT}
</good_style_examples>

请直接输出助教式回复正文，不要解释你的推理过程，不要重复这些规则。"""
