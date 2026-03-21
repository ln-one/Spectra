from __future__ import annotations

import logging
import time
from typing import Awaitable, Callable, Optional
from uuid import UUID

from fastapi import status

from routers.generate_sessions.preview_runtime_support import (
    CandidateChangeAttacher,
    PreviewAnchorResolver,
    PreviewMaterialLoader,
    SessionSnapshotLoader,
    attach_candidate_change_if_needed,
    load_preview_material_for_snapshot,
)
from services.platform.state_transition_guard import GenerationCommandType
from services.preview_helpers import (
    build_export_payload,
    build_modify_payload,
    build_preview_payload,
    build_slide_preview_payload,
    ensure_exportable_state,
    ensure_previewable_state,
    resolve_slide_preview,
)
from utils.exceptions import APIException, ErrorCode, NotFoundException
from utils.responses import success_response

logger = logging.getLogger(__name__)


async def get_session_preview_response(
    *,
    session_id: str,
    artifact_id: Optional[str],
    user_id: str,
    get_preview_snapshot_or_raise: SessionSnapshotLoader,
    resolve_preview_anchor: PreviewAnchorResolver,
    load_preview_material: PreviewMaterialLoader,
):
    started_at = time.perf_counter()
    snapshot = await get_preview_snapshot_or_raise(session_id, user_id)
    try:
        ensure_previewable_state(snapshot)
    except ValueError as exc:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=str(exc),
        )
    anchor, task, slides, lesson_plan, _ = await load_preview_material_for_snapshot(
        session_id=session_id,
        snapshot=snapshot,
        artifact_id=artifact_id,
        resolve_preview_anchor=resolve_preview_anchor,
        load_preview_material=load_preview_material,
    )
    response = success_response(
        data=build_preview_payload(
            session_id=session_id,
            snapshot=snapshot,
            task=task,
            slides=slides,
            lesson_plan=lesson_plan,
            anchor=anchor,
        ),
        message="预览获取成功",
    )
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logger.info(
        "session_preview_loaded session_id=%s artifact_id=%s duration_ms=%s",
        session_id,
        anchor.get("artifact_id"),
        duration_ms,
        extra={
            "session_id": session_id,
            "artifact_id": anchor.get("artifact_id"),
            "duration_ms": duration_ms,
        },
    )
    return response


async def modify_session_preview_response(
    *,
    session_id: str,
    body: dict,
    user_id: str,
    idempotency_key: Optional[UUID],
    parse_candidate_change_payload: Callable[[object, str], None],
    parse_idempotency_key: Callable[[Optional[UUID]], Optional[UUID]],
    validate_optional_positive_int: Callable[[Optional[int], str], None],
    get_session_service: Callable[[], object],
    execute_session_command_or_raise: Callable[..., Awaitable[object]],
    get_preview_snapshot_or_raise: SessionSnapshotLoader,
    resolve_modify_expected_render_version: Callable[[dict], Optional[int]],
    resolve_preview_anchor: PreviewAnchorResolver,
    attach_auto_candidate_change: CandidateChangeAttacher,
):
    parse_candidate_change_payload(body.get("candidate_change"), "candidate_change")
    slide_id = body.get("slide_id")
    patch = body.get("patch")
    if not slide_id or not patch:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="slide_id 和 patch 为必填字段",
        )

    expected_render_version = resolve_modify_expected_render_version(body)
    validate_optional_positive_int(expected_render_version, "expected_render_version")
    parsed_idempotency_key = parse_idempotency_key(idempotency_key)
    generation_command = {
        "command_type": GenerationCommandType.REGENERATE_SLIDE.value,
        "slide_id": slide_id,
        "patch": patch,
        "expected_render_version": expected_render_version,
    }
    result = await execute_session_command_or_raise(
        get_session_service(),
        session_id=session_id,
        user_id=user_id,
        command=generation_command,
        idempotency_key=parsed_idempotency_key,
    )
    snapshot = await get_preview_snapshot_or_raise(session_id, user_id)
    anchor = await resolve_preview_anchor(session_id, snapshot, body.get("artifact_id"))
    payload = build_modify_payload(
        session_id=session_id,
        snapshot=snapshot,
        anchor=anchor,
        result=result if isinstance(result, dict) else None,
    )
    payload = await attach_candidate_change_if_needed(
        session_id=session_id,
        user_id=user_id,
        snapshot=snapshot,
        body=body,
        parsed_idempotency_key=parsed_idempotency_key,
        cache_scope="preview_modify_candidate_change",
        generation_command=generation_command,
        generation_result=result if isinstance(result, dict) else payload,
        trigger="preview_modify",
        payload=payload,
        attach_auto_candidate_change=attach_auto_candidate_change,
    )
    return success_response(data=payload, message="预览修改请求已接受")


