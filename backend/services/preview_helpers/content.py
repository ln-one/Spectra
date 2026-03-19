import json
import logging
from typing import Optional

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

    messages = await db_service.get_recent_conversation_messages(project.id, limit=5)
    user_msgs = [message.content for message in messages if message.role == "user"]
    user_requirements = "\n".join(user_msgs) if user_msgs else project.name

    outline_document = None
    outline_version = None
    session_id = getattr(task, "sessionId", None)
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
    )
    data = {
        "title": courseware.title,
        "markdown_content": courseware.markdown_content,
        "lesson_plan_markdown": courseware.lesson_plan_markdown,
    }
    await save_preview_content(task.id, data)
    return data


async def load_preview_material(session_id: str, project_id: str):
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
