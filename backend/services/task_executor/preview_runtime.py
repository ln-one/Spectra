"""Preview persistence helpers for generation tasks."""

from __future__ import annotations

import json
import logging
import time

from services.database.prisma_compat import find_unique_with_select_fallback
from services.preview_helpers.rendered_preview import build_rendered_preview_payload
from services.preview_helpers.rendering import build_slides

logger = logging.getLogger(__name__)


def _slide_identity(slide, fallback_index: int) -> str:
    value = getattr(slide, "id", None)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return f"{fallback_index}"


def extract_courseware_value(courseware_content, key: str) -> str:
    if isinstance(courseware_content, dict):
        value = courseware_content.get(key)
    else:
        value = getattr(courseware_content, key, None)
    return value if isinstance(value, str) else ""


async def cache_preview_content(
    task_id: str, courseware_content, template_config: dict | None = None
) -> dict:
    markdown_content = extract_courseware_value(courseware_content, "markdown_content")
    slide_models = build_slides(task_id, markdown_content)
    rendered_preview = await build_rendered_preview_payload(
        task_id=task_id,
        title=extract_courseware_value(courseware_content, "title"),
        markdown_content=markdown_content,
        template_config=template_config,
        slide_ids=[
            _slide_identity(slide, index) for index, slide in enumerate(slide_models)
        ],
    )
    preview_payload = {
        "title": extract_courseware_value(courseware_content, "title"),
        "markdown_content": markdown_content,
        "lesson_plan_markdown": extract_courseware_value(
            courseware_content,
            "lesson_plan_markdown",
        ),
        "rendered_preview": rendered_preview,
    }
    if hasattr(courseware_content, "_image_metadata"):
        preview_payload["_image_metadata"] = getattr(
            courseware_content, "_image_metadata"
        )
    elif (
        isinstance(courseware_content, dict) and "_image_metadata" in courseware_content
    ):
        preview_payload["_image_metadata"] = courseware_content["_image_metadata"]

    try:
        from services.preview_helpers import save_preview_content

        await save_preview_content(task_id, preview_payload)
    except Exception as cache_err:
        logger.warning(
            "Failed to save preview cache for task %s: %s", task_id, cache_err
        )
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
