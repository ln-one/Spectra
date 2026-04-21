from __future__ import annotations

from typing import Any

from services.diego_client import build_diego_client
from services.generation_session_service.diego_run_binding import (
    resolve_diego_binding_for_run,
    resolve_run_and_session,
)
from services.generation_session_service.diego_runtime_helpers import (
    get_diego_binding_from_options,
    parse_options,
)
from services.generation_session_service.diego_runtime_sync.preview_payload import (
    _build_spectra_preview_page,
    _load_or_init_run_preview_payload,
    _upsert_rendered_preview_page,
)
from services.generation_session_service.render_version_sync import (
    set_session_render_version,
)
from services.preview_helpers.cache import save_preview_content
from utils.exceptions import APIException, ErrorCode, ExternalServiceException


def _upstream_status_code(exc: ExternalServiceException) -> int:
    raw_status = (
        exc.details.get("status_code") if isinstance(exc.details, dict) else None
    )
    try:
        return int(raw_status or exc.status_code)
    except (TypeError, ValueError):
        return int(exc.status_code)


def _raise_scene_conflict_if_needed(exc: ExternalServiceException) -> None:
    if _upstream_status_code(exc) != 409:
        return
    details = {
        "reason": "diego_scene_conflict",
        "upstream_status_code": 409,
    }
    if isinstance(exc.details, dict) and isinstance(exc.details.get("body"), dict):
        details["upstream_body"] = exc.details["body"]
    raise APIException(
        status_code=409,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message=exc.message or "Diego scene version conflict",
        details=details,
        retryable=False,
    ) from exc


async def get_diego_slide_scene_for_run(
    *,
    db,
    run_id: str,
    slide_no: int,
    user_id: str,
) -> dict[str, Any]:
    if slide_no < 1:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="slide_no must be >= 1",
        )
    client = build_diego_client()
    if client is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="Diego 未启用或配置缺失（请检查 DIEGO_ENABLED / DIEGO_BASE_URL）",
        )
    run, session = await resolve_run_and_session(db=db, run_id=run_id, user_id=user_id)
    binding = await resolve_diego_binding_for_run(
        db=db,
        session=session,
        run=run,
        parse_options=parse_options,
        get_diego_binding_from_options=get_diego_binding_from_options,
    )
    diego_run_id = str(binding.get("diego_run_id") or "").strip()
    if not diego_run_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前运行 Diego run_id 缺失",
        )
    return await client.get_slide_scene(diego_run_id, slide_no)


async def get_diego_slide_asset_for_run(
    *,
    db,
    run_id: str,
    slide_no: int,
    asset_path: str,
    user_id: str,
) -> bytes:
    if slide_no < 1:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="slide_no must be >= 1",
        )
    requested_path = str(asset_path or "").strip()
    if not requested_path:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="asset path is required",
        )
    client = build_diego_client()
    if client is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="Diego 未启用或配置缺失（请检查 DIEGO_ENABLED / DIEGO_BASE_URL）",
        )
    run, session = await resolve_run_and_session(db=db, run_id=run_id, user_id=user_id)
    binding = await resolve_diego_binding_for_run(
        db=db,
        session=session,
        run=run,
        parse_options=parse_options,
        get_diego_binding_from_options=get_diego_binding_from_options,
    )
    diego_run_id = str(binding.get("diego_run_id") or "").strip()
    if not diego_run_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前运行 Diego run_id 缺失",
        )
    try:
        return await client.get_slide_asset(diego_run_id, slide_no, requested_path)
    except ExternalServiceException as exc:
        status_code = _upstream_status_code(exc)
        if status_code == 404:
            raise APIException(
                status_code=404,
                error_code=ErrorCode.NOT_FOUND,
                message=exc.message or "未找到图片资产",
            ) from exc
        raise


async def _sync_scene_save_preview(
    *,
    db,
    session_id: str,
    spectra_run_id: str,
    slide_no: int,
    result: dict[str, Any],
) -> None:
    preview = result.get("preview")
    if not isinstance(preview, dict):
        return
    page = _build_spectra_preview_page(
        spectra_run_id=spectra_run_id,
        slide_no=slide_no,
        preview=preview,
    )
    if page is None:
        return
    payload = await _load_or_init_run_preview_payload(
        db=db,
        session_id=session_id,
        spectra_run_id=spectra_run_id,
    )
    if _upsert_rendered_preview_page(payload, page):
        await save_preview_content(spectra_run_id, payload)
    await set_session_render_version(
        db=db,
        session_id=session_id,
        render_version=result.get("render_version"),
    )


async def save_diego_slide_scene_for_run(
    *,
    db,
    run_id: str,
    slide_no: int,
    payload: dict[str, Any],
    user_id: str,
) -> dict[str, Any]:
    if slide_no < 1:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="slide_no must be >= 1",
        )
    client = build_diego_client()
    if client is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="Diego 未启用或配置缺失（请检查 DIEGO_ENABLED / DIEGO_BASE_URL）",
        )
    run, session = await resolve_run_and_session(db=db, run_id=run_id, user_id=user_id)
    binding = await resolve_diego_binding_for_run(
        db=db,
        session=session,
        run=run,
        parse_options=parse_options,
        get_diego_binding_from_options=get_diego_binding_from_options,
    )
    diego_run_id = str(binding.get("diego_run_id") or "").strip()
    if not diego_run_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前运行 Diego run_id 缺失",
        )
    try:
        result = await client.save_slide_scene(diego_run_id, slide_no, payload)
    except ExternalServiceException as exc:
        _raise_scene_conflict_if_needed(exc)
        raise
    if isinstance(result, dict):
        await _sync_scene_save_preview(
            db=db,
            session_id=str(getattr(session, "id", "") or ""),
            spectra_run_id=str(getattr(run, "id", "") or run_id),
            slide_no=slide_no,
            result=result,
        )
    return result
