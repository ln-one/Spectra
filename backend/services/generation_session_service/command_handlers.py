from __future__ import annotations

import json
from typing import Awaitable, Callable, Optional

from schemas.generation import TaskStatus
from services.generation_session_service.capability_helpers import _normalize_task_type
from services.generation_session_service.constants import SessionLifecycleReason
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationCommandType


def _is_outline_version_unique_violation(exc: Exception) -> bool:
    text = str(exc)
    return "Unique constraint failed" in text or "UniqueViolationError" in text


def _normalize_outline_document(outline_data: dict, version: int) -> dict:
    normalized = dict(outline_data or {})
    normalized["version"] = version
    return normalized


def _parse_outline_json(raw: object) -> dict | None:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


async def _load_latest_outline_record(db, session_id: str):
    outline_model = getattr(db, "outlineversion", None)
    if outline_model is None or not hasattr(outline_model, "find_first"):
        return None
    return await outline_model.find_first(
        where={"sessionId": session_id},
        order={"version": "desc"},
    )


async def _get_effective_outline_version(db, session) -> int:
    session_version = max(int(getattr(session, "currentOutlineVersion", 0) or 0), 0)
    latest = await _load_latest_outline_record(db, session.id)
    latest_version = max(int(getattr(latest, "version", 0) or 0), 0) if latest else 0
    return max(session_version, latest_version)


async def _persist_outline_version(
    *,
    db,
    session_id: str,
    version: int,
    outline_data: dict,
    change_reason: str | None,
) -> None:
    normalized = _normalize_outline_document(outline_data, version)
    payload = {
        "sessionId": session_id,
        "version": version,
        "outlineData": json.dumps(normalized, ensure_ascii=False),
        "changeReason": change_reason,
    }
    try:
        await db.outlineversion.create(data=payload)
        return
    except Exception as exc:
        if not _is_outline_version_unique_violation(exc):
            raise
        existing = await db.outlineversion.find_first(
            where={"sessionId": session_id, "version": version},
            order={"createdAt": "desc"},
        )
        if not existing:
            raise
        await db.outlineversion.update(
            where={"id": existing.id},
            data={
                "outlineData": payload["outlineData"],
                "changeReason": payload["changeReason"],
            },
        )


