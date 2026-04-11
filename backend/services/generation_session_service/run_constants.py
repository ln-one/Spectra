from __future__ import annotations

from typing import Optional

SESSION_TITLE_SOURCE_DEFAULT = "default"
SESSION_TITLE_SOURCE_FIRST_MESSAGE = "first_message"
SESSION_TITLE_SOURCE_MANUAL = "manual"

RUN_TITLE_SOURCE_PENDING = "pending"
RUN_TITLE_SOURCE_AUTO = "auto"
RUN_TITLE_SOURCE_MANUAL = "manual"
RUN_TITLE_SOURCE_FALLBACK = "fallback"

RUN_STATUS_PENDING = "pending"
RUN_STATUS_PROCESSING = "processing"
RUN_STATUS_COMPLETED = "completed"
RUN_STATUS_FAILED = "failed"

RUN_STEP_CONFIG = "config"
RUN_STEP_OUTLINE = "outline"
RUN_STEP_GENERATE = "generate"
RUN_STEP_PREVIEW = "preview"
RUN_STEP_MODIFY_SLIDE = "modify_slide"
RUN_STEP_COMPLETED = "completed"

_RUN_TOOL_LABELS = {
    "ppt_generate": "PPT生成",
    "word_generate": "Word生成",
    "both_generate": "课件生成",
    "outline_redraft": "大纲重写",
    "slide_modify": "单页修改",
}

_STUDIO_CARD_LABELS = {
    "courseware_ppt": "课件生成",
    "word_document": "讲义文档",
    "interactive_quick_quiz": "随堂小测",
    "interactive_games": "互动游戏",
    "classroom_qa_simulator": "课堂问答模拟",
    "speaker_notes": "讲稿备注",
    "knowledge_mindmap": "知识导图",
    "demonstration_animations": "演示动画",
}


def build_default_session_title(session_id: Optional[str] = None) -> str:
    if session_id:
        return f"会话-{str(session_id)[-6:]}"
    return "新建会话"


def build_numbered_default_session_title(sequence_no: int) -> str:
    normalized = max(1, int(sequence_no or 1))
    return f"新建会话{normalized}"


def build_run_scope_key(*, session_id: Optional[str], project_id: str) -> str:
    return f"session:{session_id}" if session_id else f"project:{project_id}"


def resolve_tool_label(tool_type: str) -> str:
    normalized = str(tool_type or "").strip()
    if normalized.startswith("studio_card:"):
        card_id = normalized.split(":", 1)[1]
        return _STUDIO_CARD_LABELS.get(card_id, card_id)
    return _RUN_TOOL_LABELS.get(normalized, normalized)


def build_pending_run_title(run_no: int, tool_type: str) -> str:
    return f"第{run_no}次{resolve_tool_label(tool_type)}"
