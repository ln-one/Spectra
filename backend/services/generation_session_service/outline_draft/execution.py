from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from typing import Awaitable, Callable, Optional

from services.ai import ai_service
from services.generation_session_service.constants import (
    OutlineGenerationErrorCode,
    OutlineGenerationStateReason,
)
from services.generation_session_service.outline_draft.runtime_helpers import (
    generate_outline_doc,
)
from services.generation_session_service.outline_draft.state_helpers import (
    emit_outline_failure,
    emit_outline_failure_state,
    emit_outline_success,
    is_concurrently_completed,
    persist_outline_failure_fallback,
    persist_outline_success,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

logger = logging.getLogger(__name__)

_generate_outline_doc = generate_outline_doc


def _outline_draft_timeout_seconds() -> float:
    raw = os.getenv("OUTLINE_DRAFT_TIMEOUT_SECONDS")
    if raw is None or not str(raw).strip():
        raw = os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "90")
    raw = str(raw).strip()
    try:
        parsed = float(raw)
        return parsed if parsed > 0 else 90.0
    except ValueError:
        return 90.0


def _classify_outline_failure(exc: Exception) -> tuple[str, str, str]:
    if isinstance(exc, TimeoutError):
        return (
            OutlineGenerationErrorCode.TIMEOUT.value,
            "大纲生成超时，请稍后重试。",
            OutlineGenerationStateReason.TIMED_OUT_FALLBACK_EMPTY.value,
        )
    return (
        OutlineGenerationErrorCode.FAILED.value,
        "大纲生成失败，请稍后重试。",
        OutlineGenerationStateReason.FAILED_FALLBACK_EMPTY.value,
    )


async def execute_outline_draft_local(
    *,
    db,
    session_id: str,
    project_id: str,
    options: Optional[dict],
    append_event: Callable[..., Awaitable[None]],
    ai_service_obj=ai_service,
    trace_id: Optional[str] = None,
) -> None:
    trace_id = trace_id or str(uuid.uuid4())
    next_outline_version = 1
    stage_timings_ms: dict[str, float] = {}
    try:
        session = await db.generationsession.find_unique(where={"id": session_id})
        if not session:
            logger.warning(
                "Outline draft skipped because session not found: session=%s",
                session_id,
            )
            return

        state = session.get("state") if isinstance(session, dict) else session.state
        current_outline_version = (
            session.get("currentOutlineVersion")
            if isinstance(session, dict)
            else session.currentOutlineVersion
        )
        if state != GenerationState.DRAFTING_OUTLINE.value:
            logger.info(
                "Outline draft skipped due to non-drafting session state: "
                "session=%s state=%s current_outline_version=%s",
                session_id,
                state,
                current_outline_version,
            )
            return
        next_outline_version = max(int(current_outline_version or 0), 0) + 1

        await _emit_outline_progress(append_event, session_id, trace_id)
        outline_started_at = time.perf_counter()
        outline_doc = await asyncio.wait_for(
            generate_outline_doc(
                db=db,
                session_id=session_id,
                project_id=project_id,
                options=options,
                ai_service_obj=ai_service_obj,
            ),
            timeout=_outline_draft_timeout_seconds(),
        )
        stage_timings_ms["outline_total_ms"] = round(
            (time.perf_counter() - outline_started_at) * 1000,
            2,
        )
        stage_timings_ms["requirements_build_ms"] = round(
            float(outline_doc.pop("_requirements_build_ms", 0.0)),
            2,
        )
        stage_timings_ms["rag_context_ms"] = round(
            float(outline_doc.pop("_rag_context_ms", 0.0)),
            2,
        )
        stage_timings_ms["outline_llm_ms"] = round(
            float(outline_doc.pop("_outline_llm_ms", 0.0)),
            2,
        )
        persist_started_at = time.perf_counter()
        await persist_outline_success(
            db=db,
            session_id=session_id,
            outline_doc=outline_doc,
            outline_version=next_outline_version,
        )
        stage_timings_ms["persist_outline_ms"] = round(
            (time.perf_counter() - persist_started_at) * 1000,
            2,
        )
        await emit_outline_success(
            append_event,
            session_id=session_id,
            trace_id=trace_id,
            outline_version=next_outline_version,
            stage_timings_ms=stage_timings_ms,
        )
        logger.info(
            "outline_draft_stage_timing",
            extra={
                "session_id": session_id,
                "trace_id": trace_id,
                "stage_timings_ms": stage_timings_ms,
            },
        )
    except Exception as draft_err:
        if await is_concurrently_completed(db, session_id, trace_id):
            return

        error_code, error_message, failure_state_reason = _classify_outline_failure(
            draft_err
        )

        logger.error(
            "Outline draft failed: session=%s trace_id=%s error_code=%s error=%s",
            session_id,
            trace_id,
            error_code,
            draft_err,
            exc_info=True,
        )
        await emit_outline_failure(
            append_event,
            session_id=session_id,
            error_code=error_code,
            error_message=error_message,
            trace_id=trace_id,
        )
        await persist_outline_failure_fallback(
            db=db,
            session_id=session_id,
            project_id=project_id,
            options=options,
            failure_state_reason=failure_state_reason,
            outline_version=next_outline_version,
        )
        await emit_outline_failure_state(
            append_event,
            session_id=session_id,
            trace_id=trace_id,
            failure_state_reason=failure_state_reason,
            outline_version=next_outline_version,
        )


async def _emit_outline_progress(append_event, session_id: str, trace_id: str) -> None:
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.PROGRESS_UPDATED.value,
        state=GenerationState.DRAFTING_OUTLINE.value,
        progress=15,
        payload={"stage": "outline_draft", "trace_id": trace_id},
    )
