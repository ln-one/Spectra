"""Artifact naming helpers kept separate from generation execution flow."""

from __future__ import annotations

import json
import re
import time

from .runtime_context import read_field


def normalize_title_source(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"\.(pptx?|docx?)$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s+", "", text)
    return text


def truncate_title(value: str, max_chars: int = 20) -> str:
    return str(value or "").strip()[:max_chars]


def extract_content_title(courseware_content) -> str:
    if isinstance(courseware_content, dict):
        title = str(courseware_content.get("title") or "").strip()
        if title:
            return title
        slides = courseware_content.get("slides") or []
        if slides and isinstance(slides[0], dict):
            return str(slides[0].get("title") or "").strip()

    title = str(getattr(courseware_content, "title", "") or "").strip()
    if title:
        return title
    slides = getattr(courseware_content, "slides", None) or []
    if slides:
        first_slide = slides[0]
        if isinstance(first_slide, dict):
            return str(first_slide.get("title") or "").strip()
        return str(getattr(first_slide, "title", "") or "").strip()
    return ""


def resolve_upload_course_name(upload_filename: str) -> str:
    normalized = normalize_title_source(upload_filename)
    return truncate_title(normalized, 20)


async def resolve_course_name(db_service, context, project_id: str) -> str:
    project_name = ""
    if hasattr(db_service, "get_project"):
        try:
            project = await db_service.get_project(project_id)
            project_name = str(getattr(project, "name", "") or "").strip()
        except Exception:
            project_name = ""
    normalized_project = truncate_title(normalize_title_source(project_name), 20)
    if normalized_project:
        return normalized_project

    rag_source_ids = []
    if isinstance(getattr(context, "template_config", None), dict):
        rag_source_ids = list(context.template_config.get("rag_source_ids") or [])
    upload_model = getattr(getattr(db_service, "db", None), "upload", None)
    if upload_model is None:
        return "课程"

    if rag_source_ids and hasattr(upload_model, "find_many"):
        try:
            uploads = await upload_model.find_many(
                where={"projectId": project_id, "id": {"in": rag_source_ids}},
            )
        except Exception:
            uploads = []
        if uploads:
            filename = str(read_field(uploads[0], "filename") or "").strip()
            upload_course = resolve_upload_course_name(filename)
            if upload_course:
                return upload_course

    if hasattr(upload_model, "find_first"):
        try:
            upload = await upload_model.find_first(
                where={"projectId": project_id},
                order={"createdAt": "desc"},
            )
        except Exception:
            upload = None
        if upload:
            filename = str(read_field(upload, "filename") or "").strip()
            upload_course = resolve_upload_course_name(filename)
            if upload_course:
                return upload_course

    return "课程"


def compose_ppt_title(
    *,
    course_name: str,
    knowledge_title: str,
    max_chars: int = 20,
) -> str:
    course = normalize_title_source(course_name)
    knowledge = normalize_title_source(knowledge_title)
    if course and knowledge.startswith(course):
        knowledge = knowledge[len(course) :].strip()
    if not knowledge:
        knowledge = "核心知识点"

    combined = f"{course}{knowledge}" if course else knowledge
    combined = truncate_title(combined, max_chars)
    return combined or "课程核心知识点"


def next_title_with_suffix(base_title: str, existing_titles: set[str]) -> str:
    if base_title not in existing_titles:
        return base_title
    for idx in range(1, 1000):
        candidate = truncate_title(f"{base_title}{idx}", 20)
        if candidate not in existing_titles:
            return candidate
    return truncate_title(f"{base_title}{int(time.time()) % 1000}", 20)


def extract_metadata_title(artifact) -> str:
    raw = getattr(artifact, "metadata", None)
    parsed = {}
    if isinstance(raw, dict):
        parsed = raw
    elif isinstance(raw, str) and raw.strip():
        try:
            loaded = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            loaded = {}
        if isinstance(loaded, dict):
            parsed = loaded
    return str(parsed.get("title") or "").strip()


async def resolve_ppt_artifact_title(
    *,
    db_service,
    context,
    project_id: str,
    courseware_content,
) -> str:
    course_name = await resolve_course_name(db_service, context, project_id)
    knowledge_title = extract_content_title(courseware_content)
    base_title = compose_ppt_title(
        course_name=course_name,
        knowledge_title=knowledge_title,
        max_chars=20,
    )
    existing_titles: set[str] = set()
    try:
        from services.project_space_service.service import project_space_service

        existing_artifacts = await project_space_service.get_project_artifacts(
            project_id=project_id,
            type_filter="pptx",
        )
    except Exception:
        existing_artifacts = []
    for item in existing_artifacts or []:
        title = extract_metadata_title(item)
        if title:
            existing_titles.add(title[:20])
    return next_title_with_suffix(base_title, existing_titles)
