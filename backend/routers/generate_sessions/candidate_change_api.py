from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header

from routers.generate_sessions.candidate_changes import (
    create_session_candidate_change,
    parse_candidate_change_payload,
    serialize_candidate_change,
)
from routers.generate_sessions.shared import (
    get_session_service,
    load_session_snapshot_or_raise,
    parse_idempotency_key,
)
from services.database import db_service
from services.project_space_service.service import project_space_service
from utils.dependencies import get_current_user
from utils.responses import success_response

router = APIRouter()

_get_session_service = get_session_service


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
    snapshot = await load_session_snapshot_or_raise(svc, session_id, user_id)

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
    snapshot = await load_session_snapshot_or_raise(svc, session_id, user_id)

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
