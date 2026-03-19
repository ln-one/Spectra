from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status

from routers.generate_sessions.candidate_changes import (
    attach_auto_candidate_change,
    build_session_artifact_anchor,
    load_session_preview_material,
    parse_candidate_change_payload,
    resolve_session_artifact_binding,
)
from routers.generate_sessions.shared import (
    get_session_service,
    parse_idempotency_key,
    raise_conflict,
    validate_optional_positive_int,
    validate_positive_int,
)
from services.generation_session_service import ConflictError
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
from utils.dependencies import get_current_user
from utils.exceptions import (
    APIException,
    ErrorCode,
    ForbiddenException,
    NotFoundException,
)
from utils.responses import success_response

router = APIRouter()

# Backward-compatible aliases for tests and monkeypatches.
_get_session_service = get_session_service
_parse_idempotency_key = parse_idempotency_key
_raise_conflict = raise_conflict
_validate_optional_positive_int = validate_optional_positive_int
_validate_positive_int = validate_positive_int
_resolve_session_artifact_binding = resolve_session_artifact_binding
_load_preview_material = load_session_preview_material
_build_artifact_anchor = build_session_artifact_anchor


async def _get_snapshot(session_id: str, user_id: str) -> dict:
    svc = _get_session_service()
    try:
        return await svc.get_session_snapshot(session_id, user_id)
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )


async def _resolve_anchor(session_id: str, snapshot: dict, artifact_id: Optional[str]):
    bound_artifact = await _resolve_session_artifact_binding(
        project_id=snapshot["session"]["project_id"],
        session_id=session_id,
        artifact_id=artifact_id,
    )
    return _build_artifact_anchor(session_id, bound_artifact)


@router.get("/sessions/{session_id}/preview")
async def get_session_preview(
    session_id: str,
    artifact_id: Optional[str] = Query(None, description="指定成果ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    """获取会话预览（session 作用域）。"""
    snapshot = await _get_snapshot(session_id, user_id)

    try:
        ensure_previewable_state(snapshot)
    except ValueError as exc:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=str(exc),
        )

    project_id = snapshot["session"]["project_id"]
    task, slides, lesson_plan, _ = await _load_preview_material(session_id, project_id)
    anchor = await _resolve_anchor(session_id, snapshot, artifact_id)

    return success_response(
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


@router.post("/sessions/{session_id}/preview/modify")
async def modify_session_preview(
    session_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """修改预览内容（转发给 REGENERATE_SLIDE command）。"""
    parse_candidate_change_payload(body.get("candidate_change"), "candidate_change")
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

    parsed_idempotency_key = _parse_idempotency_key(idempotency_key)
    generation_command = {
        "command_type": GenerationCommandType.REGENERATE_SLIDE.value,
        "slide_id": slide_id,
        "patch": patch,
        "expected_render_version": body.get("expected_render_version"),
    }

    svc = _get_session_service()
    try:
        result = await svc.execute_command(
            session_id=session_id,
            user_id=user_id,
            command=generation_command,
            idempotency_key=parsed_idempotency_key,
        )
    except ValueError:
        raise NotFoundException(message="会话不存在", error_code=ErrorCode.NOT_FOUND)
    except PermissionError:
        raise ForbiddenException(
            message="无权访问该会话", error_code=ErrorCode.FORBIDDEN
        )
    except ConflictError as exc:
        _raise_conflict(str(exc))

    snapshot = await _get_snapshot(session_id, user_id)
    anchor = await _resolve_anchor(session_id, snapshot, body.get("artifact_id"))

    payload = build_modify_payload(
        session_id=session_id,
        snapshot=snapshot,
        anchor=anchor,
        result=result if isinstance(result, dict) else None,
    )
    candidate_change = await attach_auto_candidate_change(
        session_id=session_id,
        user_id=user_id,
        snapshot=snapshot,
        body=body,
        candidate_change_body=body.get("candidate_change"),
        idempotency_key=parsed_idempotency_key,
        cache_scope="preview_modify_candidate_change",
        generation_command=generation_command,
        generation_result=result if isinstance(result, dict) else payload,
        trigger="preview_modify",
    )
    if candidate_change is not None:
        payload["candidate_change"] = candidate_change

    return success_response(data=payload, message="预览修改请求已接受")


@router.get("/sessions/{session_id}/preview/slides/{slide_id}")
async def get_session_slide_preview(
    session_id: str,
    slide_id: str,
    artifact_id: Optional[str] = Query(None, description="指定来源成果ID（可选）"),
    user_id: str = Depends(get_current_user),
):
    """获取单页幻灯片预览（session 作用域）。"""
    snapshot = await _get_snapshot(session_id, user_id)

    project_id = snapshot["session"]["project_id"]
    _, slides, lesson_plan, _ = await _load_preview_material(session_id, project_id)
    anchor = await _resolve_anchor(session_id, snapshot, artifact_id)

    try:
        selected_slide, teaching_plan, related_slides = resolve_slide_preview(
            slide_id=slide_id,
            slides=slides,
            lesson_plan=lesson_plan,
        )
    except LookupError as exc:
        raise NotFoundException(
            message=str(exc),
            error_code=ErrorCode.NOT_FOUND,
        )

    return success_response(
        data=build_slide_preview_payload(
            session_id=session_id,
            anchor=anchor,
            selected_slide=selected_slide,
            teaching_plan=teaching_plan,
            related_slides=related_slides,
        ),
        message="页面预览获取成功",
    )


@router.post("/sessions/{session_id}/preview/export")
async def export_session(
    session_id: str,
    body: Optional[dict] = None,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """导出课件文件（session 作用域）。"""
    body = body or {}
    parse_candidate_change_payload(body.get("candidate_change"), "candidate_change")
    parsed_idempotency_key = _parse_idempotency_key(idempotency_key)
    snapshot = await _get_snapshot(session_id, user_id)

    expected_render_version = body.get("expected_render_version")
    if expected_render_version is not None:
        _validate_positive_int(expected_render_version, "expected_render_version")
    try:
        ensure_exportable_state(snapshot, expected_render_version)
    except ValueError as exc:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=str(exc),
        )
    except RuntimeError as exc:
        _raise_conflict(str(exc))

    project_id = snapshot["session"]["project_id"]
    task, slides, lesson_plan, content = await _load_preview_material(
        session_id, project_id
    )
    anchor = await _resolve_anchor(session_id, snapshot, body.get("artifact_id"))
    export_format = str(body.get("format") or "markdown")
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
    candidate_change = await attach_auto_candidate_change(
        session_id=session_id,
        user_id=user_id,
        snapshot=snapshot,
        body=body,
        candidate_change_body=body.get("candidate_change"),
        idempotency_key=parsed_idempotency_key,
        cache_scope="preview_export_candidate_change",
        generation_command={
            "command_type": "EXPORT_PREVIEW",
            "format": export_format,
            "include_sources": bool(body.get("include_sources", True)),
        },
        generation_result=payload,
        trigger="preview_export",
    )
    if candidate_change is not None:
        payload["candidate_change"] = candidate_change

    return success_response(data=payload, message="导出成功")
