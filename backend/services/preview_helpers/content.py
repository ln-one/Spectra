import json
import logging
import re
from pathlib import Path
from typing import Optional

from services.database import db_service
from services.file_parser import extract_text_for_rag
from utils.docx_content_sidecar import load_docx_content_sidecar

from .cache import load_preview_content, save_preview_content
from .content_generation import get_or_generate_content as _get_or_generate_content
from .material_lookup import resolve_preview_material_context
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

    sidecar_content = load_docx_content_sidecar(storage_path)
    if sidecar_content:
        markdown_content = str(
            sidecar_content.get("lesson_plan_markdown")
            or sidecar_content.get("markdown_content")
            or ""
        ).strip()
        if markdown_content and not sidecar_content.get("markdown_content"):
            sidecar_content["markdown_content"] = markdown_content
        if not sidecar_content.get("title"):
            sidecar_content["title"] = Path(storage_path).name or f"{artifact_id}.docx"
        return sidecar_content

    filename = Path(storage_path).name or f"{artifact_id}.docx"
    extracted_text, _ = extract_text_for_rag(storage_path, filename, "word")
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


def _normalized_slide_id(render_job_id: str, page_index: object) -> str:
    try:
        index = int(page_index)
    except (TypeError, ValueError):
        index = 0
    return f"{render_job_id}-slide-{max(index, 0)}"


def _normalize_rendered_preview(
    *,
    rendered_preview: dict | None,
    render_job_id: str,
) -> dict | None:
    if not isinstance(rendered_preview, dict):
        return None

    normalized_pages: list[dict] = []
    changed = False
    for fallback_index, page in enumerate(rendered_preview.get("pages", []) or []):
        if not isinstance(page, dict):
            continue
        page_copy = dict(page)
        normalized_slide_id = _normalized_slide_id(
            render_job_id,
            page_copy.get("index", fallback_index),
        )
        if page_copy.get("slide_id") != normalized_slide_id:
            page_copy["slide_id"] = normalized_slide_id
            changed = True
        normalized_pages.append(page_copy)

    normalized = dict(rendered_preview)
    normalized["pages"] = normalized_pages
    normalized["page_count"] = len(normalized_pages)
    return normalized if changed or normalized != rendered_preview else rendered_preview


async def _load_content_for_context(
    *,
    material_context: dict,
) -> dict:
    render_job_id = str(material_context.get("render_job_id") or "").strip()
    if render_job_id:
        cached = await load_preview_content(render_job_id)
        if isinstance(cached, dict):
            return cached

    artifact_metadata = material_context.get("artifact_metadata")
    if isinstance(artifact_metadata, dict):
        preview_content = artifact_metadata.get("preview_content")
        if isinstance(preview_content, dict):
            if render_job_id:
                await save_preview_content(render_job_id, preview_content)
            return preview_content

    return {}


def _attach_rendered_preview_to_slides(
    *,
    slide_models,
    rendered_preview: dict | None,
    render_job_id: str,
) -> list[dict]:
    page_by_slide_id: dict[str, dict] = {}
    if isinstance(rendered_preview, dict):
        for page in rendered_preview.get("pages", []) or []:
            slide_id = str(page.get("slide_id") or "").strip()
            if slide_id and slide_id not in page_by_slide_id:
                page_by_slide_id[slide_id] = page

    slides: list[dict] = []
    for index, slide in enumerate(slide_models):
        page = page_by_slide_id.get(slide_identity(slide, index, task_id=render_job_id))
        if page and page.get("svg_data_url"):
            slide.thumbnail_url = page.get("svg_data_url")

        dumped = slide.model_dump()
        if page and page.get("svg_data_url"):
            dumped["rendered_previews"] = [page]
        slides.append(dumped)
    return slides


async def load_preview_material(
    session_id: str,
    project_id: str,
    artifact_id: Optional[str] = None,
    task_id: Optional[str] = None,
    run_id: Optional[str] = None,
):
    material_context = await resolve_preview_material_context(
        db_service,
        session_id,
        artifact_id,
        run_id,
    )
    if material_context is None:
        try:
            docx_content = await _load_docx_artifact_preview_content(
                project_id, artifact_id
            )
        except Exception as preview_err:
            logger.warning(
                "Docx artifact preview extraction failed: %s",
                preview_err,
                exc_info=True,
            )
            docx_content = {}
        return None, [], None, docx_content

    slides: list[dict] = []
    lesson_plan: Optional[dict] = None
    content: dict = {}
    try:
        content = await _load_content_for_context(
            material_context=material_context,
        )
        render_job_id = str(material_context.get("render_job_id") or "").strip()
        rendered_preview = _normalize_rendered_preview(
            rendered_preview=(
                content.get("rendered_preview")
                if isinstance(content.get("rendered_preview"), dict)
                else None
            ),
            render_job_id=render_job_id,
        )
        if rendered_preview is not None:
            content = dict(content)
            content["rendered_preview"] = rendered_preview
            if render_job_id:
                await save_preview_content(render_job_id, content)

        markdown_content = str(content.get("markdown_content") or "").strip()
        if markdown_content:
            slide_models = build_slides(
                render_job_id,
                markdown_content,
                content.get("_image_metadata") or content.get("image_metadata"),
                content.get("render_markdown"),
            )
            if rendered_preview is None:
                logger.info(
                    "Preview cache miss on read path: render_job=%s session=%s",
                    render_job_id,
                    session_id,
                )

            slides = _attach_rendered_preview_to_slides(
                slide_models=slide_models,
                rendered_preview=rendered_preview,
                render_job_id=render_job_id,
            )
            lesson_plan = build_lesson_plan(
                slide_models,
                content.get("lesson_plan_markdown", ""),
            ).model_dump()
    except Exception as preview_err:
        logger.warning(
            "Session preview content generation failed: %s",
            preview_err,
            exc_info=True,
        )
    return material_context, slides, lesson_plan, content
