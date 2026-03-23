from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from routers.generate_sessions.shared import (
    get_session_service,
    load_session_snapshot_or_raise,
)
from services.database import db_service
from services.generation_session_service.run_queries import (
    get_session_run,
    list_session_runs,
)
from utils.dependencies import get_current_user
from utils.exceptions import ErrorCode, NotFoundException
from utils.responses import success_response

router = APIRouter()


@router.get("/sessions/{session_id}/runs")
async def get_session_runs(
    session_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    svc = get_session_service()
    await load_session_snapshot_or_raise(svc, session_id, user_id)
    payload = await list_session_runs(
        db=db_service.db,
        session_id=session_id,
        page=page,
        limit=limit,
    )
    return success_response(data=payload, message="获取会话运行列表成功")


@router.get("/sessions/{session_id}/runs/{run_id}")
async def get_session_run_detail(
    session_id: str,
    run_id: str,
    user_id: str = Depends(get_current_user),
):
    svc = get_session_service()
    await load_session_snapshot_or_raise(svc, session_id, user_id)
    run = await get_session_run(db_service.db, session_id, run_id)
    if not run:
        raise NotFoundException(
            message=f"运行不存在: {run_id}",
            error_code=ErrorCode.NOT_FOUND,
        )
    from services.generation_session_service.session_history import (
        serialize_session_run,
    )

    return success_response(
        data={"run": serialize_session_run(run)},
        message="获取会话运行详情成功",
    )