async def dispatch_command(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> Optional[str]:
    """Execute command-specific persistence and event updates."""
    command_type = command.get("command_type")

    if command_type == GenerationCommandType.UPDATE_OUTLINE.value:
        await handle_update_outline(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
        return None
    if command_type == GenerationCommandType.REDRAFT_OUTLINE.value:
        await handle_redraft_outline(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
        return None
    if command_type == GenerationCommandType.CONFIRM_OUTLINE.value:
        return await handle_confirm_outline(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
    if command_type == GenerationCommandType.REGENERATE_SLIDE.value:
        await handle_regenerate_slide(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
        return None
    if command_type == GenerationCommandType.RESUME_SESSION.value:
        await handle_resume_session(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
        )
        return None

    raise ValueError(f"未处理的命令类型：{command_type}")


async def handle_update_outline(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> None:
    base_version = int(command.get("base_version", 0) or 0)
    outline_data = command.get("outline", {}) or {}
    change_reason = command.get("change_reason")
    effective_version = await _get_effective_outline_version(db, session)

    if effective_version != base_version:
        latest_outline = await _load_latest_outline_record(db, session.id)
        latest_outline_doc = (
            _parse_outline_json(getattr(latest_outline, "outlineData", None))
            if latest_outline
            else None
        )
        normalized_existing = (
            _normalize_outline_document(latest_outline_doc, latest_outline.version)
            if latest_outline and latest_outline_doc is not None
            else None
        )
        normalized_requested = _normalize_outline_document(
            outline_data,
            max(base_version + 1, effective_version),
        )
        if (
            latest_outline
            and latest_outline.version == normalized_requested["version"]
            and normalized_existing == normalized_requested
        ):
            if session.currentOutlineVersion != latest_outline.version:
                await db.generationsession.update(
                    where={"id": session.id},
                    data={
                        "state": new_state,
                        "currentOutlineVersion": latest_outline.version,
                    },
                )
            return
        raise conflict_error_cls(
            f"大纲版本冲突：期望 {base_version}，当前 {effective_version}"
        )

    new_version = effective_version + 1
    await _persist_outline_version(
        db=db,
        session_id=session.id,
        version=new_version,
        outline_data=outline_data,
        change_reason=change_reason,
    )
    await db.generationsession.update(
        where={"id": session.id},
        data={
            "state": new_state,
            "currentOutlineVersion": new_version,
            "renderVersion": {"increment": 1},
        },
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.OUTLINE_UPDATED.value,
        state=new_state,
        payload={"version": new_version, "change_reason": change_reason},
    )


async def handle_redraft_outline(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> None:
    instruction = command.get("instruction", "")
    base_version = int(command.get("base_version", 0) or 0)
    effective_version = await _get_effective_outline_version(db, session)

    if effective_version != base_version:
        raise conflict_error_cls(
            f"大纲版本冲突：期望 {base_version}，当前 {effective_version}"
        )

    await db.generationsession.update(
        where={"id": session.id},
        data={"state": new_state, "renderVersion": {"increment": 1}},
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=new_state,
        payload={"instruction": instruction, "base_version": base_version},
    )


async def handle_confirm_outline(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> str:
    expected_state = command.get("expected_state")
    if expected_state and session.state != expected_state:
        raise conflict_error_cls(
            f"状态不匹配：期望 {expected_state}，当前 {session.state}"
        )
    effective_outline_version = await _get_effective_outline_version(db, session)
    if effective_outline_version != getattr(session, "currentOutlineVersion", 0):
        await db.generationsession.update(
            where={"id": session.id},
            data={"currentOutlineVersion": effective_outline_version},
        )

    options: dict = {}
    if session.options:
        try:
            options = json.loads(session.options)
        except (json.JSONDecodeError, TypeError):
            options = {}
    task_type = _normalize_task_type(session.outputType, conflict_error_cls)

    input_payload = {"outline_version": effective_outline_version}
    if options.get("template_config"):
        input_payload["template_config"] = options.get("template_config")

    task = await db.generationtask.create(
        data={
            "projectId": session.projectId,
            "sessionId": session.id,
            "taskType": task_type,
            "status": TaskStatus.PENDING,
            "progress": 0,
            "inputData": json.dumps(input_payload),
        }
    )

    await db.generationsession.update(
        where={"id": session.id},
        data={
            "state": new_state,
            "renderVersion": {"increment": 1},
            "resumable": True,
        },
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=new_state,
        payload={
            "confirmed": True,
            "task_id": task.id,
            "reason": SessionLifecycleReason.OUTLINE_CONFIRMED.value,
        },
    )
    return task.id


async def handle_regenerate_slide(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> None:
    slide_id = command.get("slide_id")
    patch = command.get("patch", {})
    expected_render_version = command.get("expected_render_version")

    if expected_render_version and session.renderVersion != expected_render_version:
        raise conflict_error_cls(
            f"渲染版本冲突：期望 {expected_render_version}，当前 {session.renderVersion}"
        )

    await db.generationsession.update(
        where={"id": session.id},
        data={"state": new_state, "renderVersion": {"increment": 1}},
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.SLIDE_UPDATED.value,
        state=new_state,
        payload={
            "slide_id": slide_id,
            "patch_schema_version": patch.get("schema_version", 1),
        },
    )


async def handle_resume_session(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
) -> None:
    cursor = command.get("cursor")
    await db.generationsession.update(
        where={"id": session.id},
        data={
            "state": new_state,
            "resumable": True,
            "lastCursor": cursor,
            "errorCode": None,
            "errorMessage": None,
        },
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.SESSION_RECOVERED.value,
        state=new_state,
        payload={"resumed_from_cursor": cursor},
    )
