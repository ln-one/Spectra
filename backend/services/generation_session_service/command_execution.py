from __future__ import annotations

import json
import logging
from typing import Optional

from services.generation_session_service.access import get_owned_session
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
