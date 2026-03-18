from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, status

from routers.generate_sessions import (
    _get_session_service,
    _get_task_queue_service,
    _parse_idempotency_key,
    _raise_conflict,
    _validate_command_payload,
    _validate_optional_positive_int,
    _validate_positive_int,
)
from services.generation_session_service import ConflictError
from utils.dependencies import get_current_user
from utils.exceptions import (
    APIException,
    ErrorCode,
    ForbiddenException,
    NotFoundException,
)
from utils.responses import success_response

router = APIRouter()


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

    _validate_command_payload(command)

    svc = _get_session_service()
    try:
        result = await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command=command,
            idempotency_key=_parse_idempotency_key(idempotency_key),
            task_queue_service=_get_task_queue_service(request),
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        _raise_conflict(str(exc))

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
    _validate_positive_int(base_version, "base_version")

    svc = _get_session_service()
    try:
        result = await svc.update_outline(
            session_id=session_id,
            user_id=user_id,
            outline_data=outline,
            base_version=base_version,
            change_reason=body.get("change_reason"),
            idempotency_key=_parse_idempotency_key(idempotency_key),
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        _raise_conflict(str(exc))

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
    svc = _get_session_service()
    try:
        result = await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command={
                "command_type": "CONFIRM_OUTLINE",
                "continue_from_retrieval": body.get("continue_from_retrieval", True),
                "expected_state": body.get("expected_state"),
            },
            idempotency_key=_parse_idempotency_key(idempotency_key),
            task_queue_service=_get_task_queue_service(request),
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        _raise_conflict(str(exc))

    return success_response(data=result, message="大纲已确认，开始生成内容")


@router.post("/sessions/{session_id}/outline/redraft")
async def redraft_outline(
    session_id: str,
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

    _validate_positive_int(base_version, "base_version")

    svc = _get_session_service()
    try:
        result = await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command={
                "command_type": "REDRAFT_OUTLINE",
                "instruction": instruction,
                "base_version": base_version,
            },
            idempotency_key=_parse_idempotency_key(idempotency_key),
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        _raise_conflict(str(exc))

    return success_response(data=result, message="大纲重写请求已接受")


@router.post("/sessions/{session_id}/resume")
async def resume_session(
    session_id: str,
    body: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
):
    """恢复中断会话。"""
    body = body or {}
    svc = _get_session_service()
    try:
        result = await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command={
                "command_type": "RESUME_SESSION",
                "cursor": body.get("cursor"),
                "last_known_state": body.get("last_known_state"),
            },
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        _raise_conflict(str(exc))

    return success_response(data=result, message="会话已恢复")


@router.post("/sessions/{session_id}/slides/{slide_id}/regenerate")
async def regenerate_slide(
    session_id: str,
    slide_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """局部重绘单页。"""
    patch = body.get("patch")
    if not patch:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="patch 字段为必填",
        )

    _validate_optional_positive_int(
        body.get("expected_render_version"),
        "expected_render_version",
    )

    svc = _get_session_service()
    try:
        result = await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command={
                "command_type": "REGENERATE_SLIDE",
                "slide_id": slide_id,
                "patch": patch,
                "expected_render_version": body.get("expected_render_version"),
            },
            idempotency_key=_parse_idempotency_key(idempotency_key),
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        _raise_conflict(str(exc))

    return success_response(data=result, message="局部重绘请求已接受")
