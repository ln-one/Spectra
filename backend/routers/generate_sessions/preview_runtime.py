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


def _raise_run_not_ready(run_id: str) -> None:
    raise APIException(
        status_code=status.HTTP_409_CONFLICT,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message="指定运行尚未产出可预览内容",
        details={
            "reason": "run_not_ready",
            "run_id": run_id,
        },
    )


def _resolve_modify_instruction(body: dict) -> str:
    instruction = str(body.get("instruction") or "").strip()
    if not instruction:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="instruction 字段为必填",
        )
    return instruction


def _coerce_positive_int(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 1:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed >= 1 else None
    return None


def _resolve_target_slide_id(body: dict, slides: list[dict]) -> tuple[str, int]:
    context = body.get("context") if isinstance(body.get("context"), dict) else {}
    slide_id = (
        str(body.get("slide_id") or "").strip()
        or str(body.get("current_slide_id") or "").strip()
        or str(body.get("active_slide_id") or "").strip()
        or str(context.get("slide_id") or "").strip()
        or str(context.get("current_slide_id") or "").strip()
        or str(context.get("active_slide_id") or "").strip()
    )
    if slide_id:
        for slide in slides:
            if str(slide.get("id") or "").strip() == slide_id:
                page = _coerce_positive_int((slide.get("index") or 0) + 1) or 1
                return slide_id, page
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"未找到指定 slide_id: {slide_id}",
        )

    target_page = _coerce_positive_int(body.get("slide_index"))
    if target_page is None:
        raw_target_slides = body.get("target_slides")
        if isinstance(raw_target_slides, list) and raw_target_slides:
            target_page = _coerce_positive_int(raw_target_slides[0])
    if target_page is None:
        target_page = (
            _coerce_positive_int(body.get("active_page"))
            or _coerce_positive_int(body.get("current_page"))
            or _coerce_positive_int(body.get("page"))
            or _coerce_positive_int(context.get("active_page"))
            or _coerce_positive_int(context.get("current_page"))
            or _coerce_positive_int(context.get("page"))
        )

    if target_page is not None:
        # API 对外 slide_index 从 1 开始；内部 slide.index 以 0 为主。
        for expected in (target_page - 1, target_page):
            for slide in slides:
                if slide.get("index") == expected:
                    resolved_slide_id = str(slide.get("id") or "").strip()
                    if resolved_slide_id:
                        return resolved_slide_id, target_page
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"未找到指定 slide_index: {target_page}",
        )

    # v1 默认当前页：若请求未传页码/slide_id，则回退当前预览首张。
    ordered = sorted(
        (s for s in slides if str(s.get("id") or "").strip()),
        key=lambda item: int(item.get("index") or 0),
    )
    if not ordered:
        raise APIException(
            status_code=status.HTTP_409_CONFLICT,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前会话暂无可修改的预览页",
        )
    first = ordered[0]
    return str(first.get("id")), int(first.get("index") or 0) + 1


