from __future__ import annotations

import json
from typing import Awaitable, Callable, Optional

from services.generation_session_service.capability_helpers import _normalize_task_type
from services.platform.state_transition_guard import GenerationCommandType


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
    base_version = command.get("base_version", 0)
    outline_data = command.get("outline", {})
    change_reason = command.get("change_reason")

    if session.currentOutlineVersion != base_version:
        raise conflict_error_cls(
            f"大纲版本冲突：期望 {base_version}，当前 {session.currentOutlineVersion}"
        )

    new_version = base_version + 1
    await db.outlineversion.create(
        data={
            "sessionId": session.id,
            "version": new_version,
            "outlineData": json.dumps(outline_data),
            "changeReason": change_reason,
        }
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
        event_type="outline.updated",
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
    base_version = command.get("base_version", 0)

    if session.currentOutlineVersion != base_version:
        raise conflict_error_cls(
            f"大纲版本冲突：期望 {base_version}，当前 {session.currentOutlineVersion}"
        )

    await db.generationsession.update(
        where={"id": session.id},
        data={"state": new_state, "renderVersion": {"increment": 1}},
    )
    await append_event(
        session_id=session.id,
        event_type="state.changed",
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

    options: dict = {}
    if session.options:
        try:
            options = json.loads(session.options)
        except (json.JSONDecodeError, TypeError):
            options = {}
    task_type = _normalize_task_type(session.outputType, conflict_error_cls)

    input_payload = {"outline_version": session.currentOutlineVersion}
    if options.get("template_config"):
        input_payload["template_config"] = options.get("template_config")

    task = await db.generationtask.create(
        data={
            "projectId": session.projectId,
            "sessionId": session.id,
            "taskType": task_type,
            "status": "pending",
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
        event_type="state.changed",
        state=new_state,
        payload={
            "confirmed": True,
            "task_id": task.id,
            "reason": "outline_confirmed",
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
        event_type="slide.updated",
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
        event_type="session.recovered",
        state=new_state,
        payload={"resumed_from_cursor": cursor},
    )
