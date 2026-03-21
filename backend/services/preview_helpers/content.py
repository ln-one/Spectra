import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Optional
from uuid import UUID

from schemas.generation import TaskStatus
from services.database import db_service
from services.database.prisma_compat import (
    find_first_with_select_fallback,
    find_many_with_select_fallback,
    find_unique_with_select_fallback,
)

from .cache import load_preview_content, save_preview_content
from .rendering import build_lesson_plan, build_slides

logger = logging.getLogger(__name__)
_TASK_PREVIEW_SELECT = {
    "id": True,
    "status": True,
    "sessionId": True,
    "templateConfig": True,
    "inputData": True,
}


def _preview_rebuild_timeout_seconds() -> float:
    raw = os.getenv("PREVIEW_REBUILD_TIMEOUT_SECONDS", "8").strip()
    try:
        parsed = float(raw)
        return parsed if parsed > 0 else 8.0
    except ValueError:
        return 8.0


def _build_fallback_preview_payload(project_name: str) -> dict:
    return {
        "title": project_name or "课件预览",
        "markdown_content": "",
        "lesson_plan_markdown": "",
    }


def _build_outline_preview_payload(
    project_name: str,
    outline_document: Optional[dict],
) -> Optional[dict]:
    nodes = (
        (outline_document or {}).get("nodes")
        if isinstance(outline_document, dict)
        else None
    )
    if not isinstance(nodes, list) or not nodes:
        return None

    sorted_nodes = sorted(
        [node for node in nodes if isinstance(node, dict)],
        key=lambda item: int(item.get("order") or 0),
    )
    if not sorted_nodes:
        return None

    markdown_slides: list[str] = []
    lesson_plan_lines: list[str] = [
        "# 教学目标",
        "- 形成完整知识框架并完成课堂讲解闭环",
        "",
        "# 教学过程",
    ]
    for node in sorted_nodes:
        title = str(node.get("title") or "教学内容").strip()
        key_points = [
            str(point).strip()
            for point in (node.get("key_points") or [])
            if str(point).strip()
        ]
        slide_lines = [f"# {title}"]
        if key_points:
            slide_lines.extend([f"- {point}" for point in key_points[:6]])
        else:
            slide_lines.append("- 核心要点讲解")
        markdown_slides.append("\n".join(slide_lines))

        lesson_plan_lines.extend(
            [
                f"## {title}",
                f"- 教学目标：完成 {title} 的理解与表达",
                f"- 教师提示：围绕“{'；'.join(key_points[:3]) or '核心要点'}”组织提问与板书",
            ]
        )

    return {
        "title": project_name or "课件预览",
        "markdown_content": "\n\n---\n\n".join(markdown_slides),
        "lesson_plan_markdown": "\n".join(lesson_plan_lines),
    }


def _parse_preview_content_from_input_data(raw_input_data: object) -> Optional[dict]:
    if not raw_input_data:
        return None
    if not isinstance(raw_input_data, str):
        return None
    try:
        payload = json.loads(raw_input_data)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    preview_content = payload.get("preview_content")
    if not isinstance(preview_content, dict):
        return None

    title = preview_content.get("title")
    markdown_content = preview_content.get("markdown_content")
    lesson_plan_markdown = preview_content.get("lesson_plan_markdown")
    if not isinstance(title, str):
        return None
    if not isinstance(markdown_content, str):
        return None
    if not isinstance(lesson_plan_markdown, str):
        return None
    return {
        "title": title,
        "markdown_content": markdown_content,
        "lesson_plan_markdown": lesson_plan_markdown,
    }


async def get_or_generate_content(task, project) -> dict:
    cached = await load_preview_content(task.id)
    if cached:
        return cached

    persisted = _parse_preview_content_from_input_data(getattr(task, "inputData", None))
    if persisted:
        try:
            await save_preview_content(task.id, persisted)
        except Exception as exc:  # pragma: no cover - defensive cache path
            logger.warning(
                "Failed to rehydrate preview cache from task inputData for task %s: %s",
                task.id,
                exc,
            )
        return persisted

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

    task_status = getattr(task, "status", None)
    if task_status in {TaskStatus.PENDING, TaskStatus.PROCESSING}:
        return _build_fallback_preview_payload(project.name or "Generating")
    if task_status == TaskStatus.FAILED:
        outline_preview = _build_outline_preview_payload(project.name, outline_document)
        if outline_preview:
            try:
                await save_preview_content(task.id, outline_preview)
            except Exception as exc:  # pragma: no cover - defensive cache path
                logger.warning(
                    "Failed to cache outline fallback preview for task %s: %s",
                    task.id,
                    exc,
                )
            return outline_preview
        return _build_fallback_preview_payload(project.name)

    messages = await db_service.get_recent_conversation_messages(
        project.id,
        limit=5,
        session_id=session_id,
    )
    user_msgs = [message.content for message in messages if message.role == "user"]
    user_requirements = "\n".join(user_msgs) if user_msgs else project.name

    from services.ai import ai_service

    try:
        courseware = await asyncio.wait_for(
            ai_service.generate_courseware_content(
                project_id=project.id,
                user_requirements=user_requirements,
                outline_document=outline_document,
                outline_version=outline_version,
                session_id=session_id,
                rag_source_ids=(template_config or {}).get("rag_source_ids"),
            ),
            timeout=_preview_rebuild_timeout_seconds(),
        )
    except asyncio.TimeoutError:
        logger.warning(
            "Preview AI rebuild timed out for task %s, project %s",
            task.id,
            project.id,
        )
        return _build_fallback_preview_payload(project.name)
    except Exception as exc:
        logger.warning(
            "Preview AI rebuild failed for task %s, project %s: %s",
            task.id,
            project.id,
            exc,
        )
        return _build_fallback_preview_payload(project.name)

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
    artifact = await find_unique_with_select_fallback(
        model=db_service.db.artifact,
        where={"id": artifact_id},
        select={"sessionId": True, "metadata": True, "storagePath": True},
    )
    if not artifact:
        return None
    if getattr(artifact, "sessionId", None) != session_id:
        return None

    task_id = _extract_task_id_from_artifact(artifact)
    if task_id:
        task = await find_unique_with_select_fallback(
            model=db_service.db.generationtask,
            where={"id": task_id},
            select=_TASK_PREVIEW_SELECT,
        )
        if task and getattr(task, "sessionId", None) == session_id:
            return task
    return None


async def load_preview_material(
    session_id: str,
    project_id: str,
    artifact_id: Optional[str] = None,
    task_id: Optional[str] = None,
):
    task = await _resolve_task_by_artifact(session_id, artifact_id)
    if task is None and task_id:
        task = await find_unique_with_select_fallback(
            model=db_service.db.generationtask,
            where={"id": task_id},
            select=_TASK_PREVIEW_SELECT,
        )
        if task and getattr(task, "sessionId", None) != session_id:
            task = None
    if task is None:
        task_model = db_service.db.generationtask
        if hasattr(task_model, "find_first"):
            task = await find_first_with_select_fallback(
                model=task_model,
                where={"sessionId": session_id},
                order={"createdAt": "desc"},
                select=_TASK_PREVIEW_SELECT,
            )
        else:
            tasks = await find_many_with_select_fallback(
                model=task_model,
                where={"sessionId": session_id},
                order={"createdAt": "desc"},
                take=1,
                select=_TASK_PREVIEW_SELECT,
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