async def get_session_preview_response(
    *,
    session_id: str,
    artifact_id: Optional[str],
    run_id: Optional[str],
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
    anchor, task, slides, lesson_plan, content = (
        await load_preview_material_for_snapshot(
            session_id=session_id,
            snapshot=snapshot,
            artifact_id=artifact_id,
            run_id=run_id,
            resolve_preview_anchor=resolve_preview_anchor,
            load_preview_material=load_preview_material,
        )
    )
    if run_id and task is None:
        _raise_run_not_ready(run_id)

    response = success_response(
        data=build_preview_payload(
            session_id=session_id,
            snapshot=snapshot,
            task=task,
            slides=slides,
            lesson_plan=lesson_plan,
            anchor=anchor,
            rendered_preview=(
                content.get("rendered_preview") if isinstance(content, dict) else None
            ),
        ),
        message="棰勮鑾峰彇鎴愬姛",
    )
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logger.info(
        "session_preview_loaded session_id=%s artifact_id=%s run_id=%s duration_ms=%s",
        session_id,
        anchor.get("artifact_id"),
        run_id,
        duration_ms,
        extra={
            "session_id": session_id,
            "artifact_id": anchor.get("artifact_id"),
            "run_id": run_id,
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
    load_preview_material: PreviewMaterialLoader,
    attach_auto_candidate_change: CandidateChangeAttacher,
):
    parse_candidate_change_payload(body.get("candidate_change"), "candidate_change")
    instruction = _resolve_modify_instruction(body)
    patch = body.get("patch") if isinstance(body.get("patch"), dict) else None
    if patch is None:
        patch = {"schema_version": 1, "operations": []}

    expected_render_version = resolve_modify_expected_render_version(body)
    validate_optional_positive_int(expected_render_version, "expected_render_version")
    snapshot = await get_preview_snapshot_or_raise(session_id, user_id)
    anchor = await resolve_preview_anchor(
        session_id,
        snapshot,
        body.get("artifact_id"),
        body.get("run_id"),
    )
    task_id = snapshot["session"].get("task_id")
    _, slides, _, _ = await load_preview_material(
        session_id,
        snapshot["session"]["project_id"],
        anchor.get("artifact_id"),
        task_id,
        anchor.get("run_id"),
    )
    slide_id, slide_index = _resolve_target_slide_id(body, slides)
    parsed_idempotency_key = parse_idempotency_key(idempotency_key)
    generation_command = {
        "command_type": GenerationCommandType.REGENERATE_SLIDE.value,
        "slide_id": slide_id,
        "slide_index": slide_index,
        "instruction": instruction,
        "scope": body.get("scope") or "current_slide_only",
        "preserve_style": bool(body.get("preserve_style", True)),
        "preserve_layout": bool(body.get("preserve_layout", True)),
        "preserve_deck_consistency": bool(body.get("preserve_deck_consistency", True)),
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
    payload = build_modify_payload(
        session_id=session_id,
        snapshot=snapshot,
        anchor=anchor,
        result=result if isinstance(result, dict) else None,
    )
    payload["slide_id"] = slide_id
    payload["slide_index"] = slide_index
    payload["scope"] = generation_command["scope"]
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
    return success_response(data=payload, message="棰勮淇敼璇锋眰宸叉帴鍙?")


async def get_session_slide_preview_response(
    *,
    session_id: str,
    slide_id: str,
    artifact_id: Optional[str],
    run_id: Optional[str],
    user_id: str,
    get_preview_snapshot_or_raise: SessionSnapshotLoader,
    resolve_preview_anchor: PreviewAnchorResolver,
    load_preview_material: PreviewMaterialLoader,
):
    snapshot = await get_preview_snapshot_or_raise(session_id, user_id)
    anchor, task, slides, lesson_plan, content = (
        await load_preview_material_for_snapshot(
            session_id=session_id,
            snapshot=snapshot,
            artifact_id=artifact_id,
            run_id=run_id,
            resolve_preview_anchor=resolve_preview_anchor,
            load_preview_material=load_preview_material,
        )
    )
    if run_id and task is None:
        _raise_run_not_ready(run_id)

    try:
        selected_slide, teaching_plan, related_slides = resolve_slide_preview(
            slide_id=slide_id,
            slides=slides,
            lesson_plan=lesson_plan,
        )
    except LookupError as exc:
        raise NotFoundException(message=str(exc), error_code=ErrorCode.NOT_FOUND)
    rendered_page = None
    if isinstance(content, dict):
        rendered_preview = content.get("rendered_preview")
        if isinstance(rendered_preview, dict):
            for page in rendered_preview.get("pages", []) or []:
                if page.get("slide_id") == selected_slide.get("id"):
                    rendered_page = page
                    break
    return success_response(
        data=build_slide_preview_payload(
            session_id=session_id,
            snapshot=snapshot,
            anchor=anchor,
            selected_slide=selected_slide,
            teaching_plan=teaching_plan,
            related_slides=related_slides,
            rendered_page=rendered_page,
        ),
        message="页面预览获取成功",
    )


async def export_session_response(
    *,
    session_id: str,
    body: Optional[dict],
    run_id: Optional[str],
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
    resolved_run_id = run_id or body.get("run_id")
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
            run_id=resolved_run_id,
            resolve_preview_anchor=resolve_preview_anchor,
            load_preview_material=load_preview_material,
        )
    )
    if resolved_run_id and task is None:
        _raise_run_not_ready(resolved_run_id)

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
            "run_id": resolved_run_id,
        },
        generation_result=payload,
        trigger="preview_export",
        payload=payload,
        attach_auto_candidate_change=attach_auto_candidate_change,
    )
    response = success_response(data=payload, message="瀵煎嚭鎴愬姛")
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logger.info(
        (
            "session_preview_exported session_id=%s "
            "format=%s artifact_id=%s run_id=%s duration_ms=%s"
        ),
        session_id,
        export_format,
        anchor.get("artifact_id"),
        resolved_run_id,
        duration_ms,
        extra={
            "session_id": session_id,
            "export_format": export_format,
            "artifact_id": anchor.get("artifact_id"),
            "run_id": resolved_run_id,
            "duration_ms": duration_ms,
        },
    )
    return response
