from __future__ import annotations

import logging

from services.database import db_service
from services.generation_session_service.event_store import append_event
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.task_executor.constants import TaskFailureStateReason
from utils.exceptions import APIException

logger = logging.getLogger(__name__)


def _resolve_failure_error_payload(error: Exception) -> tuple[str, str, bool, str]:
    if isinstance(error, APIException):
        error_code = str(error.error_code.value if error.error_code else "").strip()
        message = str(error.message or "").strip()
        retryable = bool(error.retryable)
    else:
        error_code = ""
        message = str(error).strip()
        retryable = False
    if not error_code:
        error_code = "STUDIO_CARD_EXECUTE_FAILED"
    if not message:
        message = "Studio card execution failed."
    state_reason = (
        TaskFailureStateReason.FAILED_UNKNOWN_ERROR.value
        if retryable
        else TaskFailureStateReason.FAILED_PERMANENT_ERROR.value
    )
    return error_code, message, retryable, state_reason


async def append_card_execution_failed_event(
    *,
    card_id: str,
    session_id: str | None,
    run_id: str | None,
    error: Exception,
) -> None:
    if not session_id:
        return

    db_handle = getattr(db_service, "db", None)
    if db_handle is None:
        return

    session_model = getattr(db_handle, "generationsession", None)
    event_model = getattr(db_handle, "sessionevent", None)
    if session_model is None or event_model is None:
        return
    if not hasattr(session_model, "find_unique") or not hasattr(event_model, "create"):
        return

    try:
        session = await session_model.find_unique(where={"id": session_id})
    except Exception as exc:
        logger.warning(
            "Skip studio-card failed event due to session lookup error: %s", exc
        )
        return
    if not session:
        return

    error_code, error_message, retryable, state_reason = _resolve_failure_error_payload(
        error
    )
    payload = {
        "stage": "studio_card_execute",
        "card_id": card_id,
        "run_id": run_id,
        "error_code": error_code,
        "error_message": error_message,
        "retryable": retryable,
    }

    update_payload: dict[str, object] = {
        "state": GenerationState.FAILED.value,
        "stateReason": state_reason,
        "errorCode": error_code,
        "errorMessage": error_message,
        "errorRetryable": retryable,
        "resumable": True,
    }
    if hasattr(session_model, "update"):
        try:
            await session_model.update(
                where={"id": session_id},
                data=update_payload,
            )
        except Exception as exc:
            logger.warning(
                "Skip studio-card failed state sync due to update error: %s",
                exc,
            )

    try:
        await append_event(
            db=db_handle,
            schema_version=1,
            session_id=session_id,
            event_type=GenerationEventType.GENERATION_FAILED.value,
            state=GenerationState.FAILED.value,
            payload=payload,
        )
        await append_event(
            db=db_handle,
            schema_version=1,
            session_id=session_id,
            event_type=GenerationEventType.TASK_FAILED.value,
            state=GenerationState.FAILED.value,
            payload=payload,
        )
        await append_event(
            db=db_handle,
            schema_version=1,
            session_id=session_id,
            event_type=GenerationEventType.STATE_CHANGED.value,
            state=GenerationState.FAILED.value,
            state_reason=state_reason,
            payload=payload,
        )
    except Exception as exc:
        logger.warning("Skip studio-card failed event persistence failure: %s", exc)
