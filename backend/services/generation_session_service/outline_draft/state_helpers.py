from __future__ import annotations

import logging
from typing import Awaitable, Callable, Optional

from services.generation_session_service.constants import (
    OutlineGenerationErrorCode,
    OutlineChangeReason,
    OutlineGenerationStateReason,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

from .runtime_helpers import persist_outline_version

logger = logging.getLogger(__name__)


async def persist_outline_success(
    *, db, session_id: str, outline_doc: dict, outline_version: int
) -> None:
    outline_doc = dict(outline_doc or {})
    outline_doc["version"] = outline_version
    await persist_outline_version(
        db=db,
        session_id=session_id,
        outline_version=outline_version,
        outline_doc=outline_doc,
        change_reason=OutlineChangeReason.DRAFTED_ASYNC.value,
    )
    await db.generationsession.update(
        where={"id": session_id},
        data={
            "state": GenerationState.AWAITING_OUTLINE_CONFIRM.value,
            "stateReason": OutlineGenerationStateReason.DRAFTED_ASYNC.value,
            "currentOutlineVersion": outline_version,
        },
    )


async def emit_outline_success(
    append_event: Callable[..., Awaitable[None]],
    *,
    session_id: str,
    trace_id: str,
    outline_version: int,
    stage_timings_ms: Optional[dict] = None,
    run_id: Optional[str] = None,
    traceability_payload: Optional[dict] = None,
) -> None:
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.OUTLINE_COMPLETED.value,
        state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        progress=100,
        payload={
            "version": outline_version,
            "change_reason": OutlineChangeReason.DRAFTED_ASYNC.value,
            "trace_id": trace_id,
            "run_id": run_id,
            "stage_timings_ms": stage_timings_ms or {},
        },
    )
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.OUTLINE_UPDATED.value,
        state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        progress=100,
        payload={
            "version": outline_version,
            "change_reason": OutlineChangeReason.DRAFTED_ASYNC.value,
            "trace_id": trace_id,
            "run_id": run_id,
            "stage_timings_ms": stage_timings_ms or {},
            **(traceability_payload or {}),
        },
    )
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        state_reason=OutlineGenerationStateReason.DRAFTED_ASYNC.value,
        payload={
            "trace_id": trace_id,
            "run_id": run_id,
            "stage_timings_ms": stage_timings_ms or {},
            **(traceability_payload or {}),
        },
    )


async def is_concurrently_completed(db, session_id: str, trace_id: str) -> bool:
    try:
        latest = await db.generationsession.find_unique(where={"id": session_id})
        if latest:
            latest_state = (
                latest.get("state") if isinstance(latest, dict) else latest.state
            )
            latest_outline_version = (
                latest.get("currentOutlineVersion")
                if isinstance(latest, dict)
                else latest.currentOutlineVersion
            )
            if (
                latest_state == GenerationState.AWAITING_OUTLINE_CONFIRM.value
                and (latest_outline_version or 0) >= 1
            ):
                logger.info(
                    "Outline draft failure ignored due to concurrent completion: "
                    "session=%s trace_id=%s",
                    session_id,
                    trace_id,
                )
                return True
    except Exception as exc:
        logger.debug(
            "Outline concurrent completion probe failed: "
            "session=%s trace_id=%s error=%s",
            session_id,
            trace_id,
            exc,
        )
    return False


async def emit_outline_failure(
    append_event: Callable[..., Awaitable[None]],
    *,
    session_id: str,
    error_code: str,
    error_message: str,
    trace_id: str,
    run_id: Optional[str] = None,
    traceability_payload: Optional[dict] = None,
) -> None:
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.GENERATION_FAILED.value,
        state=GenerationState.DRAFTING_OUTLINE.value,
        payload={
            "stage": "outline_draft",
            "error_code": error_code,
            "error_message": error_message,
            "retryable": True,
            "trace_id": trace_id,
            "run_id": run_id,
        },
    )
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.TASK_FAILED.value,
        state=GenerationState.DRAFTING_OUTLINE.value,
        payload={
            "stage": "outline_draft",
            "error_code": error_code,
            "error_message": error_message,
            "retryable": True,
            "trace_id": trace_id,
            "run_id": run_id,
            **(traceability_payload or {}),
        },
    )


async def persist_outline_failure_fallback(
    *,
    db,
    session_id: str,
    error_code: str,
    error_message: str,
    failure_state_reason: str,
) -> None:
    retryable = error_code in {
        OutlineGenerationErrorCode.TIMEOUT.value,
        OutlineGenerationErrorCode.FAILED.value,
    }
    await db.generationsession.update(
        where={"id": session_id},
        data={
            "state": GenerationState.FAILED.value,
            "stateReason": failure_state_reason,
            "errorCode": error_code,
            "errorMessage": error_message,
            "errorRetryable": retryable,
        },
    )


async def emit_outline_failure_state(
    append_event: Callable[..., Awaitable[None]],
    *,
    session_id: str,
    trace_id: str,
    failure_state_reason: str,
    run_id: Optional[str] = None,
    traceability_payload: Optional[dict] = None,
) -> None:
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=GenerationState.FAILED.value,
        state_reason=failure_state_reason,
        payload={
            "trace_id": trace_id,
            "run_id": run_id,
            **(traceability_payload or {}),
        },
    )
