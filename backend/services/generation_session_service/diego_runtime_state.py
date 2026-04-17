from __future__ import annotations

from typing import Any, Optional

from services.generation_session_service.event_store import append_event
from services.generation_session_service.run_lifecycle import update_session_run
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

_SCHEMA_VERSION = 1


async def append_state_changed_event(
    *,
    db,
    session_id: str,
    state: str,
    state_reason: str,
    progress: Optional[int],
    payload: dict[str, Any],
) -> None:
    await append_event(
        db=db,
        schema_version=_SCHEMA_VERSION,
        session_id=session_id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=state,
        state_reason=state_reason,
        progress=progress,
        payload=payload,
    )


async def set_session_state(
    *,
    db,
    session_id: str,
    state: str,
    state_reason: str,
    progress: Optional[int],
    payload: dict[str, Any],
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
    error_retryable: bool = False,
    ppt_url: Optional[str] = None,
) -> None:
    update_payload: dict[str, Any] = {
        "state": state,
        "stateReason": state_reason,
        "errorCode": error_code,
        "errorMessage": error_message,
        "errorRetryable": bool(error_retryable),
        "resumable": True,
    }
    if progress is not None:
        update_payload["progress"] = progress
    if ppt_url is not None:
        update_payload["pptUrl"] = ppt_url
    await db.generationsession.update(
        where={"id": session_id},
        data=update_payload,
    )
    await append_state_changed_event(
        db=db,
        session_id=session_id,
        state=state,
        state_reason=state_reason,
        progress=progress,
        payload=payload,
    )


async def mark_diego_failed(
    *,
    db,
    session_id: str,
    run_id: Optional[str],
    diego_run_id: str,
    error_code: str,
    error_message: str,
    retryable: bool,
) -> None:
    if run_id:
        await update_session_run(
            db=db,
            run_id=run_id,
            status="failed",
            step="generate",
        )
    payload = {
        "stage": "diego",
        "diego_run_id": diego_run_id,
        "error_code": error_code,
        "error_message": error_message,
        "retryable": retryable,
        "run_id": run_id,
    }
    await append_event(
        db=db,
        schema_version=_SCHEMA_VERSION,
        session_id=session_id,
        event_type=GenerationEventType.GENERATION_FAILED.value,
        state=GenerationState.FAILED.value,
        payload=payload,
    )
    await append_event(
        db=db,
        schema_version=_SCHEMA_VERSION,
        session_id=session_id,
        event_type=GenerationEventType.TASK_FAILED.value,
        state=GenerationState.FAILED.value,
        payload=payload,
    )
    await set_session_state(
        db=db,
        session_id=session_id,
        state=GenerationState.FAILED.value,
        state_reason="diego_run_failed",
        progress=None,
        payload=payload,
        error_code=error_code or "DIEGO_RUN_FAILED",
        error_message=error_message,
        error_retryable=retryable,
    )
