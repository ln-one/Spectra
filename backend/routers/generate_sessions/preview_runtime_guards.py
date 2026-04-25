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


def _coerce_zero_based_index(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 0:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed >= 0 else None
    return None


def _clean_identifier(value: object) -> str:
    return str(value or "").strip()


def _slide_page(slide: dict) -> Optional[int]:
    index = _coerce_zero_based_index(slide.get("index"))
    if index is not None:
        return index + 1
    return coerce_positive_int(slide.get("slide_index")) or coerce_positive_int(
        slide.get("page")
    )


def _slide_identifiers(slide: dict) -> set[str]:
    identifiers = {
        _clean_identifier(slide.get("id")),
        _clean_identifier(slide.get("slide_id")),
    }
    index = _coerce_zero_based_index(slide.get("index"))
    if index is not None:
        identifiers.add(f"slide-{index + 1}")
    return {item for item in identifiers if item}


def _parse_page_from_slide_identifier(slide_id: str) -> Optional[int]:
    wanted = _clean_identifier(slide_id)
    if "-slide-" in wanted:
        suffix = wanted.rsplit("-slide-", 1)[1]
        if suffix.isdigit():
            return int(suffix) + 1
    if wanted.startswith("slide-"):
        suffix = wanted.split("slide-", 1)[1]
        if suffix.isdigit():
            return coerce_positive_int(suffix)
    return None


def _resolve_slide_by_page(slides: list[dict], target_page: int) -> tuple[str, int]:
    for slide in slides:
        if _slide_page(slide) == target_page:
            resolved_slide_id = _clean_identifier(slide.get("id")) or _clean_identifier(
                slide.get("slide_id")
            )
            if resolved_slide_id:
                return resolved_slide_id, target_page
    raise APIException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code=ErrorCode.INVALID_INPUT,
        message=f"未找到指定 slide_index: {target_page}",
    )


def _requested_target_page(body: dict, context: dict) -> Optional[int]:
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
    return target_page


def find_slide_page_by_identifier(slide_id: str, slides: list[dict]) -> Optional[int]:
    wanted = _clean_identifier(slide_id)
    if not wanted:
        return None
    for slide in slides:
        if wanted in _slide_identifiers(slide):
            return _slide_page(slide)

    target_page = _parse_page_from_slide_identifier(wanted)
    if target_page is None:
        return None
    try:
        _resolve_slide_by_page(slides, target_page)
    except APIException:
        return None
    return target_page


def _raise_target_conflict(slide_id: str, slide_page: int, requested_page: int) -> None:
    raise APIException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code=ErrorCode.INVALID_INPUT,
        message=(
            f"slide_id 与 slide_index 指向不同页面: "
            f"{slide_id} -> {slide_page}, slide_index -> {requested_page}"
        ),
        details={
            "reason": "slide_target_conflict",
            "slide_id": slide_id,
            "slide_id_page": slide_page,
            "slide_index": requested_page,
        },
    )


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
    requested_page = _requested_target_page(body, context)
    if slide_id:
        page = find_slide_page_by_identifier(slide_id, slides)
        if page is not None:
            if requested_page is not None and requested_page != page:
                _raise_target_conflict(slide_id, page, requested_page)
            return slide_id, page
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"未找到指定 slide_id: {slide_id}",
        )

    if requested_page is not None:
        return _resolve_slide_by_page(slides, requested_page)

    raise APIException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code=ErrorCode.INVALID_INPUT,
        message="slide_id 或 slide_index 必须提供其一",
    )
