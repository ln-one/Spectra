import logging
from typing import Optional

from services.database import db_service

from .cache import load_preview_content, save_preview_content
from .content_generation import get_or_generate_content as _get_or_generate_content
from .material_lookup import resolve_preview_task
from .rendered_preview import build_rendered_preview_payload
from .rendering import build_lesson_plan, build_slides

logger = logging.getLogger(__name__)


def _slide_identity(slide, fallback_index: int) -> str:
    value = getattr(slide, "id", None)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return f"slide-{fallback_index}"


async def get_or_generate_content(task, project) -> dict:
    return await _get_or_generate_content(
        task,
        project,
        db_service,
        load_preview_content_fn=load_preview_content,
        save_preview_content_fn=save_preview_content,
    )


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
                image_metadata=content.get("image_metadata"),
                render_markdown=content.get("render_markdown"),
            )
            rendered_preview = content.get("rendered_preview")
            if not isinstance(rendered_preview, dict):
                rendered_preview = await build_rendered_preview_payload(
                    task_id=task.id,
                    title=content.get("title", ""),
                    markdown_content=content.get("markdown_content", ""),
                    slide_ids=[
                        _slide_identity(slide, index)
                        for index, slide in enumerate(slide_models)
                    ],
                    render_markdown=content.get("render_markdown"),
                    style_manifest=content.get("style_manifest"),
                    extra_css=content.get("extra_css"),
                    page_class_plan=content.get("page_class_plan"),
                )
                if rendered_preview:
                    content["rendered_preview"] = rendered_preview
                    await save_preview_content(task.id, content)

            page_by_slide_id = {}
            if isinstance(rendered_preview, dict):
                for page in rendered_preview.get("pages", []) or []:
                    slide_id = str(page.get("slide_id") or "").strip()
                    if slide_id:
                        page_by_slide_id[slide_id] = page

            for index, slide in enumerate(slide_models):
                page = page_by_slide_id.get(
                    getattr(slide, "id", None) or _slide_identity(slide, index)
                )
                if page and page.get("image_url"):
                    slide.thumbnail_url = page.get("image_url")
            slides = [slide.model_dump() for slide in slide_models]
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
