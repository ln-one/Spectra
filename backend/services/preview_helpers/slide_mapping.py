from __future__ import annotations

from typing import Any

from .rendering import build_slides


def _coerce_non_negative_int(value: Any, fallback: int) -> int:
    if isinstance(value, bool):
        return fallback
    if isinstance(value, int) and value >= 0:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        if parsed >= 0:
            return parsed
    return fallback


def coerce_positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 1:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        if parsed >= 1:
            return parsed
    return None


def slide_identity(
    slide: Any,
    fallback_index: int,
    *,
    task_id: str | None = None,
) -> str:
    candidate = None
    if isinstance(slide, dict):
        candidate = slide.get("id")
    else:
        candidate = getattr(slide, "id", None)

    if isinstance(candidate, str) and candidate.strip():
        return candidate.strip()

    if task_id and str(task_id).strip():
        return f"{task_id}-slide-{fallback_index}"
    return f"slide-{fallback_index}"


def _slide_index(slide: Any, fallback_index: int) -> int:
    if isinstance(slide, dict):
        raw_index = slide.get("index")
    else:
        raw_index = getattr(slide, "index", None)
    return _coerce_non_negative_int(raw_index, fallback_index)


def build_slide_id_index_map(
    *,
    task_id: str,
    markdown_content: str,
    image_metadata: dict | None = None,
    render_markdown: str | None = None,
    rendered_preview: dict | None = None,
) -> dict[str, int]:
    mapping: dict[str, int] = {}

    pages = (
        rendered_preview.get("pages") if isinstance(rendered_preview, dict) else None
    )
    if isinstance(pages, list):
        for fallback_index, page in enumerate(pages):
            if not isinstance(page, dict):
                continue
            index = _coerce_non_negative_int(page.get("index"), fallback_index)
            slide_id = (
                str(page.get("slide_id") or "").strip() or f"{task_id}-slide-{index}"
            )
            mapping.setdefault(slide_id, index + 1)
    if mapping:
        return mapping

    slides = build_slides(
        task_id,
        markdown_content,
        image_metadata,
        render_markdown,
    )
    for fallback_index, slide in enumerate(slides):
        index = _slide_index(slide, fallback_index)
        mapping[slide_identity(slide, index, task_id=task_id)] = index + 1
    return mapping


def resolve_slide_index(
    *,
    slide_id: str | None,
    slide_index: Any,
    slide_id_index_map: dict[str, int],
) -> int | None:
    explicit_slide_index = coerce_positive_int(slide_index)
    if explicit_slide_index is not None:
        return explicit_slide_index

    normalized_slide_id = str(slide_id or "").strip()
    if not normalized_slide_id:
        return None

    if normalized_slide_id in slide_id_index_map:
        return slide_id_index_map[normalized_slide_id]

    if normalized_slide_id.isdigit():
        numeric_id = int(normalized_slide_id)
        if numeric_id in slide_id_index_map.values():
            return numeric_id
        if (numeric_id + 1) in slide_id_index_map.values():
            return numeric_id + 1
    return None
