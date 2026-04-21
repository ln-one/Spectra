"""Chat-oriented prompt helpers."""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from .constants import CHAT_NATURAL_FEW_SHOT
from .escaping import escape_prompt_text
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


def _build_teaching_brief_protocol_section(
    teaching_brief_context: dict[str, Any] | None,
) -> str:
    if not teaching_brief_context:
        return ""

    status = str(teaching_brief_context.get("status") or "draft").strip() or "draft"
    can_generate = bool(teaching_brief_context.get("can_generate"))
    missing_fields = list(teaching_brief_context.get("missing_fields") or [])
    current_brief = dict(teaching_brief_context.get("brief") or {})
    recent_evidence = dict(teaching_brief_context.get("recent_evidence") or {})

    protocol_parts = [
        "你当前必须把教学需求单当作本轮会话的前置工作面，而不是可有可无的补充信息。",
        "优先围绕教学需求单推进对话，再考虑是否进入课件生成建议。",
        "追问前必须同时检查 current_brief、recent_requirement_evidence 和 conversation_history；老师已经说过的信息不要重复追问。",
    ]
    if status == "confirmed":
        protocol_parts.extend(
            [
                "教学需求单已确认，不要继续主动追问新的需求字段。",
                "如果老师提出新的修改意图，提醒这会使已确认需求单失效，需要重新确认。",
                "可以提示老师教学需求已确认完成，可以开始生成课件。",
                "如果老师明确表示“开始吧 / 按这个来 / 合理，开始生成”，只简短确认系统将启动课件生成流程；不要在聊天正文里继续输出逐页 PPT 文本、完整 PPT 文案或 Markdown 幻灯片。",
            ]
        )
    elif can_generate:
        protocol_parts.extend(
            [
                "当前需求字段已齐备，但需求单尚未确认。",
                "本轮应主动生成一段老师可读的需求总结，列出已收集到的关键信息。",
                "你必须明确询问“这些信息是否准确？如果没问题，我会标记需求单为已确认”。",
                "如果老师明确表示“开始吧 / 按这个来 / 合理，开始生成”，只简短确认系统将确认需求并启动课件生成流程；不要在聊天正文里继续输出逐页 PPT 文本、完整 PPT 文案或 Markdown 幻灯片。",
            ]
        )
    else:
        protocol_parts.extend(
            [
                "你的首要任务是帮助老师逐步完善教学需求单。",
                "每轮回复末尾最多追问 missing_fields 中当前最紧迫且最近对话尚未回答的 1 个字段，不要一次追问多个散乱问题。",
                "如果某个 missing_fields 字段已出现在 recent_requirement_evidence 中，先把它当作临时已回答事实，不要再次追问该字段。",
                "不要直接建议“开始生成 PPT”或“现在生成课件”，除非 missing_fields 已为空。",
            ]
        )
        if not any(
            current_brief.get(field_name)
            for field_name in (
                "topic",
                "audience",
                "knowledge_points",
                "duration_minutes",
                "lesson_hours",
                "target_pages",
            )
        ):
            protocol_parts.extend(
                [
                    "如果当前需求单几乎为空，优先自然引导老师说出教学主题、受众、课时或页数中的一个基础锚点。",
                    "问题要像助教对话，不要问成表单。",
                ]
            )

    current_brief_json = escape_prompt_text(
        json.dumps(current_brief, ensure_ascii=False, indent=2)
    )
    missing_fields_json = escape_prompt_text(
        json.dumps(missing_fields, ensure_ascii=False)
    )
    recent_evidence_json = escape_prompt_text(
        json.dumps(recent_evidence, ensure_ascii=False, indent=2)
    )
    behavior_rules = escape_prompt_text(
        "\n".join(f"- {part}" for part in protocol_parts)
    )

    return f"""
<teaching_brief_protocol status="{escape_prompt_text(status)}" can_generate="{str(can_generate).lower()}">
  <current_brief>{current_brief_json}</current_brief>
  <missing_fields>{missing_fields_json}</missing_fields>
  <recent_requirement_evidence>{recent_evidence_json}</recent_requirement_evidence>
  <behavior_rules>
{behavior_rules}
  </behavior_rules>
</teaching_brief_protocol>
"""


def build_chat_response_prompt(
    user_message: str,
    intent: str,
    session_id: Optional[str] = None,
    rag_context: Optional[list[dict]] = None,
    conversation_history: Optional[list[dict]] = None,
    teaching_brief_context: Optional[dict[str, Any]] = None,
) -> str:
    """Build prompt for general chat responses."""
    rag_section = build_rag_reference_section(
        rag_context, citation_style=PromptCitationStyle.INLINE_CITE_TAG
    )
    history_section = build_conversation_history_section(conversation_history)
    session_section = build_session_scope_section(session_id)
    teaching_brief_section = _build_teaching_brief_protocol_section(
        teaching_brief_context
    )

    return f"""你是 Spectra 教学助教。你的任务是与老师自然共创，帮助老师推进教学设计，而不是机械应答。

<task_context>
  <intent>{escape_prompt_text(intent)}</intent>
  <teacher_message>{escape_prompt_text(user_message)}</teacher_message>
</task_context>
{history_section}{session_section}{rag_section}{teaching_brief_section}
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
