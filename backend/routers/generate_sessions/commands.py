from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, status

from routers.generate_sessions.candidate_changes import (
    attach_auto_candidate_change,
    parse_candidate_change_payload,
)
from routers.generate_sessions.shared import (
    execute_session_command_or_raise,
    get_session_service,
    get_task_queue_service,
    parse_idempotency_key,
    validate_command_payload,
)
from services.platform.state_transition_guard import GenerationCommandType
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ErrorCode
from utils.responses import success_response

router = APIRouter()

# 为测试与 monkeypatch 保留的兼容别名。
_get_session_service = get_session_service


@router.post("/sessions/{session_id}/commands")
async def execute_session_command(
    session_id: str,
    body: dict,
    request: Request,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """执行会话命令（统一写入口）。"""
    command = body.get("command")
    if not command:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="command 字段为必填",
        )

    validate_command_payload(command)

    svc = _get_session_service()
    parsed_idempotency_key = parse_idempotency_key(idempotency_key)
    candidate_change_body = body.get("candidate_change")
    if command.get("command_type") == GenerationCommandType.CONFIRM_OUTLINE.value:
        parse_candidate_change_payload(candidate_change_body, "candidate_change")

    result = await execute_session_command_or_raise(
        svc,
        session_id=session_id,
        user_id=user_id,
        command=command,
        idempotency_key=parsed_idempotency_key,
        task_queue_service=get_task_queue_service(request),
    )

    response_data = dict(result) if isinstance(result, dict) else {"result": result}
    if (
        command.get("command_type") == GenerationCommandType.CONFIRM_OUTLINE.value
        and candidate_change_body is not None
    ):
        candidate_change = await attach_auto_candidate_change(
            session_id=session_id,
            user_id=user_id,
            snapshot=await svc.get_session_snapshot(session_id, user_id),
            body=body,
            candidate_change_body=candidate_change_body,
            idempotency_key=parsed_idempotency_key,
            cache_scope="confirm_outline_candidate_change",
            generation_command=command,
            generation_result=result if isinstance(result, dict) else {},
            trigger="confirm_outline",
        )
        if candidate_change is not None:
            response_data["candidate_change"] = candidate_change

    return success_response(data=response_data, message="命令已执行")
