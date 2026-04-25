import html
import json
from typing import Optional

from schemas.generation import TaskStatus, build_generation_result_payload
from services.platform.state_transition_guard import GenerationState

_DEFAULT_PREVIEW_VIEWPORT = {"width": 1280, "height": 720}


def build_artifact_anchor(session_id: str, artifact) -> dict:
    return {
        "session_id": session_id,
        "artifact_id": artifact.id if artifact else None,
        "based_on_version_id": (
            getattr(artifact, "basedOnVersionId", None) if artifact else None
        ),
    }


def ensure_previewable_state(snapshot: dict) -> None:
    session_state = snapshot["session"]["state"]
    if session_state not in {
        GenerationState.SUCCESS.value,
        GenerationState.RENDERING.value,
        GenerationState.GENERATING_CONTENT.value,
        GenerationState.FAILED.value,
        GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        GenerationState.DRAFTING_OUTLINE.value,
    }:
        raise ValueError(f"当前状态 {session_state} 不支持预览")


def ensure_exportable_state(
    snapshot: dict, expected_render_version: Optional[int]
) -> None:
    session_state = snapshot["session"]["state"]
    has_exportable_artifact = bool(snapshot.get("artifact_id"))
    if session_state != GenerationState.SUCCESS.value and not has_exportable_artifact:
        raise ValueError("当前会话暂无可导出的产物")

    if expected_render_version is None:
        return

    current_render_version = snapshot["session"].get("render_version") or 1
    if current_render_version != expected_render_version:
        raise RuntimeError(
            f"渲染版本冲突：期望 {expected_render_version}，当前 {current_render_version}"
        )


def strip_sources(
    slides: list[dict], lesson_plan: Optional[dict]
) -> tuple[list[dict], Optional[dict]]:
    slides_clean = []
    for slide in slides:
        item = dict(slide)
        item["sources"] = []
        slides_clean.append(item)

    lesson_plan_clean = None
    if lesson_plan:
        lesson_plan_clean = dict(lesson_plan)
        plans = []
        for plan in lesson_plan_clean.get("slides_plan", []) or []:
            plan_item = dict(plan)
            plan_item["material_sources"] = []
            plans.append(plan_item)
        lesson_plan_clean["slides_plan"] = plans
    return slides_clean, lesson_plan_clean


def _resolved_export_markdown(content: dict) -> str:
    resolved = content.get("resolved_markdown_content")
    if isinstance(resolved, str) and resolved.strip():
        return resolved

    markdown_content = content.get("markdown_content")
    if isinstance(markdown_content, str) and markdown_content.strip():
        return markdown_content

    render_markdown = content.get("render_markdown")
    if isinstance(render_markdown, str) and render_markdown.strip():
        return render_markdown

    return ""


def _material_context_id(material_context) -> Optional[str]:
    if not material_context:
        return None
    if isinstance(material_context, dict):
        value = (
            material_context.get("id")
            or material_context.get("task_id")
            or material_context.get("render_job_id")
        )
        return str(value) if value else None
    value = getattr(material_context, "id", None)
    return str(value) if value else None


def _resolved_diego_preview_context(
    *,
    content: dict,
    snapshot: dict,
    anchor: dict,
) -> Optional[dict]:
    raw = content.get("diego_preview_context")
    if not isinstance(raw, dict):
        return None

    context = dict(raw)
    context["provider"] = "diego"

    run_id = (
        str(context.get("run_id") or "").strip()
        or str(anchor.get("run_id") or "").strip()
        or str(((snapshot.get("current_run") or {}).get("run_id") or "")).strip()
    )
    if run_id:
        context["run_id"] = run_id

    theme_raw = context.get("theme")
    if isinstance(theme_raw, dict):
        theme = {}
        for key in ("primary", "secondary", "accent", "light", "bg"):
            value = str(theme_raw.get(key) or "").strip()
            if value:
                theme[key] = value
        if theme:
            context["theme"] = theme
        else:
            context.pop("theme", None)
    else:
        context.pop("theme", None)

    fonts_raw = context.get("fonts")
    if isinstance(fonts_raw, dict):
        fonts = {}
        for key in ("title", "body"):
            value = str(fonts_raw.get(key) or "").strip()
            if value:
                fonts[key] = value
        if fonts:
            context["fonts"] = fonts
        else:
            context.pop("fonts", None)
    else:
        context.pop("fonts", None)

    for key in ("palette", "style", "style_dna_id", "effective_template_style"):
        value = str(context.get(key) or "").strip()
        if value:
            context[key] = value
        else:
            context.pop(key, None)

    if "source_event_seq" in context:
        try:
            context["source_event_seq"] = int(context.get("source_event_seq") or 0)
        except (TypeError, ValueError):
            context.pop("source_event_seq", None)

    return context


def _normalize_preview_text(value: object) -> str:
    return str(value or "").strip()


