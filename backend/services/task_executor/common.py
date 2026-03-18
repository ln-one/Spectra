"""Shared helpers for task executor workflows."""

import asyncio
import json
import logging
import threading
import uuid
from typing import Awaitable, Callable, Optional, TypeVar

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
    retryable: bool = False,
) -> None:
    """Keep session terminal state aligned with task terminal state."""
    if not session_id:
        return

    cursor = str(uuid.uuid4())
    if state == "SUCCESS":
        session_data = {
            "state": "SUCCESS",
            "pptUrl": (output_urls or {}).get("pptx"),
            "wordUrl": (output_urls or {}).get("docx"),
            "progress": 100,
            "errorCode": None,
            "errorMessage": None,
            "errorRetryable": False,
            "resumable": True,
        }
        payload = {"task_id": task_id, "output_urls": output_urls or {}}
    else:
        session_data = {
            "state": "FAILED",
            "errorCode": "TASK_EXECUTION_FAILED",
            "errorMessage": error_message,
            "errorRetryable": retryable,
            "resumable": True,
        }
        payload = {"task_id": task_id, "error": error_message, "retryable": retryable}

    await db_service.db.generationsession.update(
        where={"id": session_id},
        data=session_data,
    )
    await db_service.db.sessionevent.create(
        data={
            "sessionId": session_id,
            "eventType": "state.changed",
            "state": state,
            "stateReason": state_reason,
            "progress": 100 if state == "SUCCESS" else None,
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
