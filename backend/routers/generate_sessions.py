"""
Session-First 生成路由（C6）

实现 OpenAPI 契约中 /generate/sessions 系列端点（10 条主入口 + 4 条预览域）。
所有写操作经过 StateTransitionGuard 校验，响应包含 transition.validated_by。

契约参考：docs/openapi.yaml /api/v1/generate/sessions*
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.responses import StreamingResponse

from services.database import db_service
from services.generation_session_service import ConflictError, GenerationSessionService
from services.project_space_service import project_space_service
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
    """Build unified artifact anchor payload for session-scope responses."""
    return {
        "session_id": session_id,
        "artifact_id": artifact.id if artifact else None,
        "based_on_version_id": (
            getattr(artifact, "basedOnVersionId", None) if artifact else None
        ),
    }


def _without_sources(slides: list[dict], lesson_plan: Optional[dict]):
    """Drop source arrays from preview payload when include_sources=False."""
    slides_clean = []
    for slide in slides:
        item = dict(slide)
        item["sources"] = []
        slides_clean.append(item)

    lesson_plan_clean = None
    if lesson_plan:
        lesson_plan_clean = dict(lesson_plan)
        plans = []
        for plan in lesson_plan_clean.get("slides_plan", []) or []:
            plan_item = dict(plan)
            plan_item["material_sources"] = []
            plans.append(plan_item)
        lesson_plan_clean["slides_plan"] = plans
    return slides_clean, lesson_plan_clean


def _serialize_candidate_change(change) -> dict:
    payload = None
    if isinstance(change.payload, dict):
        payload = change.payload
    elif isinstance(change.payload, str):
        raw = change.payload.strip()
        if raw:
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = None
    accepted_version_id = None
    if isinstance(payload, dict):
        review = payload.get("review")
        if isinstance(review, dict):
            accepted_version_id = review.get("accepted_version_id")
    return {
        "id": change.id,
        "project_id": change.projectId,
        "session_id": change.sessionId,
        "base_version_id": change.baseVersionId,
        "title": change.title,
        "summary": change.summary,
        "payload": payload,
        "status": change.status,
        "review_comment": getattr(change, "reviewComment", None),
        "accepted_version_id": accepted_version_id,
        "proposer_user_id": change.proposerUserId,
        "created_at": change.createdAt,
        "updated_at": change.updatedAt,
    }


async def _load_preview_material(session_id: str, project_id: str):
    """Load task + rendered preview materials for preview/export APIs."""
    tasks = await db_service.db.generationtask.find_many(
        where={"sessionId": session_id},
        order={"createdAt": "desc"},
        take=1,
    )
    task = tasks[0] if tasks else None

    slides: list[dict] = []
    lesson_plan: Optional[dict] = None
    content: dict = {}
    if task:
        try:
            from services.preview_helpers import (
                build_lesson_plan,
                build_slides,
                get_or_generate_content,
            )

            project = await db_service.get_project(project_id)
            if not project:
                raise ValueError("project not found for preview")
            content = await get_or_generate_content(task, project)
            slide_models = build_slides(task.id, content.get("markdown_content", ""))
            slides = [s.model_dump() for s in slide_models]
            lesson_plan = build_lesson_plan(
                slide_models,
                content.get("lesson_plan_markdown", ""),
            ).model_dump()
        except Exception as preview_err:
            logger.warning(
                "Session preview content generation failed, using fallback: %s",
                preview_err,
                exc_info=True,
            )
    return task, slides, lesson_plan, content


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


# ============================================================
# 4. POST /generate/sessions/{session_id}/commands — 唯一写入口
# ============================================================


@router.post("/sessions/{session_id}/commands")
async def execute_session_command(
    session_id: str,
    body: dict,
    request: Request,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """执行会话命令（UPDATE_OUTLINE / REDRAFT_OUTLINE / CONFIRM_OUTLINE /
    REGENERATE_SLIDE / RESUME_SESSION）。"""
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
    except ConflictError as e:
        _raise_conflict(str(e))

    return success_response(data=result, message="命令已执行")


# ============================================================
# 5. PUT /generate/sessions/{session_id}/outline — 更新大纲（兼容别名）
# ============================================================


@router.post("/sessions/{session_id}/candidate-change")
async def submit_session_candidate_change(
    session_id: str,
    body: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
):
    """在 session 主链路中提交 candidate change。"""
    body = body or {}
    custom_payload = body.get("payload")
    if custom_payload is not None and not isinstance(custom_payload, dict):
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="payload must be an object",
        )

    svc = _get_session_service()
    try:
        snapshot = await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    project_id = snapshot["session"]["project_id"]
    bound_artifact = await _resolve_session_artifact_binding(
        project_id=project_id,
        session_id=session_id,
        artifact_id=body.get("artifact_id"),
    )
    anchor = _build_artifact_anchor(session_id, bound_artifact)
    payload = dict(custom_payload or {})
    payload.update(
        {
            "source": "generate-session",
            "project_id": project_id,
            "session_id": session_id,
            "artifact_anchor": anchor,
            "session_artifacts": snapshot.get("session_artifacts") or [],
            "result": snapshot.get("result") or {},
            "outline": snapshot.get("outline"),
        }
    )
    change = await project_space_service.create_candidate_change(
        project_id=project_id,
        user_id=user_id,
        title=body.get("title") or f"session-{session_id}-candidate-change",
        summary=body.get("summary"),
        payload=payload,
        session_id=session_id,
        base_version_id=anchor["based_on_version_id"],
    )
    return success_response(
        data={"change": _serialize_candidate_change(change)},
        message="候选变更提交成功",
    )


@router.put("/sessions/{session_id}/outline")
async def update_outline(
    session_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """更新大纲并回写会话（兼容别名，等价于 command_type=UPDATE_OUTLINE）。"""
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
    except ConflictError as e:
        _raise_conflict(str(e))

    # 查询最新大纲
    snapshot = await svc.get_session_snapshot(session_id, user_id)
    return success_response(
        data={"session": result["session"], "outline": snapshot.get("outline")},
        message="大纲更新成功",
    )


# ============================================================
# 6. POST /generate/sessions/{session_id}/confirm — 确认大纲（兼容别名）
# ============================================================


@router.post("/sessions/{session_id}/confirm")
async def confirm_outline(
    session_id: str,
    request: Request,
    body: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """确认大纲并继续生成（兼容别名，等价于 command_type=CONFIRM_OUTLINE）。"""
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
    except ConflictError as e:
        _raise_conflict(str(e))

    return success_response(data=result, message="大纲已确认，开始生成内容")


# ============================================================
# 7. POST /generate/sessions/{session_id}/outline/redraft — AI 重写（兼容别名）
# ============================================================


@router.post("/sessions/{session_id}/outline/redraft")
async def redraft_outline(
    session_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """请求 AI 重写大纲（兼容别名，等价于 command_type=REDRAFT_OUTLINE）。"""
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
    except ConflictError as e:
        _raise_conflict(str(e))

    return success_response(data=result, message="大纲重写请求已接受")


# ============================================================
# 8. POST /generate/sessions/{session_id}/resume — 恢复会话（兼容别名）
# ============================================================


@router.post("/sessions/{session_id}/resume")
async def resume_session(
    session_id: str,
    body: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
):
    """恢复中断会话（兼容别名，等价于 command_type=RESUME_SESSION）。"""
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
    except ConflictError as e:
        _raise_conflict(str(e))

    return success_response(data=result, message="会话已恢复")


# ============================================================
# 9. POST /generate/sessions/{session_id}/slides/{slide_id}/regenerate — 局部重绘（兼容别名）
# ============================================================


@router.post("/sessions/{session_id}/slides/{slide_id}/regenerate")
async def regenerate_slide(
    session_id: str,
    slide_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """局部重绘单页（兼容别名，等价于 command_type=REGENERATE_SLIDE）。"""
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
    except ConflictError as e:
        _raise_conflict(str(e))

    return success_response(data=result, message="局部重绘请求已接受")


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


# ============================================================
# 预览域端点（4 条）— 绑定 session_id
# ============================================================


@router.get("/sessions/{session_id}/preview")
async def get_session_preview(
    session_id: str,
    artifact_id: Optional[str] = Query(None, description="指定成果ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    """获取会话预览（session 作用域）。"""
    # 权限预检
    svc = _get_session_service()
    try:
        snapshot = await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    session_state = snapshot["session"]["state"]
    if session_state not in ("SUCCESS", "RENDERING", "GENERATING_CONTENT"):
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"当前状态 {session_state} 不支持预览，需等待生成完成",
        )

    project_id = snapshot["session"]["project_id"]
    bound_artifact = await _resolve_session_artifact_binding(
        project_id=project_id,
        session_id=session_id,
        artifact_id=artifact_id,
    )
    task, slides, lesson_plan, _ = await _load_preview_material(session_id, project_id)
    anchor = _build_artifact_anchor(session_id, bound_artifact)

    return success_response(
        data={
            "session_id": session_id,
            "task_id": task.id if task else None,
            "artifact_id": anchor["artifact_id"],
            "based_on_version_id": anchor["based_on_version_id"],
            "artifact_anchor": anchor,
            "render_version": snapshot["session"].get("render_version") or 1,
            "slides": slides,
            "lesson_plan": lesson_plan,
        },
        message="预览获取成功",
    )


@router.post("/sessions/{session_id}/preview/modify")
async def modify_session_preview(
    session_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """修改预览内容（转发给 REGENERATE_SLIDE command）。"""
    slide_id = body.get("slide_id")
    patch = body.get("patch")
    if not slide_id or not patch:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="slide_id 和 patch 为必填字段",
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
    except ConflictError as e:
        _raise_conflict(str(e))
    snapshot = await svc.get_session_snapshot(session_id, user_id)
    bound_artifact = await _resolve_session_artifact_binding(
        project_id=snapshot["session"]["project_id"],
        session_id=session_id,
        artifact_id=body.get("artifact_id"),
    )

    anchor = _build_artifact_anchor(session_id, bound_artifact)
    payload = {
        "session_id": session_id,
        "modify_task_id": (result.get("task_id") if isinstance(result, dict) else None)
        or f"modify-{session_id}",
        "status": "pending",
        "render_version": snapshot["session"].get("render_version") or 1,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "artifact_anchor": anchor,
    }
    if isinstance(result, dict):
        payload.update(result)
    return success_response(data=payload, message="预览修改请求已接受")


@router.get("/sessions/{session_id}/preview/slides/{slide_id}")
async def get_session_slide_preview(
    session_id: str,
    slide_id: str,
    artifact_id: Optional[str] = Query(None, description="指定来源成果ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    """获取单页幻灯片预览（session 作用域）。"""
    svc = _get_session_service()
    try:
        snapshot = await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    project_id = snapshot["session"]["project_id"]
    bound_artifact = await _resolve_session_artifact_binding(
        project_id=project_id,
        session_id=session_id,
        artifact_id=artifact_id,
    )
    _, slides, lesson_plan, _ = await _load_preview_material(session_id, project_id)
    anchor = _build_artifact_anchor(session_id, bound_artifact)

    selected_slide = None
    for item in slides:
        if item.get("id") == slide_id:
            selected_slide = item
            break
    if selected_slide is None and slide_id.isdigit():
        idx = int(slide_id)
        selected_slide = next(
            (item for item in slides if item.get("index") == idx), None
        )
    if not selected_slide:
        raise NotFoundException(
            message=f"幻灯片不存在: {slide_id}",
            error_code=ErrorCode.NOT_FOUND,
        )

    plans = (lesson_plan or {}).get("slides_plan", []) if lesson_plan else []
    teaching_plan = next(
        (plan for plan in plans if plan.get("slide_id") == selected_slide.get("id")),
        None,
    )

    related_slides = []
    current_index = selected_slide.get("index")
    for item in slides:
        index = item.get("index")
        if not isinstance(index, int) or not isinstance(current_index, int):
            continue
        if index == current_index - 1:
            related_slides.append(
                {
                    "slide_id": item.get("id"),
                    "title": item.get("title", ""),
                    "relation": "previous",
                }
            )
        elif index == current_index + 1:
            related_slides.append(
                {
                    "slide_id": item.get("id"),
                    "title": item.get("title", ""),
                    "relation": "next",
                }
            )

    return success_response(
        data={
            "session_id": session_id,
            "artifact_id": anchor["artifact_id"],
            "based_on_version_id": anchor["based_on_version_id"],
            "artifact_anchor": anchor,
            "slide": selected_slide,
            "teaching_plan": teaching_plan,
            "related_slides": related_slides,
        },
        message="页面预览获取成功",
    )


@router.post("/sessions/{session_id}/preview/export")
async def export_session(
    session_id: str,
    body: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
):
    """导出课件文件（session 作用域）。"""
    body = body or {}
    svc = _get_session_service()
    try:
        snapshot = await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )

    if snapshot["session"]["state"] != "SUCCESS":
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="只有状态为 SUCCESS 的会话才能导出",
        )

    expected_render_version = body.get("expected_render_version")
    if expected_render_version is not None:
        _validate_positive_int(expected_render_version, "expected_render_version")
        current_render_version = snapshot["session"].get("render_version") or 1
        if current_render_version != expected_render_version:
            _raise_conflict(
                f"渲染版本冲突：期望 {expected_render_version}，当前 {current_render_version}"
            )

    project_id = snapshot["session"]["project_id"]
    bound_artifact = await _resolve_session_artifact_binding(
        project_id=project_id,
        session_id=session_id,
        artifact_id=body.get("artifact_id"),
    )
    task, slides, lesson_plan, content = await _load_preview_material(
        session_id, project_id
    )
    anchor = _build_artifact_anchor(session_id, bound_artifact)
    export_format = str(body.get("format") or "markdown").lower()
    include_sources = bool(body.get("include_sources", True))
    if not include_sources:
        slides, lesson_plan = _without_sources(slides, lesson_plan)

    markdown_content = content.get("markdown_content", "")
    if export_format == "json":
        export_content = json.dumps(
            {
                "session_id": session_id,
                "slides": slides,
                "lesson_plan": lesson_plan,
                "markdown_content": markdown_content,
            },
            ensure_ascii=False,
        )
    elif export_format == "html":
        export_content = (
            "<!doctype html><html><body><pre>"
            + html.escape(markdown_content)
            + "</pre></body></html>"
        )
    else:
        export_format = "markdown"
        export_content = markdown_content

    result = snapshot.get("result") or {}
    return success_response(
        data={
            "session_id": session_id,
            "task_id": task.id if task else None,
            "artifact_id": anchor["artifact_id"],
            "based_on_version_id": anchor["based_on_version_id"],
            "artifact_anchor": anchor,
            "content": export_content,
            "format": export_format,
            "render_version": snapshot["session"].get("render_version") or 1,
            "ppt_url": result.get("ppt_url"),
            "word_url": result.get("word_url"),
            "version": result.get("version"),
        },
        message="导出成功",
    )
