from __future__ import annotations

import json
import logging
import uuid
from typing import Awaitable, Callable, Optional

from services.generation_session_service.access import get_owned_session
from services.generation_session_service.capability_helpers import (
    _extract_template_config,
    _normalize_task_type,
    _resolve_queue_worker_availability,
)
from services.generation_session_service.constants import SessionLifecycleReason
from services.generation_session_service.serialization_helpers import _to_session_ref
from services.generation_session_service.session_history import (
    build_run_trace_payload,
    get_latest_session_run,
    serialize_session_run,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.platform.task_recovery import TaskRecoveryService

logger = logging.getLogger(__name__)


async def load_cached_command_response(
    *,
    db,
    session_id: str,
    user_id: str,
    idempotency_key: Optional[str],
) -> Optional[dict]:
    if not idempotency_key:
        return None

    cached = await db.idempotencykey.find_unique(
        where={"key": f"cmd:{user_id}:{session_id}:{idempotency_key}"}
    )
    if not cached:
        return None

    raw_response = getattr(cached, "response", None)
    if not isinstance(raw_response, str) or not raw_response.strip():
        logger.warning(
            "Skip malformed command idempotency cache entry: session=%s key=%s",
            session_id,
            idempotency_key,
        )
        return None

    try:
        parsed = json.loads(raw_response)
    except json.JSONDecodeError:
        logger.warning(
            "Skip unreadable command idempotency cache entry: session=%s key=%s",
            session_id,
            idempotency_key,
        )
        return None

    if not isinstance(parsed, dict):
        logger.warning(
            "Skip non-object command idempotency cache entry: session=%s key=%s",
            session_id,
            idempotency_key,
        )
        return None
    return parsed


async def load_and_validate_session(
    *,
    db,
    guard,
    execution_trigger_commands: set[str],
    conflict_error_cls,
    session_id: str,
    user_id: str,
    command: dict,
):
    session = await get_owned_session(db=db, session_id=session_id, user_id=user_id)

    command_type = command.get("command_type", "")
    if command_type in execution_trigger_commands:
        recovery_service = TaskRecoveryService(db)
        if await recovery_service.is_session_already_running(session_id):
            raise conflict_error_cls(
                "当前会话已有执行中的任务，请等待当前任务完成后重试",
                error_code="RESOURCE_CONFLICT",
                details={
                    "current_state": session.state,
                    "command_type": command_type,
                    "transition_guard": "StateTransitionGuard",
                },
            )

    result = guard.validate(session.state, command_type)
    if not result.allowed:
        raise conflict_error_cls(
            result.reject_reason or "状态转换不允许",
            error_code="INVALID_STATE_TRANSITION",
            details={
                "current_state": session.state,
                "command_type": command_type,
                "allowed_actions": guard.get_allowed_actions(session.state),
                "transition_guard": "StateTransitionGuard",
            },
        )

    return session, command_type, result


async def dispatch_created_task(
    *,
    db,
    conflict_error_cls,
    session_id: str,
    session,
    created_task_id: Optional[str],
    task_queue_service,
    mark_dispatch_failed: Callable[..., Awaitable[None]],
    schedule_enqueued_task_watchdog: Callable[..., None],
    append_event: Callable[..., Awaitable[None]],
) -> list[str]:
    warnings: list[str] = []
    if not created_task_id:
        return warnings

    task_type = _normalize_task_type(session.outputType, conflict_error_cls)
    template_config = _extract_template_config(session.options)
    availability = await _resolve_queue_worker_availability(task_queue_service)
    dispatch_context = {
        "queue_health": availability["status"],
        "queue_worker_count": availability.get("worker_count", 0),
        "stale_worker_count": availability.get("stale_worker_count", 0),
        "queue_error": availability.get("error"),
    }

    if task_queue_service is None or availability["status"] != "available":
        await mark_dispatch_failed(
            session_id=session_id,
            task_id=created_task_id,
            error_message=(
                "Task queue unavailable for session dispatch"
                if task_queue_service is None
                else f"Task queue unavailable: {availability['status']}"
            ),
        )
        raise conflict_error_cls("任务分发失败，请稍后重试")

    try:
        job = task_queue_service.enqueue_generation_task(
            task_id=created_task_id,
            project_id=session.projectId,
            task_type=task_type,
            template_config=template_config,
            priority="default",
        )
        await db.generationtask.update(
            where={"id": created_task_id},
            data={"rqJobId": job.id},
        )
        run_payload = await _load_task_run_payload(db=db, task_id=created_task_id)
        await append_event(
            session_id=session_id,
            event_type=GenerationEventType.STATE_CHANGED.value,
            state=GenerationState.GENERATING_CONTENT.value,
            state_reason=SessionLifecycleReason.OUTLINE_CONFIRMED.value,
            payload=build_run_trace_payload(
                run_payload,
                task_id=created_task_id,
                dispatch="rq",
                rq_job_id=job.id,
                **dispatch_context,
            ),
        )
        logger.info(
            "Session task enqueued: session=%s task=%s rq_job=%s",
            session_id,
            created_task_id,
            job.id,
        )
        schedule_enqueued_task_watchdog(
            session_id=session_id,
            task_id=created_task_id,
            project_id=session.projectId,
            task_type=task_type,
            template_config=template_config,
            rq_job_id=job.id,
            task_queue_service=task_queue_service,
        )
        return warnings
    except Exception as enqueue_err:
        logger.warning("Failed to enqueue session task: %s", enqueue_err)
        await mark_dispatch_failed(
            session_id=session_id,
            task_id=created_task_id,
            error_message=(
                f"Task enqueue failed: {type(enqueue_err).__name__}: {enqueue_err}"
            ),
        )
        raise conflict_error_cls("任务分发失败，请稍后重试")


async def _load_task_run_payload(*, db, task_id: str) -> Optional[dict]:
    task_actions = getattr(db, "generationtask", None)
    if task_actions is None:
        return None

    find_unique = getattr(task_actions, "find_unique", None)
    find_first = getattr(task_actions, "find_first", None)

    if callable(find_unique):
        task = await find_unique(where={"id": task_id})
    elif callable(find_first):
        task = await find_first(where={"id": task_id})
    else:
        return None

    raw = getattr(task, "inputData", None) if task else None
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict) or not parsed.get("run_id"):
        return None
    return {
        "run_id": parsed.get("run_id"),
        "run_no": parsed.get("run_no"),
        "run_title": parsed.get("run_title"),
        "tool_type": parsed.get("tool_type"),
    }


