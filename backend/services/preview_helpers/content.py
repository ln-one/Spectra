import json
import logging
from pathlib import Path
from typing import Optional
from uuid import UUID

from schemas.generation import TaskStatus
from services.database import db_service

from .cache import load_preview_content, save_preview_content
from .rendering import build_lesson_plan, build_slides

logger = logging.getLogger(__name__)


async def get_or_generate_content(task, project) -> dict:
    cached = await load_preview_content(task.id)
    if cached:
        return cached

    task_status = getattr(task, "status", None)
    if task_status in {TaskStatus.PENDING, TaskStatus.PROCESSING}:
        return {
            "title": project.name or "Generating",
            "markdown_content": "",
            "lesson_plan_markdown": "",
        }

    from services.ai import ai_service

    session_id = getattr(task, "sessionId", None)
    outline_document = None
    outline_version = None
    template_config = None
    raw_template = getattr(task, "templateConfig", None)
    if raw_template:
        try:
            template_config = json.loads(raw_template)
        except (TypeError, json.JSONDecodeError):
            logger.warning("Failed to decode templateConfig for task %s", task.id)
            template_config = None

    messages = await db_service.get_recent_conversation_messages(
        project.id,
        limit=5,
        session_id=session_id,
    )
    user_msgs = [message.content for message in messages if message.role == "user"]
    user_requirements = "\n".join(user_msgs) if user_msgs else project.name

    if session_id:
        latest_outline = await db_service.db.outlineversion.find_first(
            where={"sessionId": session_id},
            order={"version": "desc"},
        )
        if latest_outline and latest_outline.outlineData:
            try:
                outline_document = json.loads(latest_outline.outlineData)
                outline_version = latest_outline.version
            except json.JSONDecodeError:
                logger.warning(
                    "Failed to decode outlineData for session %s",
                    session_id,
                )

    courseware = await ai_service.generate_courseware_content(
        project_id=project.id,
        user_requirements=user_requirements,
        outline_document=outline_document,
        outline_version=outline_version,
        session_id=session_id,
        rag_source_ids=(template_config or {}).get("rag_source_ids"),
    )
    data = {
        "title": courseware.title,
        "markdown_content": courseware.markdown_content,
        "lesson_plan_markdown": courseware.lesson_plan_markdown,
    }
    await save_preview_content(task.id, data)
    return data


def _extract_task_id_from_artifact(artifact) -> Optional[str]:
    metadata_raw = getattr(artifact, "metadata", None)
    if metadata_raw:
        try:
            metadata = json.loads(metadata_raw)
            task_id = metadata.get("task_id")
            if isinstance(task_id, str) and task_id.strip():
                return task_id.strip()
        except (TypeError, json.JSONDecodeError):
            logger.debug(
                "artifact_metadata_task_id_parse_failed: artifact_metadata=%s",
                metadata_raw,
            )

    storage_path = getattr(artifact, "storagePath", None)
    if not storage_path:
        return None
    stem = Path(storage_path).stem
    try:
        UUID(stem)
    except ValueError:
        return None
    return stem


async def _resolve_task_by_artifact(session_id: str, artifact_id: Optional[str]):
    if not artifact_id:
        return None
    artifact = await db_service.db.artifact.find_unique(where={"id": artifact_id})
    if not artifact:
        return None
    if getattr(artifact, "sessionId", None) != session_id:
        return None

    task_id = _extract_task_id_from_artifact(artifact)
    if task_id:
        task = await db_service.db.generationtask.find_unique(where={"id": task_id})
        if task and getattr(task, "sessionId", None) == session_id:
            return task
    return None


async def load_preview_material(
    session_id: str,
    project_id: str,
    artifact_id: Optional[str] = None,
):
    task = await _resolve_task_by_artifact(session_id, artifact_id)
    if task is None:
        tasks = await db_service.db.generationtask.find_many(
            where={"sessionId": session_id},
            order={"createdAt": "desc"},
            take=1,
        )
        task = tasks[0] if tasks else None

    slides: list[dict] = []
    lesson_plan: Optional[dict] = None
    content: dict = {}
    if task:
        try:
            project = await db_service.get_project(project_id)
            if not project:
                raise ValueError("project not found for preview")
            content = await get_or_generate_content(task, project)
            slide_models = build_slides(task.id, content.get("markdown_content", ""))
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
