import inspect
import json
import logging
import re
from pathlib import Path
from typing import Optional

from services.file_parser import extract_text_for_rag
from services.database import db_service

from .cache import load_preview_content, save_preview_content
from .content_generation import get_or_generate_content as _get_or_generate_content
from .material_lookup import resolve_preview_task
from .rendered_preview import build_rendered_preview_payload
from .rendering import build_lesson_plan, build_slides
from .slide_mapping import slide_identity

logger = logging.getLogger(__name__)


def _parse_artifact_metadata(raw_metadata) -> dict:
    if isinstance(raw_metadata, dict):
        return dict(raw_metadata)
    if isinstance(raw_metadata, str) and raw_metadata.strip():
        try:
            parsed = json.loads(raw_metadata)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            logger.debug("artifact metadata decode failed for preview hydration")
    return {}


def _normalize_docx_preview_markdown(title: str, text: str) -> str:
    normalized_text = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    normalized_text = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", normalized_text)
    normalized_text = normalized_text.replace("\u21b5", "\n")
    normalized_text = normalized_text.replace("\ufeff", "")
    normalized_text = re.sub(r"[\u200b\u200c\u200d\xa0]", " ", normalized_text)
    normalized_text = normalized_text.replace("□", "")
    normalized_text = re.sub(r"[ \t]+", " ", normalized_text)

    def _clean_line(value: str) -> str:
        line = str(value or "").strip()
        line = re.sub(r"^[•·▪◦●■]+\s*", "", line)
        line = line.replace("↵", "").replace("□", "").strip()
        return line

    paragraphs = [_clean_line(line) for line in normalized_text.split("\n")]
    paragraphs = [line for line in paragraphs if line]
    normalized_title = _clean_line(title)

    if normalized_title and paragraphs and paragraphs[0] == normalized_title:
        paragraphs = paragraphs[1:]
    elif normalized_title and paragraphs:
        first_line = paragraphs[0]
        if first_line.endswith(normalized_title):
            leading = first_line[: -len(normalized_title)].strip()
            if not leading or re.fullmatch(r"[#>*\-\d\.\)\s]+", leading):
                paragraphs = paragraphs[1:]

    paragraphs = [
        "## 摘要" if line.lower() == "summary" else line for line in paragraphs
    ]

    body = "\n\n".join(paragraphs).strip()
    if normalized_title and body:
        return f"# {normalized_title}\n\n{body}"
    if normalized_title:
        return f"# {normalized_title}"
    return body


async def _load_docx_artifact_preview_content(
    project_id: str,
    artifact_id: Optional[str],
) -> dict:
    if not artifact_id:
        return {}

    artifact = await db_service.get_artifact(artifact_id)
    if not artifact or getattr(artifact, "projectId", None) != project_id:
        return {}
    if str(getattr(artifact, "type", "") or "").strip().lower() != "docx":
        return {}

    storage_path = str(getattr(artifact, "storagePath", "") or "").strip()
    if not storage_path:
        return {}

    filename = Path(storage_path).name or f"{artifact_id}.docx"
    extracted_text, _ = extract_text_for_rag(
        storage_path,
        filename,
        "word",
    )
    metadata = _parse_artifact_metadata(getattr(artifact, "metadata", None))
    title = str(metadata.get("title") or "").strip()
    markdown_content = _normalize_docx_preview_markdown(title, extracted_text)
    if not markdown_content.strip():
        return {}

    return {
        "title": title or filename,
        "markdown_content": markdown_content,
        "lesson_plan_markdown": "",
    }


def _build_slides_compatible(
    task_id: str,
    markdown_content: str,
    image_metadata,
    render_markdown,
):
    """
    Backward-compatible build_slides invocation.

    Some tests / legacy monkeypatches still expose old 2/3-arg signatures.
    This helper adapts call arity without relying on keyword names.
    """
    try:
        signature = inspect.signature(build_slides)
    except (TypeError, ValueError):
        signature = None

    if signature:
        params = list(signature.parameters.values())
        if any(p.kind == inspect.Parameter.VAR_POSITIONAL for p in params):
            return build_slides(
                task_id,
                markdown_content,
                image_metadata,
                render_markdown,
            )

        positional_capacity = sum(
            1
            for p in params
            if p.kind
            in (
                inspect.Parameter.POSITIONAL_ONLY,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
            )
        )
        if positional_capacity >= 4:
            return build_slides(
                task_id,
                markdown_content,
                image_metadata,
                render_markdown,
            )
        if positional_capacity >= 3:
            return build_slides(task_id, markdown_content, image_metadata)
        return build_slides(task_id, markdown_content)

    # Fallback if signature introspection is unavailable.
    try:
        return build_slides(task_id, markdown_content, image_metadata, render_markdown)
    except TypeError:
        try:
            return build_slides(task_id, markdown_content, image_metadata)
        except TypeError:
            return build_slides(task_id, markdown_content)


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
    if task is None:
        try:
            content = await _load_docx_artifact_preview_content(project_id, artifact_id)
        except Exception as preview_err:
            logger.warning(
                "Docx artifact preview extraction failed: %s",
                preview_err,
                exc_info=True,
            )
        if content:
            return task, slides, lesson_plan, content

    if task:
        try:
            project = await db_service.get_project(project_id)
            if not project:
                raise ValueError("project not found for preview")
            content = await get_or_generate_content(task, project)
            slide_models = _build_slides_compatible(
                task_id=task.id,
                markdown_content=content.get("markdown_content", ""),
                image_metadata=content.get("_image_metadata")
                or content.get("image_metadata"),
                render_markdown=content.get("render_markdown"),
            )
            rendered_preview = content.get("rendered_preview")
            if not isinstance(rendered_preview, dict):
                rendered_preview = await build_rendered_preview_payload(
                    task_id=task.id,
                    title=content.get("title", ""),
                    markdown_content=content.get("markdown_content", ""),
                    slide_ids=[
                        slide_identity(slide, index, task_id=task.id)
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
                    slide_identity(slide, index, task_id=task.id)
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
