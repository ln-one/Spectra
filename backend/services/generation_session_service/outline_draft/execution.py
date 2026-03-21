from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from typing import Awaitable, Callable, Optional

from services.ai import ai_service
from services.courseware_ai.outline import get_fallback_outline
from services.generation_session_service.constants import (
    OutlineChangeReason,
    OutlineGenerationErrorCode,
    OutlineGenerationStateReason,
)
from services.generation_session_service.outline_helpers import (
    _build_outline_requirements,
    _courseware_outline_to_document,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

logger = logging.getLogger(__name__)


def _outline_draft_timeout_seconds() -> float:
    raw = os.getenv("OUTLINE_DRAFT_TIMEOUT_SECONDS", "25").strip()
    try:
        parsed = float(raw)
        return parsed if parsed > 0 else 25.0
    except ValueError:
        return 25.0


def _classify_outline_failure(exc: Exception) -> tuple[str, str, str]:
    if isinstance(exc, TimeoutError):
        return (
            OutlineGenerationErrorCode.TIMEOUT.value,
            "大纲生成超时，请稍后重试。",
            OutlineGenerationStateReason.TIMED_OUT_FALLBACK_EMPTY.value,
        )
    return (
        OutlineGenerationErrorCode.FAILED.value,
        "大纲生成失败，请稍后重试。",
        OutlineGenerationStateReason.FAILED_FALLBACK_EMPTY.value,
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
    next_outline_version = 1
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
        if state != GenerationState.DRAFTING_OUTLINE.value:
            logger.info(
                "Outline draft skipped due to non-drafting session state: "
                "session=%s state=%s current_outline_version=%s",
                session_id,
                state,
                current_outline_version,
            )
            return
        next_outline_version = max(int(current_outline_version or 0), 0) + 1

        await _emit_outline_progress(append_event, session_id, trace_id)
        outline_doc = await asyncio.wait_for(
            _generate_outline_doc(
                db=db,
                session_id=session_id,
                project_id=project_id,
                options=options,
                ai_service_obj=ai_service_obj,
            ),
            timeout=_outline_draft_timeout_seconds(),
        )
        await _persist_success(
            db=db,
            session_id=session_id,
            outline_doc=outline_doc,
            outline_version=next_outline_version,
        )
        await _emit_outline_success(
            append_event, session_id, trace_id, outline_version=next_outline_version
        )
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
            project_id=project_id,
            options=options,
            failure_state_reason=failure_state_reason,
            outline_version=next_outline_version,
        )
        await _emit_outline_failure_state(
            append_event,
            session_id,
            trace_id,
            failure_state_reason=failure_state_reason,
            outline_version=next_outline_version,
        )


async def _emit_outline_progress(append_event, session_id: str, trace_id: str) -> None:
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.PROGRESS_UPDATED.value,
        state=GenerationState.DRAFTING_OUTLINE.value,
        progress=15,
        payload={"stage": "outline_draft", "trace_id": trace_id},
    )


async def _build_session_conversation_requirements(
    *, db, project_id: str, session_id: str
) -> str:
    project = await db.project.find_unique(where={"id": project_id})
    if not project:
        return "生成课件大纲"

    project_name = getattr(project, "name", None)
    project_description = getattr(project, "description", None)

    conversation_model = getattr(db, "conversation", None)
    if conversation_model is None:
        messages = []
    else:
        messages = await conversation_model.find_many(
            where={"projectId": project_id, "sessionId": session_id},
            take=10,
            order={"createdAt": "desc"},
        )
    user_messages = [
        msg
        for msg in reversed(messages)
        if getattr(msg, "role", None) == "user"
        or (isinstance(msg, dict) and msg.get("role") == "user")
    ]

    requirement_parts = []
    if project_name:
        requirement_parts.append(f"项目名称：{project_name}")
    if project_description:
        requirement_parts.append(f"项目描述：{project_description}")
    if user_messages:
        requirement_parts.append("\n当前会话用户需求：")
        for msg in user_messages[-3:]:
            content = (
                msg.get("content")
                if isinstance(msg, dict)
                else getattr(msg, "content", None)
            )
            if content:
                requirement_parts.append(f"- {content}")
    return "\n".join(requirement_parts) if requirement_parts else "生成课件大纲"


