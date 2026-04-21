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
from utils.exceptions import APIException, ErrorCode


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
    return await client.save_slide_scene(diego_run_id, slide_no, payload)
