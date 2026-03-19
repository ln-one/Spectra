from __future__ import annotations

import json
import logging
import uuid
from typing import Awaitable, Callable, Optional

from services.ai import ai_service
from services.generation_session_service.outline_helpers import (
    _build_outline_requirements,
    _courseware_outline_to_document,
)

logger = logging.getLogger(__name__)


def _classify_outline_failure(exc: Exception) -> tuple[str, str, str]:
    if isinstance(exc, TimeoutError):
        return (
            "OUTLINE_GENERATION_TIMEOUT",
            "大纲生成超时，请稍后重试。",
            "outline_draft_timed_out_fallback_empty",
        )
    return (
        "OUTLINE_GENERATION_FAILED",
        "大纲生成失败，请稍后重试。",
        "outline_draft_failed_fallback_empty",
    )


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
                "Outline draft skipped due to non-drafting session state: "
                "session=%s state=%s current_outline_version=%s",
                session_id,
                state,
                current_outline_version,
            )
            return

        await _emit_outline_progress(append_event, session_id, trace_id)
        outline_doc = await _generate_outline_doc(
            db=db,
            session_id=session_id,
            project_id=project_id,
            options=options,
            ai_service_obj=ai_service_obj,
        )
        await _persist_success(db=db, session_id=session_id, outline_doc=outline_doc)
        await _emit_outline_success(append_event, session_id, trace_id)
        logger.info(
            "Outline draft completed successfully: session=%s trace_id=%s",
            session_id,
            trace_id,
        )
    except Exception as draft_err:
        if await _is_concurrently_completed(db, session_id, trace_id):
            return

        error_code, error_message, failure_state_reason = _classify_outline_failure(
            draft_err
        )

        logger.error(
            "Outline draft failed: session=%s trace_id=%s error_code=%s error=%s",
            session_id,
            trace_id,
            error_code,
            draft_err,
            exc_info=True,
        )
        await _emit_outline_failure(
            append_event,
            session_id,
            error_code,
            error_message,
            trace_id,
        )
        await _persist_failure_fallback(
            db=db,
            session_id=session_id,
            failure_state_reason=failure_state_reason,
        )
        await _emit_outline_failure_state(
            append_event,
            session_id,
            trace_id,
            failure_state_reason=failure_state_reason,
        )


async def _emit_outline_progress(append_event, session_id: str, trace_id: str) -> None:
    await append_event(
        session_id=session_id,
        event_type="progress.updated",
        state="DRAFTING_OUTLINE",
        progress=15,
        payload={"stage": "outline_draft", "trace_id": trace_id},
    )


async def _generate_outline_doc(
    *, db, session_id: str, project_id: str, options, ai_service_obj
):
    project = await db.project.find_unique(where={"id": project_id})
    requirement_text = _build_outline_requirements(project, options)
    template_style = (options or {}).get("template") or "default"
    outline = await ai_service_obj.generate_outline(
        project_id=project_id,
        user_requirements=requirement_text,
        template_style=template_style,
    )
    return _courseware_outline_to_document(
        outline,
        target_pages=(options or {}).get("pages"),
    )


async def _persist_success(*, db, session_id: str, outline_doc: dict) -> None:
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


async def _emit_outline_success(append_event, session_id: str, trace_id: str) -> None:
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


async def _is_concurrently_completed(db, session_id: str, trace_id: str) -> bool:
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
                    "Outline draft failure ignored due to concurrent completion: "
                    "session=%s trace_id=%s",
                    session_id,
                    trace_id,
                )
                return True
    except Exception:
        pass
    return False


async def _emit_outline_failure(
    append_event,
    session_id: str,
    error_code: str,
    error_message: str,
    trace_id: str,
) -> None:
    await append_event(
        session_id=session_id,
        event_type="task.failed",
        state="DRAFTING_OUTLINE",
        payload={
            "stage": "outline_draft",
            "error_code": error_code,
            "error_message": error_message,
            "retryable": True,
            "trace_id": trace_id,
        },
    )


async def _persist_failure_fallback(
    *, db, session_id: str, failure_state_reason: str
) -> None:
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
            "stateReason": failure_state_reason,
            "currentOutlineVersion": 1,
        },
    )


async def _emit_outline_failure_state(
    append_event, session_id: str, trace_id: str, failure_state_reason: str
) -> None:
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
        state_reason=failure_state_reason,
        payload={"trace_id": trace_id},
    )
