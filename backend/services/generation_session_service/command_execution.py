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
from services.generation_session_service.constants import DispatchFallbackReason
from services.generation_session_service.serialization_helpers import _to_session_ref
from services.generation_session_service.session_history import (
    get_latest_session_run,
    serialize_session_run,
)
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
    schedule_local_execution: Callable[..., Awaitable[bool]],
    mark_dispatch_failed: Callable[..., Awaitable[None]],
    schedule_enqueued_task_watchdog: Callable[..., None],
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
        fallback_reason = (
            DispatchFallbackReason.TASK_QUEUE_UNAVAILABLE.value
            if task_queue_service is None
            else (
                DispatchFallbackReason.QUEUE_HEALTH_UNKNOWN.value
                if availability["status"] == "unknown"
                else DispatchFallbackReason.TASK_QUEUE_NO_WORKER.value
            )
        )
        scheduled = await schedule_local_execution(
            session_id=session_id,
            task_id=created_task_id,
            project_id=session.projectId,
            task_type=task_type,
            template_config=template_config,
            fallback_reason=fallback_reason,
            dispatch_context=dispatch_context,
        )
        if scheduled:
            warnings.append(fallback_reason)
            return warnings

        await mark_dispatch_failed(
            session_id=session_id,
            task_id=created_task_id,
            error_message="Task queue unavailable and local fallback scheduling failed",
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
        logger.warning(
            "Failed to enqueue session task, fallback to local async execution: %s",
            enqueue_err,
        )
        scheduled = await schedule_local_execution(
            session_id=session_id,
            task_id=created_task_id,
            project_id=session.projectId,
            task_type=task_type,
            template_config=template_config,
            fallback_reason=DispatchFallbackReason.TASK_ENQUEUE_FAILED.value,
            enqueue_error=str(enqueue_err),
            dispatch_context=dispatch_context,
        )
        if scheduled:
            warnings.append(DispatchFallbackReason.TASK_ENQUEUE_FAILED.value)
            return warnings

        await mark_dispatch_failed(
            session_id=session_id,
            task_id=created_task_id,
            error_message=(
                "Task enqueue failed and local fallback scheduling failed: "
                f"{type(enqueue_err).__name__}: {enqueue_err}"
            ),
        )
        raise conflict_error_cls("任务分发失败，请稍后重试")


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
