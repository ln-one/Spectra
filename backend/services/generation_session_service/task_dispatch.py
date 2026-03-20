from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, Optional

from schemas.generation import TaskStatus
from services.generation_session_service.constants import (
    DispatchFallbackReason,
    DispatchMode,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.task_executor.constants import (
    TaskExecutionErrorCode,
    TaskFailureStateReason,
)

logger = logging.getLogger(__name__)


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
    schedule_local_execution: Callable[..., Awaitable[bool]],
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
        scheduled = await schedule_local_execution(
            session_id=session_id,
            task_id=task_id,
            project_id=project_id,
            task_type=task_type,
            template_config=template_config,
            fallback_reason=DispatchFallbackReason.RQ_JOB_FAILED.value,
            enqueue_error=(enqueue_error or "")[:400],
        )
        if not scheduled:
            await mark_dispatch_failed(
                session_id=session_id,
                task_id=task_id,
                error_message="RQ job failed and local fallback scheduling failed",
            )

    asyncio.create_task(_watch())


async def schedule_local_execution(
    *,
    session_id: str,
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict],
    fallback_reason: str,
    append_event: Callable[..., Awaitable[None]],
    enqueue_error: Optional[str] = None,
) -> bool:
    try:
        from services.task_executor import execute_generation_task

        asyncio.create_task(
            execute_generation_task(
                task_id=task_id,
                project_id=project_id,
                task_type=task_type,
                template_config=template_config,
            )
        )
        logger.warning(
            "Session task fallback to local async execution:"
            " session=%s task=%s reason=%s",
            session_id,
            task_id,
            fallback_reason,
        )
        try:
            await append_event(
                session_id=session_id,
                event_type=GenerationEventType.STATE_CHANGED.value,
                state=GenerationState.GENERATING_CONTENT.value,
                state_reason=fallback_reason,
                payload={
                    "task_id": task_id,
                    "dispatch": DispatchMode.LOCAL_ASYNC.value,
                    "reason": fallback_reason,
                    "enqueue_error": enqueue_error,
                },
            )
        except Exception as event_err:
            logger.warning(
                "Failed to append fallback dispatch event: session=%s error=%s",
                session_id,
                event_err,
            )
        return True
    except Exception as local_err:
        logger.error(
            "Failed to schedule local fallback execution:"
            " session=%s task=%s error=%s",
            session_id,
            task_id,
            local_err,
        )
        return False


async def mark_dispatch_failed(
    *,
    db,
    session_id: str,
    task_id: str,
    error_message: str,
    append_event: Callable[..., Awaitable[None]],
) -> None:
    await db.generationtask.update(
        where={"id": task_id},
        data={"status": TaskStatus.FAILED, "errorMessage": error_message},
    )
    await db.generationsession.update(
        where={"id": session_id},
        data={
            "state": GenerationState.FAILED.value,
            "errorCode": TaskExecutionErrorCode.DISPATCH_FAILED.value,
            "errorMessage": error_message,
            "errorRetryable": True,
            "resumable": True,
        },
    )
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=GenerationState.FAILED.value,
        state_reason=TaskFailureStateReason.DISPATCH_FAILED.value,
        payload={"task_id": task_id, "error": error_message},
    )
