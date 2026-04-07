"""Preview persistence helpers for generation tasks."""

from __future__ import annotations

import inspect
import json
import logging
import time
from typing import Awaitable, Callable, Optional

from services.database.prisma_compat import find_unique_with_select_fallback
from services.preview_helpers import save_preview_content
from services.preview_helpers.rendered_preview import build_rendered_preview_payload
from services.preview_helpers.rendering import build_slides
from services.preview_helpers.slide_mapping import slide_identity

logger = logging.getLogger(__name__)


def extract_courseware_value(courseware_content, key: str) -> str:
    if isinstance(courseware_content, dict):
        value = courseware_content.get(key)
    else:
        value = getattr(courseware_content, key, None)
    return value if isinstance(value, str) else ""


def extract_courseware_object(courseware_content, key: str):
    if isinstance(courseware_content, dict):
        return courseware_content.get(key)
    return getattr(courseware_content, key, None)


def _serialize_style_manifest(courseware_content) -> dict | None:
    value = extract_courseware_object(courseware_content, "style_manifest")
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return None


def _serialize_page_class_plan(courseware_content) -> list[dict] | None:
    value = extract_courseware_object(courseware_content, "page_class_plan")
    if not value or not isinstance(value, list):
        return None
    serialized: list[dict] = []
    for item in value:
        if isinstance(item, dict):
            serialized.append(item)
        elif hasattr(item, "model_dump"):
            serialized.append(item.model_dump())
    return serialized or None


async def _maybe_await(result) -> None:
    if inspect.isawaitable(result):
        await result


