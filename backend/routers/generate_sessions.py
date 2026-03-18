"""
Session-First 生成路由（C6）

实现 OpenAPI 契约中 /generate/sessions 系列端点（10 条主入口 + 4 条预览域）。
所有写操作经过 StateTransitionGuard 校验，响应包含 transition.validated_by。

契约参考：docs/openapi.yaml /api/v1/generate/sessions*
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.responses import StreamingResponse

from services.database import db_service
from services.generation_session_service import GenerationSessionService
from services.preview_helpers import (
    build_artifact_anchor,
    load_preview_material,
    strip_sources,
)
from utils.dependencies import get_current_user, get_current_user_optional
from utils.exceptions import (
    APIException,
    ErrorCode,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
)
from utils.responses import success_response

router = APIRouter(prefix="/generate", tags=["Generate"])
logger = logging.getLogger(__name__)

CONTRACT_VERSION = "2026-03"


# ============================================================
# 0. GET /generate/sessions — 会话列表（项目内历史）
# ============================================================
@router.get("/sessions")
async def list_sessions(
    project_id: str = Query(..., description="项目 ID"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    """返回项目内生成会话列表（按更新时间倒序）。"""
    try:
        project = await db_service.get_project(project_id)
        if not project or project.userId != user_id:
            raise ForbiddenException(message="无权访问此项目")

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
        logger.error("List sessions failed: %s", exc, exc_info=True)
        raise APIException(
            message="获取生成会话列表失败",
            error_code=ErrorCode.INTERNAL_ERROR,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ============================================================
# 辅助：获取 service 实例（使用共享 db_service.db）
# ============================================================


def _get_session_service() -> GenerationSessionService:
    return GenerationSessionService(db=db_service.db)


def _get_task_queue_service(request: Request):
    """Extract task_queue_service from app state (None if Redis unavailable)."""
    return getattr(request.app.state, "task_queue_service", None)


def _parse_idempotency_key(key: Optional[UUID]) -> Optional[str]:
    return str(key) if key else None


def _validate_positive_int(value, field_name: str):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"{field_name} must be an integer >= 1",
        )


def _validate_optional_positive_int(value, field_name: str):
    if value is None:
        return
    _validate_positive_int(value, field_name)


def _validate_command_payload(command: dict):
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

    if command_type in {"UPDATE_OUTLINE", "REDRAFT_OUTLINE"}:
        _validate_positive_int(command.get("base_version"), "base_version")
    if command_type == "REGENERATE_SLIDE":
        _validate_optional_positive_int(
            command.get("expected_render_version"),
            "expected_render_version",
        )


# ============================================================
# 通用 409 错误转换
# ============================================================


def _raise_conflict(msg: str):
    raise APIException(
        status_code=status.HTTP_409_CONFLICT,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message=msg,
        details={"transition_guard": "StateTransitionGuard"},
    )


async def _resolve_session_artifact_binding(
    project_id: str, session_id: str, artifact_id: Optional[str] = None
):
    """Resolve artifact binding for preview/export in session scope."""
    if artifact_id:
        artifact = await db_service.get_artifact(artifact_id)
        if not artifact or artifact.projectId != project_id:
            raise NotFoundException(
                message=f"成果不存在: {artifact_id}",
                error_code=ErrorCode.NOT_FOUND,
            )
        if artifact.sessionId and artifact.sessionId != session_id:
            raise NotFoundException(
                message=f"成果 {artifact_id} 不属于会话 {session_id}",
                error_code=ErrorCode.NOT_FOUND,
            )
        return artifact

    return await db_service.db.artifact.find_first(
        where={"projectId": project_id, "sessionId": session_id},
        order={"updatedAt": "desc"},
    )


def _build_artifact_anchor(session_id: str, artifact) -> dict:
    """Backward-compatible wrapper for tests and patches."""
    return build_artifact_anchor(session_id, artifact)


def _without_sources(slides: list[dict], lesson_plan: Optional[dict]):
    """Backward-compatible wrapper for tests and patches."""
    return strip_sources(slides, lesson_plan)


async def _load_preview_material(session_id: str, project_id: str):
    """Backward-compatible wrapper for tests and patches."""
    return await load_preview_material(session_id, project_id)


# ============================================================
# 1. POST /generate/sessions — 创建会话
# ============================================================


@router.post("/sessions", status_code=status.HTTP_200_OK)
async def create_generation_session(
    body: dict,
    request: Request,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """创建可中断、可恢复的课件生成会话（契约优先主入口）。"""
    project_id = body.get("project_id")
    output_type = body.get("output_type")
    if not project_id or not output_type:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="project_id 和 output_type 为必填字段",
        )

    # P2：output_type enum 校验
    _ALLOWED_OUTPUT_TYPES = {"ppt", "word", "both"}
    if output_type not in _ALLOWED_OUTPUT_TYPES:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"output_type 必须是 {sorted(_ALLOWED_OUTPUT_TYPES)} 之一",
        )

    # 验证项目归属
    project = await db_service.get_project(project_id)
    if not project or project.userId != user_id:
        raise ForbiddenException(
            message="无权访问该项目", error_code=ErrorCode.FORBIDDEN
        )

    svc = _get_session_service()
    task_queue_svc = _get_task_queue_service(request)
    key_str = _parse_idempotency_key(idempotency_key)
    cache_key = (
        f"create_session:{user_id}:{project_id}:{output_type}:{key_str}"
        if key_str
        else None
    )

    # 幂等：相同 key 直接返回缓存
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


# ============================================================
# 2. GET /generate/sessions/{session_id} — 查询快照
# ============================================================


@router.get("/sessions/{session_id}")
async def get_generation_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """查询生成会话完整快照（SessionStatePayload）。"""
    svc = _get_session_service()
    try:
        payload = await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    return success_response(data=payload, message="查询成功")


# ============================================================
# 3. GET /generate/sessions/{session_id}/events — SSE 事件流
# ============================================================


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
    """获取生成事件流，支持 SSE（默认）或短轮询（accept=application/json）。"""
    if not user_id:
        if token:
            from services.auth_service import auth_service

            user_id = auth_service.verify_token(token)
        if not user_id:
            raise UnauthorizedException(message="缺少认证信息")
    svc = _get_session_service()

    # 权限预检
    try:
        await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    if accept == "application/json":
        # 短轮询模式
        events = await svc.get_events(session_id, user_id, cursor=cursor)
        return success_response(data={"events": events}, message="获取事件成功")

    # SSE 模式
    async def sse_generator():
        last_cursor = cursor
        # 先补发 cursor 之后的历史事件
        history = await svc.get_events(session_id, user_id, cursor=last_cursor)
        for ev in history:
            last_cursor = ev["cursor"]
            yield f"id: {last_cursor}\ndata: {json.dumps(ev, ensure_ascii=False)}\n\n"

        # 持续推送新事件（轮询间隔 1s）
        while True:
            await asyncio.sleep(1)
            new_events = await svc.get_events(
                session_id, user_id, cursor=last_cursor, limit=20
            )
            for ev in new_events:
                last_cursor = ev["cursor"]
                _data = json.dumps(ev, ensure_ascii=False)
                yield f"id: {last_cursor}\ndata: {_data}\n\n"
            # 心跳（每轮无事件时发送，保持连接活跃）
            if not new_events:
                yield ": heartbeat\n\n"

            # 检查会话是否已终止（SUCCESS/FAILED），终止 SSE
            try:
                runtime_state = await svc.get_session_runtime_state(session_id, user_id)
                state = runtime_state["state"]
                if state in ("SUCCESS", "FAILED"):
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


from routers.generate_sessions_commands import router as commands_router

router.include_router(commands_router)


# ============================================================
# 10. GET /generate/capabilities — 能力声明
# ============================================================


@router.get("/capabilities")
async def get_capabilities(
    user_id: str = Depends(get_current_user),
):
    """返回服务端当前支持的契约版本、特性开关与弃用信息。"""
    from services.generation_session_service import _default_capabilities
    from services.state_transition_guard import (
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
                "terminal_states": ["SUCCESS", "FAILED"],
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


from routers.generate_sessions_preview import router as preview_router

router.include_router(preview_router)
