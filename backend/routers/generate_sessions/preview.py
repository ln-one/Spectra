from __future__ import annotations

import mimetypes
import json

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response

from schemas.preview import SaveSlideSceneRequest
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
from routers.generate_sessions.preview_runtime_guards import (
    find_slide_page_by_identifier,
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
from services.generation_session_service.diego_slide_scene import (
    get_diego_slide_asset_for_run,
    get_diego_slide_scene_for_run,
    save_diego_slide_scene_for_run,
)
from services.pexels_proxy import search_pexels_images
from utils.exceptions import APIException, ErrorCode, NotFoundException
from utils.responses import success_response
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


def _artifact_metadata_run_id(artifact) -> str | None:
    if artifact is None:
        return None
    metadata = getattr(artifact, "metadata", None)
    payload = metadata if isinstance(metadata, dict) else None
    if payload is None and isinstance(metadata, str) and metadata.strip():
        try:
            parsed = json.loads(metadata)
        except json.JSONDecodeError:
            parsed = None
        payload = parsed if isinstance(parsed, dict) else None
    if not isinstance(payload, dict):
        return None
    resolved = str(payload.get("run_id") or "").strip()
    return resolved or None


async def _resolve_preview_anchor(
    session_id: str,
    snapshot: dict,
    artifact_id: Optional[str],
    run_id: Optional[str],
    user_id: Optional[str] = None,
) -> dict:
    bound_artifact = await _resolve_session_artifact_binding(
        project_id=snapshot["session"]["project_id"],
        session_id=session_id,
        user_id=user_id,
        artifact_id=artifact_id,
        run_id=run_id,
    )
    anchor = _build_artifact_anchor(session_id, bound_artifact)
    artifact_run_id = _artifact_metadata_run_id(bound_artifact)
    if artifact_run_id:
        anchor["run_id"] = artifact_run_id
    if run_id:
        anchor["run_id"] = run_id
    return anchor


def _resolve_slide_no(slide_id: str, slides: list[dict]) -> int:
    slide_no = find_slide_page_by_identifier(slide_id, slides)
    if slide_no is not None:
        return slide_no
    raise NotFoundException(
        message=f"未找到页面: {slide_id}", error_code=ErrorCode.NOT_FOUND
    )


def _get_session_db():
    service = _get_session_service()
    db = getattr(service, "db", None) or getattr(service, "_db", None)
    if db is None:
        raise APIException(
            status_code=500,
            error_code=ErrorCode.INTERNAL_ERROR,
            message="GenerationSessionService database handle missing",
        )
    return db


async def _resolve_slide_context(
    *,
    session_id: str,
    slide_id: str,
    snapshot: dict,
    artifact_id: Optional[str],
    run_id: Optional[str],
    user_id: str,
) -> tuple[dict, int]:
    anchor = await _resolve_preview_anchor(
        session_id=session_id,
        snapshot=snapshot,
        artifact_id=artifact_id,
        run_id=run_id,
        user_id=user_id,
    )
    task_id = snapshot["session"].get("task_id")
    _, slides, _, _ = await _load_preview_material(
        session_id,
        snapshot["session"]["project_id"],
        anchor.get("artifact_id"),
        task_id,
        anchor.get("run_id"),
    )
    slide_no = _resolve_slide_no(slide_id, slides if isinstance(slides, list) else [])
    return anchor, slide_no


def _make_preview_anchor_resolver(user_id: str):
    async def _resolver(
        session_id: str,
        snapshot: dict,
        artifact_id: Optional[str],
        run_id: Optional[str],
    ) -> dict:
        return await _resolve_preview_anchor(
            session_id=session_id,
            snapshot=snapshot,
            artifact_id=artifact_id,
            run_id=run_id,
            user_id=user_id,
        )

    return _resolver


@router.get("/sessions/{session_id}/preview")
async def get_session_preview(
    session_id: str,
    artifact_id: Optional[str] = Query(None, description="指定成果 ID（可选）"),
    run_id: Optional[str] = Query(None, description="指定运行 ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    """获取会话预览（session 作用域）。"""
    return await get_session_preview_response(
        session_id=session_id,
        artifact_id=artifact_id,
        run_id=run_id,
        user_id=user_id,
        get_preview_snapshot_or_raise=_get_preview_snapshot_or_raise,
        resolve_preview_anchor=_make_preview_anchor_resolver(user_id),
        load_preview_material=_load_preview_material,
    )


@router.post("/sessions/{session_id}/preview/modify")
async def modify_session_preview(
    session_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """修改预览内容（转发给 REGENERATE_SLIDE command）。"""
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
        resolve_preview_anchor=_make_preview_anchor_resolver(user_id),
        load_preview_material=_load_preview_material,
        attach_auto_candidate_change=attach_auto_candidate_change,
    )


@router.get("/sessions/{session_id}/preview/slides/{slide_id}")
async def get_session_slide_preview(
    session_id: str,
    slide_id: str,
    artifact_id: Optional[str] = Query(None, description="指定来源成果 ID（可选）"),
    run_id: Optional[str] = Query(None, description="指定运行 ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    """获取单页幻灯片预览（session 作用域）。"""
    return await get_session_slide_preview_response(
        session_id=session_id,
        slide_id=slide_id,
        artifact_id=artifact_id,
        run_id=run_id,
        user_id=user_id,
        get_preview_snapshot_or_raise=_get_preview_snapshot_or_raise,
        resolve_preview_anchor=_make_preview_anchor_resolver(user_id),
        load_preview_material=_load_preview_material,
    )


@router.get("/sessions/{session_id}/preview/slides/{slide_id}/scene")
async def get_session_slide_scene(
    session_id: str,
    slide_id: str,
    artifact_id: Optional[str] = Query(None, description="指定来源成果 ID（可选）"),
    run_id: Optional[str] = Query(None, description="指定运行 ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    snapshot = await _get_preview_snapshot_or_raise(session_id, user_id)
    anchor, slide_no = await _resolve_slide_context(
        session_id=session_id,
        slide_id=slide_id,
        snapshot=snapshot,
        artifact_id=artifact_id,
        run_id=run_id,
        user_id=user_id,
    )
    resolved_run_id = str(anchor.get("run_id") or "").strip()
    if not resolved_run_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前预览未绑定运行，无法加载单页编辑场景",
        )
    scene = await get_diego_slide_scene_for_run(
        db=_get_session_db(),
        run_id=resolved_run_id,
        slide_no=slide_no,
        user_id=user_id,
    )
    return success_response(data=scene, message="单页编辑场景获取成功")


@router.post("/sessions/{session_id}/preview/slides/{slide_id}/scene/save")
async def save_session_slide_scene(
    session_id: str,
    slide_id: str,
    body: SaveSlideSceneRequest,
    artifact_id: Optional[str] = Query(None, description="指定来源成果 ID（可选）"),
    run_id: Optional[str] = Query(None, description="指定运行 ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    snapshot = await _get_preview_snapshot_or_raise(session_id, user_id)
    anchor, slide_no = await _resolve_slide_context(
        session_id=session_id,
        slide_id=slide_id,
        snapshot=snapshot,
        artifact_id=artifact_id,
        run_id=run_id,
        user_id=user_id,
    )
    resolved_run_id = str(anchor.get("run_id") or "").strip()
    if not resolved_run_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前预览未绑定运行，无法保存单页编辑场景",
        )
    result = await save_diego_slide_scene_for_run(
        db=_get_session_db(),
        run_id=resolved_run_id,
        slide_no=slide_no,
        payload=body.model_dump(mode="json"),
        user_id=user_id,
    )
    return success_response(data=result, message="单页编辑场景保存成功")


@router.get("/sessions/{session_id}/preview/slides/{slide_id}/asset")
async def get_session_slide_asset(
    session_id: str,
    slide_id: str,
    path: str = Query(..., description="页面内图片相对路径"),
    artifact_id: Optional[str] = Query(None, description="指定来源成果 ID（可选）"),
    run_id: Optional[str] = Query(None, description="指定运行 ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    snapshot = await _get_preview_snapshot_or_raise(session_id, user_id)
    anchor, slide_no = await _resolve_slide_context(
        session_id=session_id,
        slide_id=slide_id,
        snapshot=snapshot,
        artifact_id=artifact_id,
        run_id=run_id,
        user_id=user_id,
    )
    resolved_run_id = str(anchor.get("run_id") or "").strip()
    if not resolved_run_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前预览未绑定运行，无法加载页面图片资产",
        )
    asset_bytes = await get_diego_slide_asset_for_run(
        db=_get_session_db(),
        run_id=resolved_run_id,
        slide_no=slide_no,
        asset_path=path,
        user_id=user_id,
    )
    media_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return Response(content=asset_bytes, media_type=media_type)


@router.get("/assets/pexels/search")
async def search_pexels_assets(
    q: str = Query(..., description="图片搜索词"),
    user_id: str = Depends(get_current_user),
):
    del user_id
    result = await search_pexels_images(q, per_page=4)
    return success_response(data=result, message="图片搜索成功")


@router.post("/sessions/{session_id}/preview/export")
async def export_session(
    session_id: str,
    body: Optional[dict] = None,
    run_id: Optional[str] = Query(None, description="指定运行 ID（可选）"),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """导出课件文件（session 作用域）。"""
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
        resolve_preview_anchor=_make_preview_anchor_resolver(user_id),
        load_preview_material=_load_preview_material,
        attach_auto_candidate_change=attach_auto_candidate_change,
    )
