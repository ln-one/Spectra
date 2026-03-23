from __future__ import annotations

import asyncio
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.responses import StreamingResponse

from routers.generate_sessions.shared import (
    get_session_service,
    get_task_queue_service,
    load_session_runtime_or_raise,
    load_session_snapshot_or_raise,
    parse_idempotency_key,
    raise_conflict,
)
from services.application.access import get_owned_project
from services.database import db_service
from services.generation_session_service.constants import SessionOutputType
from services.generation_session_service.run_queries import (
    create_outline_session_run,
    get_latest_active_session_run_by_tool,
    resolve_output_tool_type,
)
from services.generation_session_service.session_history import serialize_session_run
from services.platform.state_transition_guard import GenerationState
from utils.dependencies import get_current_user, get_current_user_optional
from utils.exceptions import (
    APIException,
    ErrorCode,
    ForbiddenException,
    UnauthorizedException,
)
from utils.responses import success_response

router = APIRouter()

_EVENTS_ACCEPT_JSON = "application/json"
_EVENTS_ACCEPT_SSE = "text/event-stream"


def _resolve_events_accept_mode(
    *,
    query_accept: Optional[str],
    header_accept: Optional[str],
) -> str:
    """Resolve events transport mode with query-parameter priority.

    Backward compatibility:
    - keep supporting `accept=application/json` query parameter
    - additionally allow standard HTTP Accept negotiation for SDK clients
    """
    if query_accept:
        normalized = query_accept.strip().lower()
        if _EVENTS_ACCEPT_JSON in normalized:
            return _EVENTS_ACCEPT_JSON
        if _EVENTS_ACCEPT_SSE in normalized:
            return _EVENTS_ACCEPT_SSE
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=(
                "accept must be one of "
                f"[{_EVENTS_ACCEPT_SSE}, {_EVENTS_ACCEPT_JSON}]"
            ),
        )

    normalized_header = (header_accept or "").lower()
    if _EVENTS_ACCEPT_JSON in normalized_header:
        return _EVENTS_ACCEPT_JSON
    if _EVENTS_ACCEPT_SSE in normalized_header:
        return _EVENTS_ACCEPT_SSE
    return _EVENTS_ACCEPT_SSE


async def _find_owned_session_candidate(
    *,
    project_id: str,
    user_id: str,
    client_session_id: Optional[str],
):
    if not client_session_id:
        return None
    return await db_service.db.generationsession.find_first(
        where={
            "projectId": project_id,
            "userId": user_id,
            "OR": [
                {"id": client_session_id},
                {"clientSessionId": client_session_id},
            ],
        }
    )


async def _ensure_no_active_run_conflict(
    *,
    project_id: str,
    user_id: str,
    output_type: str,
    client_session_id: Optional[str],
    bootstrap_only: bool,
) -> None:
    if bootstrap_only:
        return
    session_candidate = await _find_owned_session_candidate(
        project_id=project_id,
        user_id=user_id,
        client_session_id=client_session_id,
    )
    if not session_candidate:
        return

    tool_type = resolve_output_tool_type(output_type)
    active_run = await get_latest_active_session_run_by_tool(
        db_service.db,
        session_candidate.id,
        tool_type,
    )
    if not active_run:
        return

    run_data = serialize_session_run(active_run)
    raise_conflict(
        "当前会话已有进行中的 Run，请继续该 Run 或中断后重试",
        details={
            "run": run_data,
            "run_id": run_data.get("run_id") if isinstance(run_data, dict) else None,
            "run_status": (
                run_data.get("run_status") if isinstance(run_data, dict) else None
            ),
            "run_step": (
                run_data.get("run_step") if isinstance(run_data, dict) else None
            ),
            "tool_type": tool_type,
        },
    )


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
        sessions, total = await asyncio.gather(
            db_service.db.generationsession.find_many(
                where={"projectId": project_id},
                skip=skip,
                take=limit,
                order={"updatedAt": "desc"},
            ),
            db_service.db.generationsession.count(where={"projectId": project_id}),
        )

        payload = [
            {
                "session_id": s.id,
                "project_id": s.projectId,
                "base_version_id": getattr(s, "baseVersionId", None),
                "output_type": s.outputType,
                "state": s.state,
                "display_title": getattr(s, "displayTitle", None),
                "display_title_source": getattr(s, "displayTitleSource", None),
                "display_title_updated_at": (
                    s.displayTitleUpdatedAt.isoformat()
                    if getattr(s, "displayTitleUpdatedAt", None)
                    else None
                ),
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
    bootstrap_only = bool(body.get("bootstrap_only"))
    client_session_id = body.get("client_session_id")
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
            message="No permission to access this project",
            error_code=ErrorCode.FORBIDDEN,
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

    await _ensure_no_active_run_conflict(
        project_id=project_id,
        user_id=user_id,
        output_type=output_type,
        client_session_id=client_session_id,
        bootstrap_only=bootstrap_only,
    )

    session_ref = await svc.create_session(
        project_id=project_id,
        user_id=user_id,
        output_type=output_type,
        options=body.get("options"),
        client_session_id=client_session_id,
        bootstrap_only=bootstrap_only,
        task_queue_service=task_queue_svc,
    )

    run_payload = None
    if (
        not bootstrap_only
        and session_ref.get("state") == GenerationState.DRAFTING_OUTLINE.value
    ):
        run_payload = await create_outline_session_run(
            db=db_service.db,
            session_id=session_ref["session_id"],
            project_id=project_id,
            output_type=output_type,
        )

    resp = success_response(
        data={"session": session_ref, "run": run_payload},
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
    payload = await load_session_snapshot_or_raise(svc, session_id, user_id)

    return success_response(data=payload, message="查询成功")


@router.get("/sessions/{session_id}/events")
async def get_session_events(
    request: Request,
    session_id: str,
    cursor: Optional[str] = Query(None, description="断线续传游标"),
    accept: Optional[str] = Query(None),
    accept_header: Optional[str] = Header(None, alias="Accept"),
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

    await load_session_runtime_or_raise(svc, session_id, user_id)

    mode = _resolve_events_accept_mode(
        query_accept=request.query_params.get("accept") or accept,
        header_accept=accept_header,
    )

    if mode == _EVENTS_ACCEPT_JSON:
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
