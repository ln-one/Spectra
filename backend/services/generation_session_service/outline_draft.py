from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from typing import Awaitable, Callable, Optional

from services.ai import ai_service
from services.generation_session_service.helpers import (
    _build_outline_requirements,
    _courseware_outline_to_document,
    _is_queue_worker_available,
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
    """Schedule outline drafting via queue first, then local async fallback."""
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
            "Outline draft queue worker unavailable, fallback to local async:"
            " session=%s",
            session_id,
        )

    asyncio.create_task(
        execute_outline_draft_local(
            session_id=session_id,
            project_id=project_id,
            options=options,
        )
    )
    logger.info(
        "Outline draft task scheduled locally: session=%s",
        session_id,
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
        delay_seconds = int(os.getenv("OUTLINE_DRAFT_WATCHDOG_SECONDS", "30"))
        await asyncio.sleep(max(5, delay_seconds))

        try:
            job_status = await asyncio.to_thread(
                task_queue_service.get_job_status,
                rq_job_id,
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
        if status in {"started", "finished"}:
            return

        if status in {"queued", "scheduled", "deferred"}:
            try:
                canceled = await asyncio.to_thread(
                    task_queue_service.cancel_job,
                    rq_job_id,
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
        if state != "DRAFTING_OUTLINE" or (current_outline_version or 0) >= 1:
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
    """Execute outline drafting locally and emit the expected session events."""
    trace_id = trace_id or str(uuid.uuid4())
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
        if state != "DRAFTING_OUTLINE" or (current_outline_version or 0) >= 1:
            logger.info(
                "Outline draft skipped due to non-drafting session state:"
                " session=%s state=%s current_outline_version=%s",
                session_id,
                state,
                current_outline_version,
            )
            return

        await append_event(
            session_id=session_id,
            event_type="progress.updated",
            state="DRAFTING_OUTLINE",
            progress=15,
            payload={"stage": "outline_draft", "trace_id": trace_id},
        )

        project = await db.project.find_unique(where={"id": project_id})
        requirement_text = _build_outline_requirements(project, options)
        template_style = (options or {}).get("template") or "default"

        outline = await ai_service_obj.generate_outline(
            project_id=project_id,
            user_requirements=requirement_text,
            template_style=template_style,
        )

        outline_doc = _courseware_outline_to_document(
            outline,
            target_pages=(options or {}).get("pages"),
        )

        await db.outlineversion.create(
            data={
                "sessionId": session_id,
                "version": 1,
                "outlineData": json.dumps(outline_doc),
                "changeReason": "drafted_async",
            }
        )

        await db.generationsession.update(
            where={"id": session_id},
            data={
                "state": "AWAITING_OUTLINE_CONFIRM",
                "stateReason": "outline_drafted_async",
                "currentOutlineVersion": 1,
            },
        )

        await append_event(
            session_id=session_id,
            event_type="outline.updated",
            state="AWAITING_OUTLINE_CONFIRM",
            progress=100,
            payload={
                "version": 1,
                "change_reason": "drafted_async",
                "trace_id": trace_id,
            },
        )
        await append_event(
            session_id=session_id,
            event_type="state.changed",
            state="AWAITING_OUTLINE_CONFIRM",
            state_reason="outline_drafted_async",
            payload={"trace_id": trace_id},
        )

        logger.info(
            "Outline draft completed successfully: session=%s trace_id=%s",
            session_id,
            trace_id,
        )
    except Exception as draft_err:
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
                    latest_state == "AWAITING_OUTLINE_CONFIRM"
                    and (latest_outline_version or 0) >= 1
                ):
                    logger.info(
                        "Outline draft failure ignored due to concurrent"
                        " completion: session=%s trace_id=%s",
                        session_id,
                        trace_id,
                    )
                    return
        except Exception:
            pass

        logger.error(
            "Outline draft failed: session=%s trace_id=%s error=%s",
            session_id,
            trace_id,
            draft_err,
            exc_info=True,
        )

        await append_event(
            session_id=session_id,
            event_type="task.failed",
            state="DRAFTING_OUTLINE",
            payload={
                "stage": "outline_draft",
                "error_code": "OUTLINE_GENERATION_FAILED",
                "error_message": str(draft_err),
                "retryable": True,
                "trace_id": trace_id,
            },
        )

        empty_outline = {"version": 1, "nodes": [], "summary": None}
        await db.outlineversion.create(
            data={
                "sessionId": session_id,
                "version": 1,
                "outlineData": json.dumps(empty_outline),
                "changeReason": "draft_failed_fallback_empty",
            }
        )

        await db.generationsession.update(
            where={"id": session_id},
            data={
                "state": "AWAITING_OUTLINE_CONFIRM",
                "stateReason": "outline_draft_failed_fallback_empty",
                "currentOutlineVersion": 1,
            },
        )

        await append_event(
            session_id=session_id,
            event_type="outline.updated",
            state="AWAITING_OUTLINE_CONFIRM",
            payload={
                "version": 1,
                "change_reason": "draft_failed_fallback_empty",
                "trace_id": trace_id,
            },
        )
        await append_event(
            session_id=session_id,
            event_type="state.changed",
            state="AWAITING_OUTLINE_CONFIRM",
            state_reason="outline_draft_failed_fallback_empty",
            payload={"trace_id": trace_id},
        )
