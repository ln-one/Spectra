from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import Request, status

from services.database import db_service
from services.generation_session_service import ConflictError, GenerationSessionService
from services.platform.state_transition_guard import GenerationCommandType
from utils.exceptions import (
    APIException,
    ErrorCode,
    ForbiddenException,
    NotFoundException,
)

CONTRACT_VERSION = "2026-03"


def get_session_service() -> GenerationSessionService:
    return GenerationSessionService(db=db_service.db)


def get_task_queue_service(request: Request):
    """Extract task_queue_service from app state (None if Redis unavailable)."""
    return getattr(request.app.state, "task_queue_service", None)


def parse_idempotency_key(key: Optional[UUID]) -> Optional[str]:
    return str(key) if key else None


def validate_positive_int(value, field_name: str):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"{field_name} must be an integer >= 1",
        )


def validate_optional_positive_int(value, field_name: str):
    if value is None:
        return
    validate_positive_int(value, field_name)


def validate_command_payload(command: dict):
    if not isinstance(command, dict):
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="command must be an object",
        )

    command_type = command.get("command_type")
    if not command_type:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="command.command_type is required",
        )

    if command_type in {
        GenerationCommandType.UPDATE_OUTLINE.value,
        GenerationCommandType.REDRAFT_OUTLINE.value,
    }:
        validate_positive_int(command.get("base_version"), "base_version")
    if command_type == GenerationCommandType.REGENERATE_SLIDE.value:
        validate_optional_positive_int(
            command.get("expected_render_version"),
            "expected_render_version",
        )
    if command_type == GenerationCommandType.SET_SESSION_TITLE.value:
        display_title = str(command.get("display_title") or "").strip()
        if not display_title:
            raise APIException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code=ErrorCode.INVALID_INPUT,
                message="command.display_title is required",
            )


async def load_session_snapshot_or_raise(
    svc: GenerationSessionService,
    session_id: str,
    user_id: str,
) -> dict:
    try:
        return await svc.get_session_snapshot(session_id, user_id)
    except ValueError as exc:
        raise _not_found_session() from exc
    except PermissionError as exc:
        raise _forbidden_session_access() from exc


async def load_session_preview_snapshot_or_raise(
    svc: GenerationSessionService,
    session_id: str,
    user_id: str,
) -> dict:
    preview_getter = getattr(svc, "get_session_preview_snapshot", None)
    if callable(preview_getter):
        try:
            return await preview_getter(session_id, user_id)
        except ValueError as exc:
            raise _not_found_session() from exc
        except PermissionError as exc:
            raise _forbidden_session_access() from exc

    return await load_session_snapshot_or_raise(svc, session_id, user_id)


async def load_session_runtime_or_raise(
    svc: GenerationSessionService,
    session_id: str,
    user_id: str,
) -> dict:
    try:
        return await svc.get_session_runtime_state(session_id, user_id)
    except ValueError as exc:
        raise _not_found_session() from exc
    except PermissionError as exc:
        raise _forbidden_session_access() from exc


async def execute_session_command_or_raise(
    svc: GenerationSessionService,
    *,
    session_id: str,
    user_id: str,
    command: dict,
    idempotency_key: Optional[str] = None,
    task_queue_service=None,
):
    try:
        return await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command=command,
            idempotency_key=idempotency_key,
            task_queue_service=task_queue_service,
        )
    except ValueError as exc:
        raise _not_found_session() from exc
    except PermissionError as exc:
        raise _forbidden_session_access() from exc
    except ConflictError as exc:
        raise_conflict(
            str(exc),
            error_code=getattr(exc, "error_code", "RESOURCE_CONFLICT"),
            details=getattr(exc, "details", None),
        )


def _not_found_session():
    return NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)


def _forbidden_session_access():
    return ForbiddenException(message="无权访问该会话", error_code=ErrorCode.FORBIDDEN)


def raise_conflict(
    msg: str,
    *,
    error_code: str | ErrorCode = ErrorCode.RESOURCE_CONFLICT,
    details: Optional[dict] = None,
):
    resolved_code = _resolve_conflict_error_code(error_code)
    payload = dict(details or {})
    payload.setdefault("transition_guard", "StateTransitionGuard")
    raise APIException(
        status_code=status.HTTP_409_CONFLICT,
        error_code=resolved_code,
        message=msg,
        details=payload,
    )


def _resolve_conflict_error_code(value: str | ErrorCode) -> ErrorCode:
    if isinstance(value, ErrorCode):
        return value
    try:
        return ErrorCode(value)
    except ValueError:
        return ErrorCode.RESOURCE_CONFLICT
