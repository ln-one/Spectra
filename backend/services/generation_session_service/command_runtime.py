from __future__ import annotations

from typing import Awaitable, Callable

from services.generation_session_service.event_store import (
    persist_session_update_and_events,
)
from services.generation_session_service.ppt_slide_regenerate import (
    regenerate_diego_slide_for_run,
)
from services.generation_session_service.run_lifecycle import get_latest_session_run
from services.generation_session_service.run_queries import get_session_run
from services.generation_session_service.run_serialization import serialize_session_run
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.task_executor.constants import TaskFailureStateReason


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


def _resolve_expected_render_version(command: dict) -> int | None:
    value = command.get("expected_render_version")
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 1:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed >= 1 else None
    return None


def _resolve_slide_modify_stable_state(session) -> tuple[str, str | None]:
    has_materialized_output = bool(
        str(getattr(session, "pptUrl", "") or "").strip()
        or str(getattr(session, "wordUrl", "") or "").strip()
    )
    if has_materialized_output:
        return GenerationState.SUCCESS.value, TaskFailureStateReason.COMPLETED.value
    previous_state = str(getattr(session, "state", "") or "").strip()
    previous_reason = str(getattr(session, "stateReason", "") or "").strip() or None
    return previous_state or GenerationState.SUCCESS.value, previous_reason


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

    stable_state, stable_state_reason = _resolve_slide_modify_stable_state(session)
    previous_state = str(getattr(session, "state", "") or "")
    previous_state_reason = str(getattr(session, "stateReason", "") or "").strip() or None
    slide_id = str(command.get("slide_id") or "").strip() or None
    instruction = str(command.get("instruction") or "").strip()
    preserve_style = bool(command.get("preserve_style", True))
    expected_render_version = _resolve_expected_render_version(command)
    current_render_version = int(getattr(session, "renderVersion", 0) or 0)
    if (
        expected_render_version is not None
        and current_render_version
        and current_render_version != expected_render_version
    ):
        raise conflict_error_cls(
            (
                "渲染版本冲突："
                f"期望 {expected_render_version}，当前 {current_render_version}"
            ),
            error_code="RESOURCE_CONFLICT",
            details={
                "reason": "render_version_conflict",
                "expected_render_version": expected_render_version,
                "current_render_version": current_render_version,
            },
        )

    initial_events: list[dict] = []
    if stable_state != previous_state or stable_state_reason != previous_state_reason:
        initial_events.append(
            {
                "event_type": GenerationEventType.STATE_CHANGED.value,
                "state": stable_state,
                "state_reason": stable_state_reason,
                "payload": {
                    "stage": "slide_modify_reconciled",
                    "run_id": requested_run_id,
                    "slide_id": slide_id,
                    "slide_index": slide_no,
                },
            }
        )
    initial_events.append(
        {
            "event_type": GenerationEventType.SLIDE_MODIFY_PROCESSING.value,
            "state": stable_state,
            "state_reason": "slide_modify_processing",
            "payload": {
                "run_id": requested_run_id,
                "slide_id": slide_id,
                "slide_index": slide_no,
                "instruction": instruction,
                "patch": command.get("patch"),
            },
        }
    )

    await persist_session_update_and_events(
        db=db,
        schema_version=1,
        session_id=session_id,
        session_data={
            "state": stable_state,
            "stateReason": stable_state_reason,
            "errorCode": None,
            "errorMessage": None,
            "errorRetryable": False,
        },
        events=initial_events,
    )

    try:
        await regenerate_diego_slide_for_run(
            db=db,
            run_id=requested_run_id,
            slide_no=slide_no,
            instruction=instruction,
            preserve_style=preserve_style,
            user_id=user_id,
            expected_render_version=expected_render_version,
        )
    except Exception as exc:
        restored_state = stable_state or previous_state or getattr(session, "state", new_state)
        restored_reason = stable_state_reason or previous_state_reason or "slide_modify_failed"
        failure_events: list[dict] = []
        if restored_state != previous_state or restored_reason != previous_state_reason:
            failure_events.append(
                {
                    "event_type": GenerationEventType.STATE_CHANGED.value,
                    "state": restored_state,
                    "state_reason": restored_reason,
                    "payload": {
                        "run_id": requested_run_id,
                        "slide_id": slide_id,
                        "slide_index": slide_no,
                        "error_message": str(exc),
                    },
                }
            )
        failure_events.append(
            {
                "event_type": GenerationEventType.SLIDE_MODIFY_FAILED.value,
                "state": restored_state,
                "state_reason": "slide_modify_failed",
                "payload": {
                    "run_id": requested_run_id,
                    "slide_id": slide_id,
                    "slide_index": slide_no,
                    "error_message": str(exc),
                },
            }
        )
        await persist_session_update_and_events(
            db=db,
            schema_version=1,
            session_id=session_id,
            session_data={
                "state": restored_state,
                "stateReason": restored_reason,
            },
            events=failure_events,
        )
        raise

    return {"run": serialize_session_run(run)}