async def get_session_slide_preview_response(
    *,
    session_id: str,
    slide_id: str,
    artifact_id: Optional[str],
    user_id: str,
    get_preview_snapshot_or_raise: SessionSnapshotLoader,
    resolve_preview_anchor: PreviewAnchorResolver,
    load_preview_material: PreviewMaterialLoader,
):
    snapshot = await get_preview_snapshot_or_raise(session_id, user_id)
    anchor, _, slides, lesson_plan, _ = await load_preview_material_for_snapshot(
        session_id=session_id,
        snapshot=snapshot,
        artifact_id=artifact_id,
        resolve_preview_anchor=resolve_preview_anchor,
        load_preview_material=load_preview_material,
    )
    try:
        selected_slide, teaching_plan, related_slides = resolve_slide_preview(
            slide_id=slide_id,
            slides=slides,
            lesson_plan=lesson_plan,
        )
    except LookupError as exc:
        raise NotFoundException(message=str(exc), error_code=ErrorCode.NOT_FOUND)
    return success_response(
        data=build_slide_preview_payload(
            session_id=session_id,
            snapshot=snapshot,
            anchor=anchor,
            selected_slide=selected_slide,
            teaching_plan=teaching_plan,
            related_slides=related_slides,
        ),
        message="页面预览获取成功",
    )


async def export_session_response(
    *,
    session_id: str,
    body: Optional[dict],
    user_id: str,
    idempotency_key: Optional[UUID],
    parse_candidate_change_payload: Callable[[object, str], None],
    parse_idempotency_key: Callable[[Optional[UUID]], Optional[UUID]],
    validate_positive_int: Callable[[Optional[int], str], None],
    raise_conflict: Callable[[str], None],
    normalize_export_format: Callable[[object], str],
    get_preview_snapshot_or_raise: SessionSnapshotLoader,
    resolve_preview_anchor: PreviewAnchorResolver,
    load_preview_material: PreviewMaterialLoader,
    attach_auto_candidate_change: CandidateChangeAttacher,
):
    started_at = time.perf_counter()
    body = body or {}
    parse_candidate_change_payload(body.get("candidate_change"), "candidate_change")
    parsed_idempotency_key = parse_idempotency_key(idempotency_key)
    export_format = normalize_export_format(body.get("format"))
    snapshot = await get_preview_snapshot_or_raise(session_id, user_id)
    expected_render_version = body.get("expected_render_version")
    if expected_render_version is not None:
        validate_positive_int(expected_render_version, "expected_render_version")
    try:
        ensure_exportable_state(snapshot, expected_render_version)
    except ValueError as exc:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=str(exc),
        )
    except RuntimeError as exc:
        raise_conflict(str(exc))
    anchor, task, slides, lesson_plan, content = (
        await load_preview_material_for_snapshot(
            session_id=session_id,
            snapshot=snapshot,
            artifact_id=body.get("artifact_id"),
            resolve_preview_anchor=resolve_preview_anchor,
            load_preview_material=load_preview_material,
        )
    )
    payload = build_export_payload(
        session_id=session_id,
        snapshot=snapshot,
        task=task,
        slides=slides,
        lesson_plan=lesson_plan,
        content=content,
        anchor=anchor,
        export_format=export_format,
        include_sources=bool(body.get("include_sources", True)),
    )
    payload = await attach_candidate_change_if_needed(
        session_id=session_id,
        user_id=user_id,
        snapshot=snapshot,
        body=body,
        parsed_idempotency_key=parsed_idempotency_key,
        cache_scope="preview_export_candidate_change",
        generation_command={
            "command_type": "EXPORT_PREVIEW",
            "format": export_format,
            "include_sources": bool(body.get("include_sources", True)),
        },
        generation_result=payload,
        trigger="preview_export",
        payload=payload,
        attach_auto_candidate_change=attach_auto_candidate_change,
    )
    response = success_response(data=payload, message="导出成功")
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logger.info(
        (
            "session_preview_exported session_id=%s "
            "format=%s artifact_id=%s duration_ms=%s"
        ),
        session_id,
        export_format,
        anchor.get("artifact_id"),
        duration_ms,
        extra={
            "session_id": session_id,
            "export_format": export_format,
            "artifact_id": anchor.get("artifact_id"),
            "duration_ms": duration_ms,
        },
    )
    return response
