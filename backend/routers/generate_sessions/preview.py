from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query

from routers.generate_sessions.candidate_changes import (
    attach_auto_candidate_change,
    build_session_artifact_anchor,
    load_session_preview_material,
    parse_candidate_change_payload,
    resolve_session_artifact_binding,
)
from routers.generate_sessions.preview_contract import (
    normalize_export_format,
    resolve_modify_expected_render_version,
)
from routers.generate_sessions.preview_runtime import (
    export_session_response,
    get_session_preview_response,
    get_session_slide_preview_response,
    modify_session_preview_response,
)
from routers.generate_sessions.shared import (
    execute_session_command_or_raise,
    get_session_service,
    load_session_preview_snapshot_or_raise,
    parse_idempotency_key,
    raise_conflict,
    validate_optional_positive_int,
    validate_positive_int,
)
from utils.dependencies import get_current_user

router = APIRouter()
_get_session_service, _parse_idempotency_key, _raise_conflict = (
    get_session_service,
    parse_idempotency_key,
    raise_conflict,
)
_validate_optional_positive_int, _validate_positive_int = (
    validate_optional_positive_int,
    validate_positive_int,
)
_resolve_session_artifact_binding, _load_preview_material, _build_artifact_anchor = (
    resolve_session_artifact_binding,
    load_session_preview_material,
    build_session_artifact_anchor,
)


async def _get_preview_snapshot_or_raise(session_id: str, user_id: str) -> dict:
    return await load_session_preview_snapshot_or_raise(
        _get_session_service(),
        session_id,
        user_id,
    )


async def _resolve_preview_anchor(
    session_id: str,
    snapshot: dict,
    artifact_id: Optional[str],
    run_id: Optional[str],
) -> dict:
    bound_artifact = await _resolve_session_artifact_binding(
        project_id=snapshot["session"]["project_id"],
        session_id=session_id,
        artifact_id=artifact_id,
        run_id=run_id,
    )
    anchor = _build_artifact_anchor(session_id, bound_artifact)
    if run_id:
        anchor["run_id"] = run_id
    return anchor


@router.get("/sessions/{session_id}/preview")
async def get_session_preview(
    session_id: str,
    artifact_id: Optional[str] = Query(None, description="鎸囧畾鎴愭灉ID锛堝彲閫夛級"),
    run_id: Optional[str] = Query(None, description="鎸囧畾运行ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    """鑾峰彇浼氳瘽棰勮锛坰ession 浣滅敤鍩燂級銆?"""
    return await get_session_preview_response(
        session_id=session_id,
        artifact_id=artifact_id,
        run_id=run_id,
        user_id=user_id,
        get_preview_snapshot_or_raise=_get_preview_snapshot_or_raise,
        resolve_preview_anchor=_resolve_preview_anchor,
        load_preview_material=_load_preview_material,
    )


@router.post("/sessions/{session_id}/preview/modify")
async def modify_session_preview(
    session_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """淇敼棰勮鍐呭锛堣浆鍙戠粰 REGENERATE_SLIDE command锛夈€?"""
    return await modify_session_preview_response(
        session_id=session_id,
        body=body,
        user_id=user_id,
        idempotency_key=idempotency_key,
        parse_candidate_change_payload=parse_candidate_change_payload,
        parse_idempotency_key=_parse_idempotency_key,
        validate_optional_positive_int=_validate_optional_positive_int,
        get_session_service=_get_session_service,
        execute_session_command_or_raise=execute_session_command_or_raise,
        get_preview_snapshot_or_raise=_get_preview_snapshot_or_raise,
        resolve_modify_expected_render_version=resolve_modify_expected_render_version,
        resolve_preview_anchor=_resolve_preview_anchor,
        attach_auto_candidate_change=attach_auto_candidate_change,
    )


@router.get("/sessions/{session_id}/preview/slides/{slide_id}")
async def get_session_slide_preview(
    session_id: str,
    slide_id: str,
    artifact_id: Optional[str] = Query(None, description="鎸囧畾鏉ユ簮鎴愭灉ID锛堝彲閫夛級"),
    run_id: Optional[str] = Query(None, description="鎸囧畾运行ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    """鑾峰彇鍗曢〉骞荤伅鐗囬瑙堬紙session 浣滅敤鍩燂級銆?"""
    return await get_session_slide_preview_response(
        session_id=session_id,
        slide_id=slide_id,
        artifact_id=artifact_id,
        run_id=run_id,
        user_id=user_id,
        get_preview_snapshot_or_raise=_get_preview_snapshot_or_raise,
        resolve_preview_anchor=_resolve_preview_anchor,
        load_preview_material=_load_preview_material,
    )


@router.post("/sessions/{session_id}/preview/export")
async def export_session(
    session_id: str,
    body: Optional[dict] = None,
    run_id: Optional[str] = Query(None, description="鎸囧畾运行ID（可选）"),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """瀵煎嚭璇句欢鏂囦欢锛坰ession 浣滅敤鍩燂級銆?"""
    return await export_session_response(
        session_id=session_id,
        body=body,
        run_id=run_id,
        user_id=user_id,
        idempotency_key=idempotency_key,
        parse_candidate_change_payload=parse_candidate_change_payload,
        parse_idempotency_key=_parse_idempotency_key,
        validate_positive_int=_validate_positive_int,
        raise_conflict=_raise_conflict,
        normalize_export_format=normalize_export_format,
        get_preview_snapshot_or_raise=_get_preview_snapshot_or_raise,
        resolve_preview_anchor=_resolve_preview_anchor,
        load_preview_material=_load_preview_material,
        attach_auto_candidate_change=attach_auto_candidate_change,
    )
