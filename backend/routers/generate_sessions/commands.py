from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, status

from routers.generate_sessions.shared import (
    attach_auto_candidate_change,
    create_session_candidate_change,
    get_session_service,
    get_task_queue_service,
    parse_candidate_change_payload,
    parse_idempotency_key,
    raise_conflict,
    serialize_candidate_change,
    validate_command_payload,
    validate_optional_positive_int,
    validate_positive_int,
)
from services.database import db_service
from services.generation_session_service import ConflictError
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user
from utils.exceptions import (
    APIException,
    ErrorCode,
    ForbiddenException,
    NotFoundException,
)
from utils.responses import success_response

router = APIRouter()

# Backward-compatible aliases for tests and monkeypatches.
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
    try:
        result = await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command=command,
            idempotency_key=parse_idempotency_key(idempotency_key),
            task_queue_service=get_task_queue_service(request),
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        raise_conflict(str(exc))

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
        "command_type": "CONFIRM_OUTLINE",
        "continue_from_retrieval": body.get("continue_from_retrieval", True),
        "expected_state": body.get("expected_state"),
    }

    svc = _get_session_service()
    try:
        result = await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command=generation_command,
            idempotency_key=parsed_idempotency_key,
            task_queue_service=get_task_queue_service(request),
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        raise_conflict(str(exc))

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
    try:
        result = await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command={
                "command_type": "REDRAFT_OUTLINE",
                "instruction": instruction,
                "base_version": base_version,
            },
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
        raise_conflict(str(exc))

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

    validate_optional_positive_int(
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

    return success_response(data=result, message="局部重绘请求已接受")


@router.post("/sessions/{session_id}/candidate-change")
async def submit_session_candidate_change(
    session_id: str,
    body: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """为当前 session 显式提交一个 candidate change。"""
    body = body or {}
    parse_candidate_change_payload(body.get("payload"), "payload")
    parsed_idempotency_key = parse_idempotency_key(idempotency_key)
    svc = _get_session_service()
    try:
        snapshot = await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    cache_key = None
    if parsed_idempotency_key:
        project_id = snapshot["session"]["project_id"]
        cache_key = (
            f"session_candidate_change:{user_id}:{project_id}:{session_id}:"
            f"{parsed_idempotency_key}"
        )
        cached = await db_service.get_idempotency_response(cache_key)
        if isinstance(cached, dict) and cached.get("data", {}).get("change"):
            return cached

    change = await create_session_candidate_change(
        session_id=session_id,
        user_id=user_id,
        snapshot=snapshot,
        body=body,
    )
    response = success_response(
        data={"change": serialize_candidate_change(change)},
        message="候选变更提交成功",
    )
    if cache_key:
        await db_service.save_idempotency_response(cache_key, response)
    return response


@router.get("/sessions/{session_id}/candidate-change")
async def list_session_candidate_changes(
    session_id: str,
    status: Optional[str] = None,
    proposer_user_id: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """按 session 查询 project-space candidate changes。"""
    svc = _get_session_service()
    try:
        snapshot = await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    changes = await project_space_service.get_candidate_changes(
        project_id=snapshot["session"]["project_id"],
        user_id=user_id,
        status=status,
        proposer_user_id=proposer_user_id,
        session_id=session_id,
    )
    return success_response(
        data={"changes": [serialize_candidate_change(change) for change in changes]},
        message="获取候选变更列表成功",
    )
