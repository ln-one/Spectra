from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import Request, status

from services.database import db_service
from services.generation_session_service import GenerationSessionService
from services.platform.state_transition_guard import GenerationCommandType
from utils.exceptions import (
    APIException,
    ErrorCode,
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


def raise_conflict(msg: str):
    raise APIException(
        status_code=status.HTTP_409_CONFLICT,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message=msg,
        details={"transition_guard": "StateTransitionGuard"},
    )
