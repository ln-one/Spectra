"""Run preview payload assembly for Diego slide previews."""

from __future__ import annotations

from services.generation_session_service.outline_versions import parse_outline_json
from services.platform.state_transition_guard import GenerationState
from services.preview_helpers.content_generation import build_outline_preview_payload
from utils.exceptions import ExternalServiceException

from .constants import _DIEGO_STATUS_COMPILING, _DIEGO_STATUS_SUCCEEDED
from .dependencies import active


async def _load_latest_outline_document(db, session_id: str) -> dict | None:
    outline_model = getattr(db, "outlineversion", None)
    if outline_model is None or not hasattr(outline_model, "find_first"):
        return None
    record = await outline_model.find_first(
        where={"sessionId": session_id},
        order={"version": "desc"},
    )
    if not record:
        return None
    parsed = parse_outline_json(getattr(record, "outlineData", None))
    if parsed is not None:
        parsed["version"] = getattr(record, "version", parsed.get("version", 1))
    return parsed


async def _resolve_project_name(db, session_id: str) -> str:
    session_model = getattr(db, "generationsession", None)
    project_model = getattr(db, "project", None)
    if (
        session_model is None
        or not hasattr(session_model, "find_unique")
        or project_model is None
        or not hasattr(project_model, "find_unique")
    ):
        return "课件预览"
    session = await session_model.find_unique(where={"id": session_id})
    if not session:
        return "课件预览"
    project_id = str(getattr(session, "projectId", "") or "").strip()
    if not project_id:
        return "课件预览"
    project = await project_model.find_unique(where={"id": project_id})
    project_name = str(getattr(project, "name", "") or "").strip() if project else ""
    return project_name or "课件预览"


async def _load_or_init_run_preview_payload(
    *,
    db,
    session_id: str,
    spectra_run_id: str,
) -> dict:
    cached = await active("load_preview_content")(spectra_run_id)
    payload = dict(cached) if isinstance(cached, dict) else {}
    if not str(payload.get("title") or "").strip():
        project_name = await _resolve_project_name(db, session_id)
        outline_doc = await _load_latest_outline_document(db, session_id)
        base = (
            build_outline_preview_payload(project_name, outline_doc)
            if isinstance(outline_doc, dict)
            else None
        )
        if isinstance(base, dict):
            payload.update(
                {
                    "title": base.get("title") or project_name,
                    "markdown_content": str(base.get("markdown_content") or ""),
                    "lesson_plan_markdown": str(base.get("lesson_plan_markdown") or ""),
                }
            )
        else:
            payload.setdefault("title", project_name)
            payload.setdefault("markdown_content", "")
            payload.setdefault("lesson_plan_markdown", "")
    payload.setdefault("title", "课件预览")
    payload.setdefault("markdown_content", "")
    payload.setdefault("lesson_plan_markdown", "")

    rendered = payload.get("rendered_preview")
    pages = (
        [dict(item) for item in rendered.get("pages", []) if isinstance(item, dict)]
        if isinstance(rendered, dict)
        else []
    )
    format_name = str((rendered or {}).get("format") or "html").strip() or "html"
    payload["rendered_preview"] = {
        "format": format_name,
        "pages": sorted(
            pages,
            key=lambda item: (
                int(item.get("index") or 0),
                int(item.get("split_index") or 0),
            ),
        ),
        "page_count": len(pages),
    }
    return payload


def _build_spectra_preview_page(
    *,
    spectra_run_id: str,
    slide_no: int,
    preview: dict[str, object],
) -> dict[str, object] | None:
    html_preview = str(preview.get("html_preview") or "")
    image_url = str(preview.get("image_url") or "")
    if not html_preview.strip() and not image_url.strip():
        return None
    try:
        page_index = int(preview.get("page_index") or (slide_no - 1))
    except (TypeError, ValueError):
        page_index = slide_no - 1
    if page_index < 0:
        page_index = slide_no - 1
    if page_index < 0:
        page_index = 0
    slide_id = (
        str(preview.get("slide_id") or "").strip()
        or f"{spectra_run_id}-slide-{page_index}"
    )
    try:
        split_index = int(preview.get("split_index") or 0)
    except (TypeError, ValueError):
        split_index = 0
    try:
        split_count = int(preview.get("split_count") or 1)
    except (TypeError, ValueError):
        split_count = 1
    page: dict[str, object] = {
        "index": page_index,
        "slide_id": slide_id,
        "html_preview": html_preview or None,
        "image_url": image_url or None,
        "status": str(preview.get("status") or "ready"),
        "split_index": split_index,
        "split_count": max(1, split_count),
    }
    width = preview.get("width")
    height = preview.get("height")
    if isinstance(width, int) and width > 0:
        page["width"] = width
    if isinstance(height, int) and height > 0:
        page["height"] = height
    return page


def _upsert_rendered_preview_page(
    preview_payload: dict, page: dict[str, object]
) -> bool:
    rendered = preview_payload.get("rendered_preview")
    if not isinstance(rendered, dict):
        rendered = {"format": "html", "pages": [], "page_count": 0}
        preview_payload["rendered_preview"] = rendered
    pages = rendered.get("pages")
    if not isinstance(pages, list):
        pages = []
        rendered["pages"] = pages

    target_index = int(page.get("index") or 0)
    target_split = int(page.get("split_index") or 0)
    for index, existing in enumerate(pages):
        if not isinstance(existing, dict):
            continue
        if (
            int(existing.get("index") or 0) == target_index
            and int(existing.get("split_index") or 0) == target_split
        ):
            merged = {**existing, **page}
            if merged == existing:
                return False
            pages[index] = merged
            pages.sort(
                key=lambda item: (
                    int(item.get("index") or 0),
                    int(item.get("split_index") or 0),
                )
            )
            rendered["page_count"] = len(pages)
            return True

    pages.append(dict(page))
    pages.sort(
        key=lambda item: (
            int(item.get("index") or 0),
            int(item.get("split_index") or 0),
        )
    )
    rendered["page_count"] = len(pages)
    return True


def _is_diego_preview_not_ready_error(exc: ExternalServiceException) -> bool:
    details = exc.details if isinstance(exc.details, dict) else {}
    status_code = details.get("status_code")
    try:
        parsed = int(status_code)
    except (TypeError, ValueError):
        parsed = 0
    return parsed in {404, 409}


def _preview_event_state_from_status(status: str) -> str:
    if status in {_DIEGO_STATUS_COMPILING, _DIEGO_STATUS_SUCCEEDED}:
        return GenerationState.RENDERING.value
    return GenerationState.GENERATING_CONTENT.value
