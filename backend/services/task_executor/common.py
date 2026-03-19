"""Shared helpers for task executor workflows."""

import asyncio
import json
import logging
import threading
import uuid
from typing import Awaitable, Callable, Optional, TypeVar

from schemas.generation import build_session_output_fields
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

from .constants import TaskExecutionErrorCode

logger = logging.getLogger(__name__)
T = TypeVar("T")

RETRYABLE_ERRORS = (
    ConnectionError,
    TimeoutError,
    OSError,
)


async def sync_session_terminal_state(
    db_service,
    task_id: str,
    session_id: Optional[str],
    state: str,
    state_reason: str,
    output_urls: Optional[dict] = None,
    error_message: Optional[str] = None,
    error_code: Optional[str] = None,
    retryable: bool = False,
) -> None:
    """Keep session terminal state aligned with task terminal state."""
    if not session_id:
        return

    cursor = str(uuid.uuid4())
    if state == GenerationState.SUCCESS.value:
        output_fields = build_session_output_fields(output_urls)
        session_data = {
            "state": GenerationState.SUCCESS.value,
            "progress": 100,
            "errorCode": None,
            "errorMessage": None,
            "errorRetryable": False,
            "resumable": True,
        }
        session_data.update(output_fields)
        payload = {"task_id": task_id, "output_urls": output_urls or {}}
    else:
        session_data = {
            "state": GenerationState.FAILED.value,
            "errorCode": error_code or TaskExecutionErrorCode.FAILED.value,
            "errorMessage": error_message,
            "errorRetryable": retryable,
            "resumable": True,
        }
        payload = {
            "task_id": task_id,
            "error": error_message,
            "error_code": error_code or TaskExecutionErrorCode.FAILED.value,
            "retryable": retryable,
        }

    await db_service.db.generationsession.update(
        where={"id": session_id},
        data=session_data,
    )
    await db_service.db.sessionevent.create(
        data={
            "sessionId": session_id,
            "eventType": GenerationEventType.STATE_CHANGED.value,
            "state": state,
            "stateReason": state_reason,
            "progress": 100 if state == GenerationState.SUCCESS.value else None,
            "cursor": cursor,
            "payload": json.dumps(payload),
            "schemaVersion": 1,
        }
    )
    await db_service.db.generationsession.update(
        where={"id": session_id},
        data={"lastCursor": cursor},
    )


def run_async_entrypoint(coro_factory: Callable[[], Awaitable[T]]) -> T:
    """Execute async entrypoint safely when an event loop may already be running."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro_factory())

    result_box: dict[str, T] = {}
    error_box: list[BaseException] = []

    def thread_target() -> None:
        try:
            result_box["value"] = asyncio.run(coro_factory())
        except BaseException as exc:  # noqa: BLE001
            error_box.append(exc)

    runner = threading.Thread(target=thread_target, name="rq-async-wrapper")
    runner.start()
    runner.join()

    if error_box:
        raise error_box[0]

    return result_box["value"]
