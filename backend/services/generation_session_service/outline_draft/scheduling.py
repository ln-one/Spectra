from __future__ import annotations

import asyncio
import logging
import os
from typing import Awaitable, Callable, Optional

from services.generation_session_service.capability_helpers import (
    _is_queue_worker_available,
)
from services.platform.state_transition_guard import GenerationState
from services.task_queue.status_constants import (
    CANCELABLE_QUEUE_JOB_STATUSES,
    QueueJobStatus,
)

logger = logging.getLogger(__name__)


async def schedule_outline_draft_task(
    *,
    db,
    session_id: str,
    project_id: str,
    options: Optional[dict],
    task_queue_service,
    append_event: Callable[..., Awaitable[None]],
    execute_outline_draft_local: Callable[..., Awaitable[None]],
) -> None:
    if task_queue_service and _is_queue_worker_available(task_queue_service):
        try:
            job = task_queue_service.enqueue_outline_draft_task(
                session_id=session_id,
                project_id=project_id,
                options=options,
                priority="default",
                timeout=300,
            )
            logger.info(
                "Outline draft task enqueued: session=%s job_id=%s",
                session_id,
                job.id,
            )
            schedule_outline_draft_watchdog(
                db=db,
                session_id=session_id,
                project_id=project_id,
                options=options,
                rq_job_id=job.id,
                task_queue_service=task_queue_service,
                execute_outline_draft_local=execute_outline_draft_local,
            )
            return
        except Exception as enqueue_err:
            logger.warning(
                "Failed to enqueue outline draft task, fallback to local async: %s",
                enqueue_err,
                exc_info=True,
            )
    elif task_queue_service:
        logger.warning(
            "Outline draft queue worker unavailable, fallback to local async: "
            "session=%s",
            session_id,
        )

    asyncio.create_task(
        execute_outline_draft_local(
            session_id=session_id,
            project_id=project_id,
            options=options,
        )
    )
    logger.info("Outline draft task scheduled locally: session=%s", session_id)


def schedule_outline_draft_watchdog(
    *,
    db,
    session_id: str,
    project_id: str,
    options: Optional[dict],
    rq_job_id: str,
    task_queue_service,
    execute_outline_draft_local: Callable[..., Awaitable[None]],
) -> None:
    async def _watch() -> None:
        delay_seconds = int(os.getenv("OUTLINE_DRAFT_WATCHDOG_SECONDS", "30"))
        await asyncio.sleep(max(5, delay_seconds))

        try:
            job_status = await asyncio.to_thread(
                task_queue_service.get_job_status, rq_job_id
            )
        except Exception as exc:
            logger.warning(
                "Outline draft watchdog failed to read RQ status: "
                "session=%s job=%s error=%s",
                session_id,
                rq_job_id,
                exc,
            )
            return

        status = (job_status or {}).get("status")
        if status in {
            QueueJobStatus.STARTED.value,
            QueueJobStatus.FINISHED.value,
        }:
            return

        if status in CANCELABLE_QUEUE_JOB_STATUSES:
            try:
                canceled = await asyncio.to_thread(
                    task_queue_service.cancel_job, rq_job_id
                )
            except Exception:
                canceled = False
            if not canceled:
                return

        session = await db.generationsession.find_unique(where={"id": session_id})
        if not session:
            return

        state = session.get("state") if isinstance(session, dict) else session.state
        current_outline_version = (
            session.get("currentOutlineVersion")
            if isinstance(session, dict)
            else session.currentOutlineVersion
        )
        if (
            state != GenerationState.DRAFTING_OUTLINE.value
            or (current_outline_version or 0) >= 1
        ):
            return

        logger.warning(
            "Outline draft watchdog fallback to local async execution: "
            "session=%s job=%s status=%s",
            session_id,
            rq_job_id,
            status or "unknown",
        )
        asyncio.create_task(
            execute_outline_draft_local(
                session_id=session_id,
                project_id=project_id,
                options=options,
            )
        )

    asyncio.create_task(_watch())
