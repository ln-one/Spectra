from __future__ import annotations

import asyncio
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.responses import StreamingResponse

from routers.generate_sessions.shared import (
    CONTRACT_VERSION,
    get_session_service,
    get_task_queue_service,
    parse_idempotency_key,
)
from services.application.access import get_owned_project
from services.database import db_service
from services.generation_session_service.constants import SessionOutputType
from services.platform.state_transition_guard import GenerationState
from utils.dependencies import get_current_user, get_current_user_optional
from utils.exceptions import (
    APIException,
    ErrorCode,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
)
from utils.responses import success_response

router = APIRouter()


@router.get("/sessions")
async def list_sessions(
    project_id: str = Query(..., description="项目 ID"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    """返回项目内生成会话列表（按更新时间倒序）。"""
    try:
        await get_owned_project(project_id, user_id)

        skip = (page - 1) * limit
        sessions = await db_service.db.generationsession.find_many(
            where={"projectId": project_id},
            skip=skip,
            take=limit,
            order={"updatedAt": "desc"},
        )
        total = await db_service.db.generationsession.count(
            where={"projectId": project_id}
        )

        payload = [
            {
                "session_id": s.id,
                "project_id": s.projectId,
                "output_type": s.outputType,
                "state": s.state,
                "created_at": s.createdAt,
                "updated_at": s.updatedAt,
            }
            for s in sessions
        ]

        return success_response(
            data={
                "sessions": payload,
                "total": total,
                "page": page,
                "limit": limit,
            },
            message="获取生成会话列表成功",
        )
    except APIException:
        raise
    except Exception as exc:
        raise APIException(
            message="获取生成会话列表失败",
            error_code=ErrorCode.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        ) from exc


@router.post("/sessions", status_code=status.HTTP_200_OK)
async def create_generation_session(
    body: dict,
    request: Request,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """创建可中断、可恢复的课件生成会话。"""
    project_id = body.get("project_id")
    output_type = body.get("output_type")
    if not project_id or not output_type:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="project_id 和 output_type 为必填字段",
        )

    allowed_output_types = {
        SessionOutputType.PPT.value,
        SessionOutputType.WORD.value,
        SessionOutputType.BOTH.value,
    }
    if output_type not in allowed_output_types:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"output_type 必须是 {sorted(allowed_output_types)} 之一",
        )

    try:
        await get_owned_project(project_id, user_id)
    except ForbiddenException as exc:
        raise ForbiddenException(
            message="无权访问该项目", error_code=ErrorCode.FORBIDDEN
        ) from exc

    svc = get_session_service()
    task_queue_svc = get_task_queue_service(request)
    key_str = parse_idempotency_key(idempotency_key)
    cache_key = (
        f"create_session:{user_id}:{project_id}:{output_type}:{key_str}"
        if key_str
        else None
    )

    if key_str:
        from services.database import db_service as _db

        cached = await _db.get_idempotency_response(cache_key)
        if cached:
            return cached

    session_ref = await svc.create_session(
        project_id=project_id,
        user_id=user_id,
        output_type=output_type,
        options=body.get("options"),
        client_session_id=body.get("client_session_id"),
        task_queue_service=task_queue_svc,
    )

    resp = success_response(
        data={"session": session_ref},
        message="会话创建成功",
    )
    if key_str:
        await db_service.save_idempotency_response(cache_key, resp)
    return resp


@router.get("/sessions/{session_id}")
async def get_generation_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """查询生成会话完整快照。"""
    svc = get_session_service()
    try:
        payload = await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    return success_response(data=payload, message="查询成功")


@router.get("/sessions/{session_id}/events")
async def get_session_events(
    session_id: str,
    cursor: Optional[str] = Query(None, description="断线续传游标"),
    accept: Optional[str] = Query("text/event-stream"),
    token: Optional[str] = Query(
        None, description="SSE token (when Authorization header is unavailable)"
    ),
    user_id: Optional[str] = Depends(get_current_user_optional),
):
    """获取生成事件流，支持 SSE 或短轮询。"""
    if not user_id:
        if token:
            from services.auth_service import auth_service

            user_id = auth_service.verify_token(token)
        if not user_id:
            raise UnauthorizedException(message="缺少认证信息")
    svc = get_session_service()

    try:
        await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    if accept == "application/json":
        events = await svc.get_events(session_id, user_id, cursor=cursor)
        return success_response(data={"events": events}, message="获取事件成功")

    async def sse_generator():
        last_cursor = cursor
        history = await svc.get_events(session_id, user_id, cursor=last_cursor)
        for ev in history:
            last_cursor = ev["cursor"]
            yield f"id: {last_cursor}\ndata: {json.dumps(ev, ensure_ascii=False)}\n\n"

        while True:
            await asyncio.sleep(1)
            new_events = await svc.get_events(
                session_id, user_id, cursor=last_cursor, limit=20
            )
            for ev in new_events:
                last_cursor = ev["cursor"]
                payload = json.dumps(ev, ensure_ascii=False)
                yield f"id: {last_cursor}\ndata: {payload}\n\n"
            if not new_events:
                yield ": heartbeat\n\n"

            try:
                runtime_state = await svc.get_session_runtime_state(session_id, user_id)
                if runtime_state["state"] in {
                    GenerationState.SUCCESS.value,
                    GenerationState.FAILED.value,
                }:
                    break
            except Exception:
                break

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/capabilities")
async def get_capabilities(
    user_id: str = Depends(get_current_user),
):
    """返回服务端当前支持的契约版本、特性开关与弃用信息。"""
    from services.generation_session_service import _default_capabilities
    from services.platform.state_transition_guard import (
        VALID_COMMANDS,
        VALID_STATES,
        state_transition_guard,
    )

    transitions = state_transition_guard.get_transitions()

    return success_response(
        data={
            "contract_versions": [CONTRACT_VERSION],
            "default_contract_version": CONTRACT_VERSION,
            "command_interface": {
                "endpoint": "/api/v1/generate/sessions/{session_id}/commands",
                "supported_commands": sorted(VALID_COMMANDS),
            },
            "capabilities": _default_capabilities(),
            "state_machine": {
                "states": sorted(VALID_STATES),
                "terminal_states": [
                    GenerationState.SUCCESS.value,
                    GenerationState.FAILED.value,
                ],
                "transitions": transitions,
            },
            "deprecations": [
                {
                    "api": ep,
                    "sunset_at": "2026-06-01T00:00:00Z",
                    "replacement": "/api/v1/generate/sessions/{session_id}/commands",
                }
                for ep in [
                    "/api/v1/generate/sessions/{session_id}/outline",
                    "/api/v1/generate/sessions/{session_id}/confirm",
                    "/api/v1/generate/sessions/{session_id}/outline/redraft",
                    "/api/v1/generate/sessions/{session_id}/resume",
                    (
                        "/api/v1/generate/sessions/{session_id}/slides/"
                        "{slide_id}/regenerate"
                    ),
                ]
            ],
        },
        message="能力声明获取成功",
    )
