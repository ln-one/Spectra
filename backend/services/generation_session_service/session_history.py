from __future__ import annotations

from services.ai import ai_service

from .background_tasks import spawn_background_task
from .run_constants import (
    RUN_STATUS_COMPLETED,
    RUN_STATUS_FAILED,
    RUN_STATUS_PENDING,
    RUN_STATUS_PROCESSING,
    RUN_STEP_COMPLETED,
    RUN_STEP_CONFIG,
    RUN_STEP_GENERATE,
    RUN_STEP_MODIFY_SLIDE,
    RUN_STEP_OUTLINE,
    RUN_STEP_PREVIEW,
    RUN_TITLE_SOURCE_AUTO,
    RUN_TITLE_SOURCE_FALLBACK,
    RUN_TITLE_SOURCE_MANUAL,
    RUN_TITLE_SOURCE_PENDING,
    SESSION_TITLE_SOURCE_DEFAULT,
    SESSION_TITLE_SOURCE_FIRST_MESSAGE,
    SESSION_TITLE_SOURCE_MANUAL,
    build_default_session_title,
    build_numbered_default_session_title,
    build_pending_run_title,
    build_run_scope_key,
    resolve_tool_label,
)
from .run_lifecycle import (
    create_session_run,
    get_latest_session_run,
    supports_session_run as _supports_session_run,
    update_session_run,
)
from .run_serialization import (
    build_run_prompt_trace_payload,
    build_run_trace_payload,
    serialize_session_run,
)
from .session_titles import (
    generate_semantic_run_title,
    generate_semantic_session_title,
)

__all__ = [
    "ai_service",
    "RUN_STATUS_COMPLETED",
    "RUN_STATUS_FAILED",
    "RUN_STATUS_PENDING",
    "RUN_STATUS_PROCESSING",
    "RUN_STEP_COMPLETED",
    "RUN_STEP_CONFIG",
    "RUN_STEP_GENERATE",
    "RUN_STEP_MODIFY_SLIDE",
    "RUN_STEP_OUTLINE",
    "RUN_STEP_PREVIEW",
    "RUN_TITLE_SOURCE_AUTO",
    "RUN_TITLE_SOURCE_FALLBACK",
    "RUN_TITLE_SOURCE_MANUAL",
    "RUN_TITLE_SOURCE_PENDING",
    "SESSION_TITLE_SOURCE_DEFAULT",
    "SESSION_TITLE_SOURCE_FIRST_MESSAGE",
    "SESSION_TITLE_SOURCE_MANUAL",
    "_supports_session_run",
    "build_default_session_title",
    "build_numbered_default_session_title",
    "build_pending_run_title",
    "build_run_prompt_trace_payload",
    "build_run_scope_key",
    "build_run_trace_payload",
    "create_session_run",
    "generate_semantic_run_title",
    "generate_semantic_session_title",
    "get_latest_session_run",
    "resolve_tool_label",
    "serialize_session_run",
    "spawn_background_task",
    "update_session_run",
]