def build_command_response(
    *,
    db,
    session_id: str,
    command_type: str,
    created_task_id: Optional[str],
    run_data: Optional[dict],
    result,
    warnings: list[str],
    contract_version: str,
    schema_version: int,
):
    async def _build() -> dict:
        updated_session = await db.generationsession.find_unique(
            where={"id": session_id}
        )
        current_run = run_data
        if current_run is None and command_type != "SET_SESSION_TITLE":
            latest_run = await get_latest_session_run(db, session_id)
            current_run = serialize_session_run(latest_run)
        return {
            "command_id": str(uuid.uuid4()),
            "accepted": True,
            "task_id": created_task_id,
            "transition": {
                "command_type": command_type,
                "from_state": result.from_state,
                "to_state": result.to_state,
                "validated_by": result.validated_by,
            },
            "session": _to_session_ref(
                updated_session,
                contract_version,
                schema_version,
                task_id=created_task_id,
            ),
            "run": current_run,
            "warnings": warnings,
        }

    return _build()


async def save_cached_command_response(
    *,
    db,
    session_id: str,
    user_id: str,
    idempotency_key: Optional[str],
    response_data: dict,
) -> None:
    if not idempotency_key:
        return
    try:
        await db.idempotencykey.create(
            data={
                "key": f"cmd:{user_id}:{session_id}:{idempotency_key}",
                "response": json.dumps(response_data),
            }
        )
    except Exception as exc:
        logger.debug(
            "Skip idempotency command cache write: session=%s key=%s error=%s",
            session_id,
            idempotency_key,
            exc,
        )