def _coerce_positive_int(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed > 0 else None
    return None


def _normalize_rendered_preview_pages(rendered_preview: object) -> list[dict]:
    if not isinstance(rendered_preview, dict):
        return []
    raw_pages = rendered_preview.get("pages")
    if not isinstance(raw_pages, list):
        return []
    pages: list[dict] = []
    for item in raw_pages:
        if not isinstance(item, dict):
            continue
        raw_preview = item.get("preview")
        preview = dict(raw_preview) if isinstance(raw_preview, dict) else {}
        svg_data_url = _normalize_preview_text(
            item.get("svg_data_url") or preview.get("svg_data_url")
        )
        if not svg_data_url.startswith("data:image/svg+xml"):
            continue
        index = int(item.get("index") or 0)
        split_index = int(item.get("split_index") or 0)
        slide_id = _normalize_preview_text(item.get("slide_id") or preview.get("slide_id")) or f"slide-{index}"
        preview = {
            **preview,
            "index": index,
            "slide_id": slide_id,
            "format": "svg",
            "svg_data_url": svg_data_url,
        }
        pages.append(
            {
                "index": index,
                "slide_id": slide_id,
                "format": "svg",
                "svg_data_url": svg_data_url,
                "preview": preview,
                "status": _normalize_preview_text(item.get("status")) or "ready",
                "split_index": split_index,
                "split_count": _coerce_positive_int(item.get("split_count")) or 1,
                "width": _coerce_positive_int(item.get("width")),
                "height": _coerce_positive_int(item.get("height")),
            }
        )
    pages.sort(key=lambda item: (item["index"], item["split_index"]))
    return pages


def _resolve_authority_viewport(pages: list[dict]) -> dict:
    for page in pages:
        width = _coerce_positive_int(page.get("width"))
        height = _coerce_positive_int(page.get("height"))
        if width and height:
            return {"width": width, "height": height}
    return dict(_DEFAULT_PREVIEW_VIEWPORT)


def _build_authority_preview(
    *,
    slides: list[dict],
    snapshot: dict,
    anchor: dict,
    diego_preview_context: Optional[dict],
    rendered_preview: Optional[dict],
) -> dict:
    pages = _normalize_rendered_preview_pages(rendered_preview)
    viewport = _resolve_authority_viewport(pages)
    theme = (
        diego_preview_context.get("theme")
        if isinstance(diego_preview_context, dict)
        and isinstance(diego_preview_context.get("theme"), dict)
        else None
    )
    fonts = (
        diego_preview_context.get("fonts")
        if isinstance(diego_preview_context, dict)
        and isinstance(diego_preview_context.get("fonts"), dict)
        else None
    )
    compile_context_version = (
        int(diego_preview_context.get("source_event_seq") or 0)
        if isinstance(diego_preview_context, dict)
        and str(diego_preview_context.get("source_event_seq") or "").strip()
        else None
    )
    pages_by_slide_id: dict[str, list[dict]] = {}
    pages_by_index: dict[int, list[dict]] = {}
    for page in pages:
        pages_by_slide_id.setdefault(str(page.get("slide_id") or ""), []).append(page)
        pages_by_index.setdefault(int(page.get("index") or 0), []).append(page)

    authority_slides: list[dict] = []
    render_version = snapshot["session"].get("render_version") or 1
    slide_slots: dict[tuple[str, int], dict] = {}
    for slide in slides:
        slide_id = _normalize_preview_text(slide.get("id")) or f"slide-{slide.get('index')}"
        slide_slots[(slide_id, int(slide.get("index") or 0))] = dict(slide)
    for page in pages:
        key = (str(page.get("slide_id") or ""), int(page.get("index") or 0))
        slide_slots.setdefault(key, {})

    for (slide_id, slide_index), slide in sorted(
        slide_slots.items(), key=lambda item: item[0][1]
    ):
        page_frames = [
            {
                "slide_id": str(page.get("slide_id") or slide_id),
                "index": int(page.get("index") or slide_index),
                "format": "svg",
                "svg_data_url": page.get("svg_data_url"),
                "preview": page.get("preview"),
                "status": page.get("status"),
                "split_index": int(page.get("split_index") or 0),
                "split_count": _coerce_positive_int(page.get("split_count")) or 1,
                "width": _coerce_positive_int(page.get("width")),
                "height": _coerce_positive_int(page.get("height")),
            }
            for page in (
                pages_by_slide_id.get(slide_id)
                or pages_by_index.get(slide_index)
                or []
            )
        ]
        first_frame = page_frames[0] if page_frames else {}
        authority_slides.append(
            {
                "slide_id": slide_id,
                "index": slide_index,
                "title": _normalize_preview_text(slide.get("title")),
                "status": (
                    str(first_frame.get("status") or "").strip()
                    or ("ready" if page_frames else "pending")
                ),
                "render_version": render_version,
                "preview": first_frame.get("preview"),
                "format": "svg" if page_frames else None,
                "svg_data_url": first_frame.get("svg_data_url"),
                "width": _coerce_positive_int(first_frame.get("width")) or viewport["width"],
                "height": _coerce_positive_int(first_frame.get("height")) or viewport["height"],
                "frames": page_frames,
                "editable_scene": None,
                "node_map": [],
            }
        )
    run_id = (
        str(anchor.get("run_id") or "").strip()
        or str(((snapshot.get("current_run") or {}).get("run_id") or "")).strip()
        or None
    )
    return {
        "provider": "pagevra",
        "run_id": run_id,
        "render_version": render_version,
        "viewport": viewport,
        "compile_context_version": compile_context_version,
        "compile_context": diego_preview_context,
        "theme": theme,
        "fonts": fonts,
        "slides": authority_slides,
    }


def build_preview_payload(
    session_id: str,
    snapshot: dict,
    task,
    slides: list[dict],
    lesson_plan: Optional[dict],
    anchor: dict,
    content: Optional[dict] = None,
    rendered_preview: Optional[dict] = None,
) -> dict:
    content = content or {}
    slides_content_markdown = _resolved_export_markdown(content)
    diego_preview_context = _resolved_diego_preview_context(
        content=content,
        snapshot=snapshot,
        anchor=anchor,
    )
    authority_preview = _build_authority_preview(
        slides=slides,
        snapshot=snapshot,
        anchor=anchor,
        diego_preview_context=diego_preview_context,
        rendered_preview=rendered_preview,
    )
    return {
        "session_id": session_id,
        "session_state": snapshot["session"].get("state"),
        "session_state_reason": snapshot["session"].get("stateReason"),
        "task_id": _material_context_id(task),
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
        "artifact_anchor": anchor,
        "render_version": snapshot["session"].get("render_version") or 1,
        "slides": slides,
        "lesson_plan": lesson_plan,
        "slides_content_markdown": slides_content_markdown,
        "slides_content_ready": bool(slides_content_markdown.strip()),
        "rendered_preview": rendered_preview,
        "diego_preview_context": diego_preview_context,
        "authority_preview": authority_preview,
    }


def build_modify_payload(
    session_id: str,
    snapshot: dict,
    anchor: dict,
    result: Optional[dict],
) -> dict:
    payload = {
        "session_id": session_id,
        "modify_task_id": (result.get("task_id") if isinstance(result, dict) else None)
        or f"modify-{session_id}",
        "status": TaskStatus.PENDING,
        "render_version": snapshot["session"].get("render_version") or 1,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
        "artifact_anchor": anchor,
    }
    if isinstance(result, dict):
        payload.update(result)
    return payload


def build_slide_preview_payload(
    session_id: str,
    snapshot: dict,
    anchor: dict,
    selected_slide: dict,
    teaching_plan: Optional[dict],
    related_slides: list[dict],
    rendered_page: Optional[dict] = None,
) -> dict:
    return {
        "session_id": session_id,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
        "artifact_anchor": anchor,
        "slide": selected_slide,
        "teaching_plan": teaching_plan,
        "related_slides": related_slides,
        "rendered_page": rendered_page,
    }


def build_export_payload(
    session_id: str,
    snapshot: dict,
    task,
    slides: list[dict],
    lesson_plan: Optional[dict],
    content: dict,
    anchor: dict,
    export_format: str,
    include_sources: bool,
) -> dict:
    if not include_sources:
        slides, lesson_plan = strip_sources(slides, lesson_plan)

    preview_html = str(content.get("preview_html") or "").strip()
    source_content = (
        content.get("render_markdown")
        or content.get("lesson_plan_markdown")
        or _resolved_export_markdown(content)
    )

    normalized_format = export_format.lower()
    if normalized_format == "json":
        export_content = json.dumps(
            {
                "session_id": session_id,
                "slides": slides,
                "lesson_plan": lesson_plan,
                "markdown_content": source_content,
            },
            ensure_ascii=False,
        )
    elif normalized_format == "html":
        export_content = preview_html or (
            "<!doctype html><html><body><pre>"
            + html.escape(source_content)
            + "</pre></body></html>"
        )
    else:
        normalized_format = "markdown"
        export_content = source_content

    result = build_generation_result_payload(
        ppt_url=(snapshot.get("result") or {}).get("ppt_url"),
        word_url=(snapshot.get("result") or {}).get("word_url"),
        version=(snapshot.get("result") or {}).get("version"),
    )
    return {
        "session_id": session_id,
        "task_id": _material_context_id(task),
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
        "artifact_anchor": anchor,
        "content": export_content,
        "format": normalized_format,
        "render_version": snapshot["session"].get("render_version") or 1,
        "ppt_url": result.get("ppt_url"),
        "word_url": result.get("word_url"),
        "version": result.get("version"),
    }
