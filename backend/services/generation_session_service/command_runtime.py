from __future__ import annotations

from typing import Awaitable, Callable

from services.generation_session_service.session_history import (
    RUN_STATUS_PROCESSING,
    RUN_STEP_MODIFY_SLIDE,
    build_run_trace_payload,
    create_session_run,
    serialize_session_run,
)
from services.platform.generation_event_constants import GenerationEventType


async def handle_regenerate_slide(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> dict:
    slide_id = command.get("slide_id")
    patch = command.get("patch", {})
    instruction = str(command.get("instruction") or "").strip()
    scope = str(command.get("scope") or "current_slide_only").strip()
    expected_render_version = command.get("expected_render_version")
    preserve_style = bool(command.get("preserve_style", True))
    preserve_layout = bool(command.get("preserve_layout", True))
    preserve_deck_consistency = bool(command.get("preserve_deck_consistency", True))
    slide_index = command.get("slide_index")

    run = None
    run_trace_payload = {}
    try:
        if expected_render_version and session.renderVersion != expected_render_version:
            raise conflict_error_cls(
                (
                    f"Render version conflict: expected {expected_render_version}, "
                    f"got {session.renderVersion}"
                )
            )

        run = await create_session_run(
            db=db,
            session_id=session.id,
            project_id=session.projectId,
            tool_type="slide_modify",
            step=RUN_STEP_MODIFY_SLIDE,
            status=RUN_STATUS_PROCESSING,
        )
        await db.generationsession.update(
            where={"id": session.id},
            data={"state": new_state, "renderVersion": {"increment": 1}},
        )
        run_trace_payload = build_run_trace_payload(
            run,
            slide_id=slide_id,
            slide_index=slide_index,
            instruction=instruction,
            scope=scope,
            preserve_style=preserve_style,
            preserve_layout=preserve_layout,
            preserve_deck_consistency=preserve_deck_consistency,
            patch_schema_version=patch.get("schema_version", 1),
        )
        await append_event(
            session_id=session.id,
            event_type="slide.modify.started",
            state=new_state,
            payload=run_trace_payload,
        )
        await append_event(
            session_id=session.id,
            event_type=GenerationEventType.SLIDE_MODIFY_PROCESSING.value,
            state=new_state,
            payload=run_trace_payload,
        )
        await append_event(
            session_id=session.id,
            event_type=GenerationEventType.SLIDE_UPDATED.value,
            state=new_state,
            payload=run_trace_payload,
        )
        return {
            "run": serialize_session_run(run),
            "slide_id": slide_id,
            "slide_index": slide_index,
            "scope": scope,
        }
    except Exception as exc:
        failure_payload = (
            dict(run_trace_payload)
            if run_trace_payload
            else build_run_trace_payload(
                run,
                slide_id=slide_id,
                slide_index=slide_index,
                instruction=instruction,
                scope=scope,
                preserve_style=preserve_style,
                preserve_layout=preserve_layout,
                preserve_deck_consistency=preserve_deck_consistency,
                patch_schema_version=patch.get("schema_version", 1),
            )
        )
        failure_payload["error_message"] = str(exc)
        failure_payload["failure_type"] = type(exc).__name__
        await append_event(
            session_id=session.id,
            event_type=GenerationEventType.SLIDE_MODIFY_FAILED.value,
            state=new_state,
            payload=failure_payload,
        )
        raise


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
