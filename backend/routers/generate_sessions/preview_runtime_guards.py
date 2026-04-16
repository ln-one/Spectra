"""Validation and selection helpers for session preview routes."""

from __future__ import annotations

from typing import Optional

from fastapi import status

from utils.exceptions import APIException, ErrorCode


def raise_legacy_courseware_modify_removed() -> None:
    raise APIException(
        status_code=status.HTTP_409_CONFLICT,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message="课件单页修改旧链路已下线，仅支持 Diego 生成主链路。",
        details={"reason": "legacy_courseware_modify_removed"},
    )


def raise_run_not_ready(run_id: str) -> None:
    raise APIException(
        status_code=status.HTTP_409_CONFLICT,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message="指定运行尚未产出可预览内容",
        details={
            "reason": "run_not_ready",
            "run_id": run_id,
        },
    )


def has_preview_content(content: object) -> bool:
    if not isinstance(content, dict):
        return False
    render_markdown = str(content.get("render_markdown") or "").strip()
    markdown_content = str(content.get("markdown_content") or "").strip()
    if render_markdown or markdown_content:
        return True
    rendered_preview = content.get("rendered_preview")
    if isinstance(rendered_preview, dict):
        pages = rendered_preview.get("pages")
        if isinstance(pages, list) and len(pages) > 0:
            return True
    return False


def run_material_ready(material_context, slides: list[dict], content: dict) -> bool:
    if material_context and not isinstance(material_context, dict):
        return True
    if not isinstance(material_context, dict):
        return False
    if material_context.get("artifact_id"):
        return True
    if slides:
        return True
    markdown_content = str((content or {}).get("markdown_content") or "").strip()
    rendered_preview = (content or {}).get("rendered_preview")
    return bool(markdown_content or isinstance(rendered_preview, dict))


def resolve_modify_instruction(body: dict) -> str:
    instruction = str(body.get("instruction") or "").strip()
    if not instruction:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="instruction 字段为必填",
        )
    return instruction


def coerce_positive_int(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 1:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed >= 1 else None
    return None


def resolve_target_slide_id(body: dict, slides: list[dict]) -> tuple[str, int]:
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
                page = coerce_positive_int((slide.get("index") or 0) + 1) or 1
                return slide_id, page
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"未找到指定 slide_id: {slide_id}",
        )

    target_page = coerce_positive_int(body.get("slide_index"))
    if target_page is None:
        raw_target_slides = body.get("target_slides")
        if isinstance(raw_target_slides, list) and raw_target_slides:
            target_page = coerce_positive_int(raw_target_slides[0])
    if target_page is None:
        target_page = (
            coerce_positive_int(body.get("active_page"))
            or coerce_positive_int(body.get("current_page"))
            or coerce_positive_int(body.get("page"))
            or coerce_positive_int(context.get("active_page"))
            or coerce_positive_int(context.get("current_page"))
            or coerce_positive_int(context.get("page"))
        )

    if target_page is not None:
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
