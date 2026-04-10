from __future__ import annotations

import asyncio
import json
import logging
from typing import Awaitable, Callable, Optional

from schemas.generation import TaskStatus
from services.generation_session_service.session_history import (
    RUN_STATUS_FAILED,
    RUN_STEP_GENERATE,
    build_run_trace_payload,
    update_session_run,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.task_executor.constants import (
    TaskExecutionErrorCode,
    TaskFailureStateReason,
)

logger = logging.getLogger(__name__)


async def _load_task_run_payload(db, task_id: str) -> dict | None:
    task_actions = getattr(db, "generationtask", None)
    if task_actions is None:
        return None

    find_unique = getattr(task_actions, "find_unique", None)
    find_first = getattr(task_actions, "find_first", None)

    if callable(find_unique):
        task = await find_unique(where={"id": task_id})
    elif callable(find_first):
        task = await find_first(where={"id": task_id})
    else:
        return None

    raw = getattr(task, "inputData", None) if task else None
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict) or not parsed.get("run_id"):
        return None
    return {
        "run_id": parsed.get("run_id"),
        "run_no": parsed.get("run_no"),
        "run_title": parsed.get("run_title"),
        "tool_type": parsed.get("tool_type"),
    }


def schedule_enqueued_task_watchdog(
    *,
    db,
    session_id: str,
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict],
    rq_job_id: str,
    task_queue_service,
    mark_dispatch_failed: Callable[..., Awaitable[None]],
) -> None:
    async def _watch() -> None:
        await asyncio.sleep(2)
        try:
            job_status = await asyncio.to_thread(
                task_queue_service.get_job_status,
                rq_job_id,
            )
        except Exception as exc:
            logger.warning(
                "Task watchdog failed to read RQ status: task=%s job=%s error=%s",
                task_id,
                rq_job_id,
                exc,
            )
            return

        if not job_status or job_status.get("status") != TaskStatus.FAILED:
            return

        task = await db.generationtask.find_unique(where={"id": task_id})
        if task is None or task.status != TaskStatus.PENDING:
            return

        exc_info = job_status.get("exc_info")
        enqueue_error = exc_info if isinstance(exc_info, str) else str(exc_info)
        await mark_dispatch_failed(
            session_id=session_id,
            task_id=task_id,
            error_message=(
                "RQ job failed before execution: " f"{(enqueue_error or '')[:400]}"
            ),
        )

    asyncio.create_task(_watch())


async def mark_dispatch_failed(
    *,
    db,
    session_id: str,
    task_id: str,
    error_message: str,
    append_event: Callable[..., Awaitable[None]],
) -> None:
    run_payload = await _load_task_run_payload(db, task_id)
    await db.generationtask.update(
        where={"id": task_id},
        data={"status": TaskStatus.FAILED, "errorMessage": error_message},
    )
    await db.generationsession.update(
        where={"id": session_id},
        data={
            "state": GenerationState.FAILED.value,
            "stateReason": TaskFailureStateReason.DISPATCH_FAILED.value,
            "errorCode": TaskExecutionErrorCode.DISPATCH_FAILED.value,
            "errorMessage": error_message,
            "errorRetryable": True,
            "resumable": True,
        },
    )
    if run_payload and run_payload.get("run_id"):
        await update_session_run(
            db=db,
            run_id=run_payload["run_id"],
            status=RUN_STATUS_FAILED,
            step=RUN_STEP_GENERATE,
        )
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=GenerationState.FAILED.value,
        state_reason=TaskFailureStateReason.DISPATCH_FAILED.value,
        payload=build_run_trace_payload(
            run_payload,
            task_id=task_id,
            error=error_message,
            run_status=RUN_STATUS_FAILED if run_payload else None,
            run_step=RUN_STEP_GENERATE if run_payload else None,
        ),
    )
