from __future__ import annotations

from typing import Awaitable, Callable

from services.platform.generation_event_constants import GenerationEventType


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
