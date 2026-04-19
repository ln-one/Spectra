from __future__ import annotations

from typing import Awaitable, Callable

from services.generation_session_service.ppt_slide_regenerate import (
    regenerate_diego_slide_for_run,
)
from services.generation_session_service.run_lifecycle import get_latest_session_run
from services.generation_session_service.run_queries import get_session_run
from services.generation_session_service.run_serialization import serialize_session_run
from services.platform.generation_event_constants import GenerationEventType


def _resolve_slide_no(command: dict) -> int:
    raw_slide_index = command.get("slide_index")
    if isinstance(raw_slide_index, int) and raw_slide_index >= 1:
        return raw_slide_index
    if isinstance(raw_slide_index, str) and raw_slide_index.strip().isdigit():
        parsed = int(raw_slide_index.strip())
        if parsed >= 1:
            return parsed
    raise ValueError("slide_index 必须为 >= 1 的正整数")


def _resolve_run_id(command: dict) -> str | None:
    run_id = str(command.get("run_id") or "").strip()
    return run_id or None


async def handle_regenerate_slide(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> dict:
    session_id = str(getattr(session, "id", "") or "").strip()
    user_id = str(getattr(session, "userId", "") or "").strip()
    if not session_id or not user_id:
        raise conflict_error_cls("当前会话缺少用户绑定，无法执行单页重做")

    try:
        slide_no = _resolve_slide_no(command)
    except ValueError as exc:
        raise conflict_error_cls(str(exc))

    requested_run_id = _resolve_run_id(command)
    run = None
    if requested_run_id:
        run = await get_session_run(db, session_id, requested_run_id)
        if run is None:
            raise conflict_error_cls("run_id 无效或不属于当前会话")
    else:
        run = await get_latest_session_run(db, session_id)
        if run is None:
            raise conflict_error_cls(
                "当前会话尚未绑定可重做的运行",
                error_code="RESOURCE_CONFLICT",
                details={"reason": "run_not_ready"},
            )
        requested_run_id = str(getattr(run, "id", "") or "").strip() or None
    if not requested_run_id:
        raise conflict_error_cls(
            "当前会话尚未绑定可重做的运行",
            error_code="RESOURCE_CONFLICT",
            details={"reason": "run_not_ready"},
        )

    previous_state = str(getattr(session, "state", "") or "")
    slide_id = str(command.get("slide_id") or "").strip() or None
    instruction = str(command.get("instruction") or "").strip()
    preserve_style = bool(command.get("preserve_style", True))

    await db.generationsession.update(
        where={"id": session_id},
        data={
            "state": new_state,
            "stateReason": "slide_modify_processing",
            "errorCode": None,
            "errorMessage": None,
        },
    )
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=new_state,
        state_reason="slide_modify_processing",
        payload={
            "run_id": requested_run_id,
            "slide_id": slide_id,
            "slide_index": slide_no,
        },
    )
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.SLIDE_MODIFY_PROCESSING.value,
        state=new_state,
        state_reason="slide_modify_processing",
        payload={
            "run_id": requested_run_id,
            "slide_id": slide_id,
            "slide_index": slide_no,
            "instruction": instruction,
            "patch": command.get("patch"),
        },
    )

    try:
        await regenerate_diego_slide_for_run(
            db=db,
            run_id=requested_run_id,
            slide_no=slide_no,
            instruction=instruction,
            preserve_style=preserve_style,
            user_id=user_id,
        )
    except Exception as exc:
        await db.generationsession.update(
            where={"id": session_id},
            data={
                "state": previous_state or getattr(session, "state", new_state),
                "stateReason": "slide_modify_failed",
            },
        )
        await append_event(
            session_id=session_id,
            event_type=GenerationEventType.SLIDE_MODIFY_FAILED.value,
            state=previous_state or getattr(session, "state", new_state),
            state_reason="slide_modify_failed",
            payload={
                "run_id": requested_run_id,
                "slide_id": slide_id,
                "slide_index": slide_no,
                "error_message": str(exc),
            },
        )
        raise

    return {"run": serialize_session_run(run)}