async def _generate_outline_doc(
    *, db, session_id: str, project_id: str, options, ai_service_obj
):
    project = await db.project.find_unique(where={"id": project_id})
    conversation_requirements = await _build_session_conversation_requirements(
        db=db,
        project_id=project_id,
        session_id=session_id,
    )
    outline_requirements = _build_outline_requirements(project, options)
    requirement_text = "\n\n".join(
        part.strip()
        for part in [conversation_requirements, outline_requirements]
        if part and part.strip()
    )
    template_style = (options or {}).get("template") or "default"
    outline = await ai_service_obj.generate_outline(
        project_id=project_id,
        user_requirements=requirement_text,
        template_style=template_style,
        session_id=session_id,
        rag_source_ids=(options or {}).get("rag_source_ids"),
    )
    return _courseware_outline_to_document(
        outline,
        target_pages=(options or {}).get("pages"),
    )


async def _persist_success(
    *, db, session_id: str, outline_doc: dict, outline_version: int
) -> None:
    await db.outlineversion.create(
        data={
            "sessionId": session_id,
            "version": outline_version,
            "outlineData": json.dumps(outline_doc),
            "changeReason": OutlineChangeReason.DRAFTED_ASYNC.value,
        }
    )
    await db.generationsession.update(
        where={"id": session_id},
        data={
            "state": GenerationState.AWAITING_OUTLINE_CONFIRM.value,
            "stateReason": OutlineGenerationStateReason.DRAFTED_ASYNC.value,
            "currentOutlineVersion": outline_version,
        },
    )


async def _emit_outline_success(
    append_event, session_id: str, trace_id: str, outline_version: int
) -> None:
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.OUTLINE_UPDATED.value,
        state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        progress=100,
        payload={
            "version": outline_version,
            "change_reason": OutlineChangeReason.DRAFTED_ASYNC.value,
            "trace_id": trace_id,
        },
    )
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        state_reason=OutlineGenerationStateReason.DRAFTED_ASYNC.value,
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
                latest_state == GenerationState.AWAITING_OUTLINE_CONFIRM.value
                and (latest_outline_version or 0) >= 1
            ):
                logger.info(
                    "Outline draft failure ignored due to concurrent completion: "
                    "session=%s trace_id=%s",
                    session_id,
                    trace_id,
                )
                return True
    except Exception as exc:
        logger.debug(
            "Outline concurrent completion probe failed: "
            "session=%s trace_id=%s error=%s",
            session_id,
            trace_id,
            exc,
        )
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
        event_type=GenerationEventType.TASK_FAILED.value,
        state=GenerationState.DRAFTING_OUTLINE.value,
        payload={
            "stage": "outline_draft",
            "error_code": error_code,
            "error_message": error_message,
            "retryable": True,
            "trace_id": trace_id,
        },
    )


async def _persist_failure_fallback(
    *,
    db,
    session_id: str,
    project_id: str,
    options: Optional[dict],
    failure_state_reason: str,
    outline_version: int,
) -> None:
    outline_title = "课堂教学大纲"
    project_model = getattr(db, "project", None)
    if project_model is not None and hasattr(project_model, "find_unique"):
        try:
            project = await project_model.find_unique(where={"id": project_id})
            if project:
                outline_title = (
                    project.get("name")
                    if isinstance(project, dict)
                    else getattr(project, "name", None)
                ) or outline_title
        except Exception as exc:  # pragma: no cover - defensive path
            logger.debug("Fallback outline project lookup failed: %s", exc)

    fallback_outline = get_fallback_outline(str(outline_title or "课堂教学大纲"))
    fallback_outline_doc = _courseware_outline_to_document(
        fallback_outline,
        target_pages=(options or {}).get("pages"),
    )
    fallback_outline_doc["version"] = outline_version

    await db.outlineversion.create(
        data={
            "sessionId": session_id,
            "version": outline_version,
            "outlineData": json.dumps(fallback_outline_doc),
            "changeReason": OutlineChangeReason.DRAFT_FAILED_FALLBACK_EMPTY.value,
        }
    )
    await db.generationsession.update(
        where={"id": session_id},
        data={
            "state": GenerationState.AWAITING_OUTLINE_CONFIRM.value,
            "stateReason": failure_state_reason,
            "currentOutlineVersion": outline_version,
        },
    )


async def _emit_outline_failure_state(
    append_event,
    session_id: str,
    trace_id: str,
    failure_state_reason: str,
    outline_version: int,
) -> None:
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.OUTLINE_UPDATED.value,
        state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        payload={
            "version": outline_version,
            "change_reason": OutlineChangeReason.DRAFT_FAILED_FALLBACK_EMPTY.value,
            "trace_id": trace_id,
        },
    )
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        state_reason=failure_state_reason,
        payload={"trace_id": trace_id},
    )
