from __future__ import annotations

import asyncio
import logging
import os
from typing import Awaitable, Callable, Optional

from services.generation_session_service.capability_helpers import (
    _resolve_queue_worker_availability,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.task_queue.status_constants import (
    CANCELABLE_QUEUE_JOB_STATUSES,
    QueueJobStatus,
)

logger = logging.getLogger(__name__)


async def _load_session_state_reason(db, session_id: str) -> Optional[str]:
    session_model = getattr(db, "generationsession", None)
    if session_model is None or not hasattr(session_model, "find_unique"):
        return None
    try:
        session = await session_model.find_unique(where={"id": session_id})
    except Exception as exc:  # pragma: no cover - observability safeguard
        logger.debug(
            (
                "Failed to load session stateReason for dispatch event: "
                "session=%s error=%s"
            ),
            session_id,
            exc,
        )
        return None
    if not session:
        return None
    reason = (
        session.get("stateReason") if isinstance(session, dict) else session.stateReason
    )
    if reason is None:
        return None
    text = str(reason).strip()
    return text or None


async def _safe_append_dispatch_event(
    append_event: Callable[..., Awaitable[None]],
    **kwargs,
) -> None:
    try:
        await append_event(**kwargs)
    except Exception as exc:  # pragma: no cover - observability safeguard
        logger.warning("Failed to append outline dispatch event: %s", exc)


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
    session_state_reason = await _load_session_state_reason(db, session_id)
    availability = await _resolve_queue_worker_availability(task_queue_service)
    if task_queue_service and availability["status"] == "available":
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
            await _safe_append_dispatch_event(
                append_event,
                session_id=session_id,
                event_type=GenerationEventType.STATE_CHANGED.value,
                state=GenerationState.DRAFTING_OUTLINE.value,
                state_reason=session_state_reason,
                payload={
                    "dispatch": "rq",
                    "rq_job_id": job.id,
                    "queue_health": availability["status"],
                    "queue_worker_count": availability.get("worker_count", 0),
                    "stale_worker_count": availability.get("stale_worker_count", 0),
                },
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
            error_msg = (
                f"Failed to enqueue outline draft task: "
                f"{type(enqueue_err).__name__}: {enqueue_err}"
            )
            await _safe_append_dispatch_event(
                append_event,
                session_id=session_id,
                event_type=GenerationEventType.STATE_CHANGED.value,
                state=GenerationState.FAILED.value,
                state_reason="outline_draft_dispatch_failed",
                payload={
                    "dispatch": "rq",
                    "error": error_msg,
                    "queue_health": availability["status"],
                },
            )
            raise RuntimeError(error_msg) from enqueue_err

    # Queue unavailable - emit failure event before raising
    await _safe_append_dispatch_event(
        append_event,
        session_id=session_id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=GenerationState.FAILED.value,
        state_reason="outline_draft_queue_unavailable",
        payload={
            "dispatch": "rq",
            "error": "Queue unavailable",
            "queue_health": availability.get("status", "unknown"),
        },
    )
    raise RuntimeError(
        "Outline draft task queue unavailable"
        if task_queue_service is None
        else f"Outline draft queue unavailable: {availability['status']}"
    )


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
        delay_seconds = int(os.getenv("OUTLINE_DRAFT_WATCHDOG_SECONDS", "90"))
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
            "Outline draft watchdog marked stale queued draft as failed: "
            "session=%s job=%s status=%s",
            session_id,
            rq_job_id,
            status or "unknown",
        )
        await db.generationsession.update(
            where={"id": session_id},
            data={
                "state": GenerationState.FAILED.value,
                "stateReason": "outline_draft_dispatch_failed",
                "errorCode": "OUTLINE_DRAFT_DISPATCH_FAILED",
                "errorMessage": (
                    "Queued outline draft job stalled: " f"{status or 'unknown'}"
                ),
                "errorRetryable": True,
                "resumable": True,
            },
        )

    asyncio.create_task(_watch())
