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

    return f"""你是 Spectra 教学助教，请与老师自然共创，不要机械应答。
{history_section}{session_section}{rag_section}
意图：{intent}
用户问题：{user_message}

回答要求：
1. 严禁使用机械的 A/B/C 选项格式（例如“请选择 A/B/C”“以下三种方式”）。
2. 优先用自然口吻给出 1-2 个具体教学切入点，而不是罗列模板化选项。
3. 先帮助老师推进下一步，再用一句温和追问收束对话。
4. 回复长度尽量精炼（通常 3-6 句），默认使用简体中文。
5. 输出必须是 Markdown 自然分段；不同信息点请分成独立段落，不要整段堆叠。
6. 使用资料时，必须在相关句末就近插入 `<cite chunk_id="..."></cite>`；未使用资料的句子不要强行加引用。

{CHAT_NATURAL_FEW_SHOT}

请直接给出可执行的助教式回复，不要输出解释你如何作答。"""
