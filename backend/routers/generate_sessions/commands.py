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
    raise_conflict,
    validate_command_payload,
    validate_optional_positive_int,
    validate_positive_int,
)
from services.generation_session_service import ConflictError
from services.platform.state_transition_guard import GenerationCommandType
from utils.dependencies import get_current_user
from utils.exceptions import (
    APIException,
    ErrorCode,
    ForbiddenException,
    NotFoundException,
)
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
    result = await execute_session_command_or_raise(
        svc,
        session_id=session_id,
        user_id=user_id,
        command=command,
        idempotency_key=parse_idempotency_key(idempotency_key),
        task_queue_service=get_task_queue_service(request),
    )

    return success_response(data=result, message="命令已执行")


@router.put("/sessions/{session_id}/outline")
async def update_outline(
    session_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """更新大纲并回写会话。"""
    outline = body.get("outline")
    base_version = body.get("base_version")
    if not outline or base_version is None:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="outline 和 base_version 为必填字段",
        )
    validate_positive_int(base_version, "base_version")

    svc = _get_session_service()
    try:
        result = await svc.update_outline(
            session_id=session_id,
            user_id=user_id,
            outline_data=outline,
            base_version=base_version,
            change_reason=body.get("change_reason"),
            idempotency_key=parse_idempotency_key(idempotency_key),
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        raise_conflict(str(exc))

    snapshot = await svc.get_session_snapshot(session_id, user_id)
    return success_response(
        data={"session": result["session"], "outline": snapshot.get("outline")},
        message="大纲更新成功",
    )


@router.post("/sessions/{session_id}/confirm")
async def confirm_outline(
    session_id: str,
    request: Request,
    body: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """确认大纲并继续生成。"""
    body = body or {}
    parse_candidate_change_payload(body.get("candidate_change"), "candidate_change")
    parsed_idempotency_key = parse_idempotency_key(idempotency_key)
    generation_command = {
        "command_type": GenerationCommandType.CONFIRM_OUTLINE.value,
        "continue_from_retrieval": body.get("continue_from_retrieval", True),
        "expected_state": body.get("expected_state"),
    }

    svc = _get_session_service()
    result = await execute_session_command_or_raise(
        svc,
        session_id=session_id,
        user_id=user_id,
        command=generation_command,
        idempotency_key=parsed_idempotency_key,
        task_queue_service=get_task_queue_service(request),
    )

    candidate_change = await attach_auto_candidate_change(
        session_id=session_id,
        user_id=user_id,
        snapshot=await svc.get_session_snapshot(session_id, user_id),
        body=body,
        candidate_change_body=body.get("candidate_change"),
        idempotency_key=parsed_idempotency_key,
        cache_scope="confirm_outline_candidate_change",
        generation_command=generation_command,
        generation_result=result if isinstance(result, dict) else {},
        trigger="confirm_outline",
    )
    response_data = dict(result) if isinstance(result, dict) else {"result": result}
    if candidate_change is not None:
        response_data["candidate_change"] = candidate_change
    return success_response(data=response_data, message="大纲已确认，开始生成内容")


@router.post("/sessions/{session_id}/outline/redraft")
async def redraft_outline(
    session_id: str,
    request: Request,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """请求 AI 重写大纲。"""
    instruction = body.get("instruction")
    base_version = body.get("base_version")
    if not instruction or base_version is None:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="instruction 和 base_version 为必填字段",
        )

    validate_positive_int(base_version, "base_version")

    svc = _get_session_service()
    result = await execute_session_command_or_raise(
        svc,
        session_id=session_id,
        user_id=user_id,
        command={
            "command_type": GenerationCommandType.REDRAFT_OUTLINE.value,
            "instruction": instruction,
            "base_version": base_version,
        },
        idempotency_key=parse_idempotency_key(idempotency_key),
        task_queue_service=get_task_queue_service(request),
    )

    return success_response(data=result, message="大纲重写请求已受理")


@router.post("/sessions/{session_id}/resume")
async def resume_session(
    session_id: str,
    body: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
):
    """恢复中断会话。"""
    body = body or {}
    svc = _get_session_service()
    result = await execute_session_command_or_raise(
        svc,
        session_id=session_id,
        user_id=user_id,
        command={
            "command_type": GenerationCommandType.RESUME_SESSION.value,
            "cursor": body.get("cursor"),
            "last_known_state": body.get("last_known_state"),
        },
    )

    return success_response(data=result, message="会话已恢复")


@router.post("/sessions/{session_id}/slides/{slide_id}/regenerate")
async def regenerate_slide(
    session_id: str,
    slide_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """单页局部修改入口（兼容旧 regenerate 路径）。"""
    patch = body.get("patch") if isinstance(body.get("patch"), dict) else None
    if patch is None:
        patch = {"schema_version": 1, "operations": []}

    instruction = str(body.get("instruction") or "").strip()
    if not instruction:
        # 兼容旧调用方：逐步收敛到“instruction 必填”契约。
        instruction = "请按补丁修改当前页，并保持整套课件一致性。"

    validate_optional_positive_int(
        body.get("expected_render_version"),
        "expected_render_version",
    )

    svc = _get_session_service()
    result = await execute_session_command_or_raise(
        svc,
        session_id=session_id,
        user_id=user_id,
        command={
            "command_type": GenerationCommandType.REGENERATE_SLIDE.value,
            "slide_id": slide_id,
            "slide_index": body.get("slide_index"),
            "instruction": instruction,
            "scope": body.get("scope") or "current_slide_only",
            "preserve_style": bool(body.get("preserve_style", True)),
            "preserve_layout": bool(body.get("preserve_layout", True)),
            "preserve_deck_consistency": bool(
                body.get("preserve_deck_consistency", True)
            ),
            "patch": patch,
            "expected_render_version": body.get("expected_render_version"),
        },
        idempotency_key=parse_idempotency_key(idempotency_key),
    )

    return success_response(data=result, message="单页局部修改请求已受理")
