from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routers.generate_sessions.shared import (
    execute_session_command_or_raise,
    raise_conflict,
    validate_command_payload,
)
from services.generation_session_service import ConflictError
from utils.exceptions import APIException, ErrorCode


@pytest.mark.anyio
async def test_execute_session_command_conflict_maps_invalid_state_transition():
    svc = SimpleNamespace(
        execute_command=AsyncMock(
            side_effect=ConflictError(
                "状态转换不允许",
                error_code=ErrorCode.INVALID_STATE_TRANSITION.value,
                details={
                    "current_state": "SUCCESS",
                    "command_type": "UPDATE_OUTLINE",
                    "allowed_actions": ["EXPORT"],
                },
            )
        )
    )

    with pytest.raises(APIException) as exc_info:
        await execute_session_command_or_raise(
            svc,
            session_id="s-001",
            user_id="u-001",
            command={"command_type": "UPDATE_OUTLINE"},
        )

    exc = exc_info.value
    assert exc.status_code == 409
    assert exc.detail["code"] == ErrorCode.INVALID_STATE_TRANSITION.value
    assert exc.detail["details"]["current_state"] == "SUCCESS"
    assert exc.detail["details"]["allowed_actions"] == ["EXPORT"]
    assert exc.detail["details"]["transition_guard"] == "StateTransitionGuard"


def test_raise_conflict_falls_back_to_resource_conflict_for_unknown_error_code():
    with pytest.raises(APIException) as exc_info:
        raise_conflict("conflict", error_code="UNKNOWN_CONFLICT_CODE")

    exc = exc_info.value
    assert exc.status_code == 409
    assert exc.detail["code"] == ErrorCode.RESOURCE_CONFLICT.value


def test_validate_command_payload_rejects_overlong_session_title():
    with pytest.raises(APIException) as exc_info:
        validate_command_payload(
            {
                "command_type": "SET_SESSION_TITLE",
                "display_title": "超长标题" * 40,
            }
        )

    exc = exc_info.value
    assert exc.status_code == 400
    assert exc.detail["code"] == ErrorCode.INVALID_INPUT.value
    assert "at most 120 characters" in exc.detail["message"]
