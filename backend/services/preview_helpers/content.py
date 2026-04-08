import logging
from typing import Optional

from services.database import db_service

from .cache import load_preview_content, save_preview_content
from .content_generation import get_or_generate_content as _get_or_generate_content
from .material_lookup import resolve_preview_task
from .rendering import build_lesson_plan, build_slides
from .slide_mapping import slide_identity

logger = logging.getLogger(__name__)


async def get_or_generate_content(task, project) -> dict:
    return await _get_or_generate_content(
        task,
        project,
        db_service,
        load_preview_content_fn=load_preview_content,
        save_preview_content_fn=save_preview_content,
    )


def _attach_rendered_preview_to_slides(
    *,
    slide_models,
    rendered_preview: dict | None,
    task_id: str,
) -> list[dict]:
    page_by_slide_id: dict[str, dict] = {}
    if isinstance(rendered_preview, dict):
        for page in rendered_preview.get("pages", []) or []:
            slide_id = str(page.get("slide_id") or "").strip()
            if slide_id:
                page_by_slide_id[slide_id] = page

    slides: list[dict] = []
    for index, slide in enumerate(slide_models):
        page = page_by_slide_id.get(slide_identity(slide, index, task_id=task_id))
        if page and page.get("image_url"):
            slide.thumbnail_url = page.get("image_url")

        dumped = slide.model_dump()
        if page and page.get("html_preview"):
            dumped["rendered_html_preview"] = page.get("html_preview")
        slides.append(dumped)
    return slides


async def load_preview_material(
    session_id: str,
    project_id: str,
    artifact_id: Optional[str] = None,
    task_id: Optional[str] = None,
    run_id: Optional[str] = None,
):
    task = await resolve_preview_task(
        db_service, session_id, artifact_id, task_id, run_id
    )

    slides: list[dict] = []
    lesson_plan: Optional[dict] = None
    content: dict = {}
    if task:
        try:
            project = await db_service.get_project(project_id)
            if not project:
                raise ValueError("project not found for preview")
            content = await get_or_generate_content(task, project)
            slide_models = build_slides(
                task.id,
                content.get("markdown_content", ""),
                content.get("_image_metadata") or content.get("image_metadata"),
                content.get("render_markdown"),
            )
            rendered_preview = (
                content.get("rendered_preview")
                if isinstance(content.get("rendered_preview"), dict)
                else None
            )
            if rendered_preview is None:
                logger.info(
                    "Preview cache miss on read path: task=%s session=%s",
                    task.id,
                    session_id,
                )

            slides = _attach_rendered_preview_to_slides(
                slide_models=slide_models,
                rendered_preview=rendered_preview,
                task_id=task.id,
            )
            lesson_plan = build_lesson_plan(
                slide_models,
                content.get("lesson_plan_markdown", ""),
            ).model_dump()
        except Exception as preview_err:
            logger.warning(
                "Session preview content generation failed, using fallback: %s",
                preview_err,
                exc_info=True,
            )
    return task, slides, lesson_plan, content