async def cache_preview_content(
    task_id: str,
    courseware_content,
    template_config: dict | None = None,
    on_slide_rendered: Optional[Callable[[dict], Awaitable[None]]] = None,
    on_preview_payload_updated: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> dict:
    markdown_content = extract_courseware_value(courseware_content, "markdown_content")
    render_markdown = extract_courseware_value(courseware_content, "render_markdown")
    slide_models = build_slides(
        task_id,
        markdown_content,
        image_metadata=extract_courseware_object(courseware_content, "_image_metadata"),
        render_markdown=render_markdown,
    )
    slide_ids = [
        slide_identity(slide, index, task_id=task_id)
        for index, slide in enumerate(slide_models)
    ]
    style_manifest = _serialize_style_manifest(courseware_content)
    extra_css = extract_courseware_value(courseware_content, "extra_css")
    page_class_plan = _serialize_page_class_plan(courseware_content)

    preview_payload = {
        "title": extract_courseware_value(courseware_content, "title"),
        "markdown_content": markdown_content,
        "lesson_plan_markdown": extract_courseware_value(
            courseware_content,
            "lesson_plan_markdown",
        ),
        "rendered_preview": None,
    }
    if render_markdown:
        preview_payload["render_markdown"] = render_markdown
    if style_manifest:
        preview_payload["style_manifest"] = style_manifest
    if extra_css:
        preview_payload["extra_css"] = extra_css
    if page_class_plan:
        preview_payload["page_class_plan"] = page_class_plan
    if hasattr(courseware_content, "_image_metadata"):
        preview_payload["_image_metadata"] = getattr(
            courseware_content, "_image_metadata"
        )
    elif (
        isinstance(courseware_content, dict) and "_image_metadata" in courseware_content
    ):
        preview_payload["_image_metadata"] = courseware_content["_image_metadata"]

    async def _notify_preview_payload_updated() -> None:
        if on_preview_payload_updated is None:
            return
        try:
            await _maybe_await(on_preview_payload_updated(preview_payload))
        except Exception as callback_err:
            logger.warning(
                "Preview payload persistence callback failed for task %s: %s",
                task_id,
                callback_err,
            )

    if on_slide_rendered is None:
        rendered_preview = await build_rendered_preview_payload(
            task_id=task_id,
            title=extract_courseware_value(courseware_content, "title"),
            markdown_content=markdown_content,
            template_config=template_config,
            slide_ids=slide_ids,
            render_markdown=render_markdown,
            style_manifest=style_manifest,
            extra_css=extra_css,
            page_class_plan=page_class_plan,
        )
        preview_payload["rendered_preview"] = rendered_preview
        try:
            await save_preview_content(task_id, preview_payload)
        except Exception as cache_err:
            logger.warning(
                "Failed to save preview cache for task %s: %s", task_id, cache_err
            )
        await _notify_preview_payload_updated()
        return preview_payload

    rendered_preview = {"format": "html", "pages": [], "page_count": 0}
    preview_payload["rendered_preview"] = rendered_preview
    rendered_pages: list[dict] = rendered_preview["pages"]

    try:
        await save_preview_content(task_id, preview_payload)
    except Exception as cache_err:
        logger.warning(
            "Failed to save initial preview cache for task %s: %s", task_id, cache_err
        )
    await _notify_preview_payload_updated()

    async def _handle_page_rendered(payload: dict) -> None:
        page = {
            "index": int(payload.get("slide_index") or 0),
            "slide_id": str(payload.get("slide_id") or ""),
            "image_url": payload.get("image_url"),
            "html_preview": payload.get("html_preview"),
            "status": str(payload.get("status") or "ready"),
        }
        width = payload.get("width")
        height = payload.get("height")
        if isinstance(width, int) and width > 0:
            page["width"] = width
        if isinstance(height, int) and height > 0:
            page["height"] = height
        for idx, existing in enumerate(rendered_pages):
            if existing.get("index") == page["index"]:
                rendered_pages[idx] = {**existing, **page}
                break
        else:
            rendered_pages.append(page)
        rendered_pages.sort(key=lambda item: int(item.get("index") or 0))
        rendered_preview["page_count"] = len(rendered_pages)
        try:
            await save_preview_content(task_id, preview_payload)
        except Exception as cache_err:
            logger.warning(
                "Failed to update structured preview cache for task %s slide %s: %s",
                task_id,
                page["index"],
                cache_err,
            )
        await _notify_preview_payload_updated()
        if on_slide_rendered is not None:
            await _maybe_await(on_slide_rendered(payload))

    try:
        built_preview = await build_rendered_preview_payload(
            task_id=task_id,
            title=extract_courseware_value(courseware_content, "title"),
            markdown_content=markdown_content,
            template_config=template_config,
            slide_ids=slide_ids,
            render_markdown=render_markdown,
            style_manifest=style_manifest,
            extra_css=extra_css,
            page_class_plan=page_class_plan,
            on_page_rendered=_handle_page_rendered,
        )
        if built_preview is not None:
            preview_payload["rendered_preview"] = built_preview
            rendered_preview = built_preview
            rendered_pages = rendered_preview["pages"]
    except Exception as exc:
        logger.warning(
            "Structured preview generation failed: task=%s error=%s", task_id, exc
        )

    rendered_preview["page_count"] = len(rendered_pages)
    await _notify_preview_payload_updated()
    return preview_payload


async def persist_preview_payload(
    db_service,
    *,
    task_id: str,
    preview_payload: dict,
) -> None:
    try:
        task = await find_unique_with_select_fallback(
            model=db_service.db.generationtask,
            where={"id": task_id},
            select={"inputData": True},
        )
    except Exception as exc:
        logger.warning(
            "Failed to load generation task inputData for preview persistence: %s",
            exc,
        )
        return

    if task is None:
        return

    merged_input: dict = {}
    raw_input_data = getattr(task, "inputData", None)
    if raw_input_data:
        try:
            parsed_input_data = json.loads(raw_input_data)
        except (TypeError, json.JSONDecodeError):
            logger.warning(
                "Failed to parse task inputData as JSON for task %s",
                task_id,
            )
            parsed_input_data = None
        if isinstance(parsed_input_data, dict):
            merged_input.update(parsed_input_data)

    merged_input["preview_content"] = preview_payload
    merged_input["preview_cached_at"] = int(time.time())
    try:
        await db_service.db.generationtask.update(
            where={"id": task_id},
            data={"inputData": json.dumps(merged_input, ensure_ascii=False)},
        )
    except Exception as exc:
        logger.warning(
            "Failed to persist preview payload into task inputData for task %s: %s",
            task_id,
            exc,
        )
