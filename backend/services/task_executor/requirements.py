"""Requirement-building helpers for generation tasks."""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def build_user_requirements(
    db_service,
    project_id: str,
    session_id: Optional[str] = None,
    rag_source_ids: Optional[list[str]] = None,
) -> str:
    """Build user requirements text from project metadata and recent user messages."""
    project = await db_service.get_project(project_id)
    if not project:
        return "生成课件"

    messages = await db_service.get_recent_conversation_messages(
        project_id=project_id,
        limit=10,
        session_id=session_id,
        select={"role": True, "content": True},
    )
    user_messages = [msg for msg in messages if msg.role == "user"]

    requirements_parts = [f"项目名称：{project.name}"]
    if project.description:
        requirements_parts.append(f"项目描述：{project.description}")

    if user_messages:
        requirements_parts.append("\n用户需求：")
        for msg in reversed(user_messages[-3:]):
            requirements_parts.append(f"- {msg.content}")

    if rag_source_ids:
        try:
            selected_uploads = await db_service.db.upload.find_many(
                where={"projectId": project_id, "id": {"in": rag_source_ids}},
                select={"filename": True, "status": True},
            )
        except Exception as exc:
            logger.warning(
                "Failed to resolve selected uploads for requirements: %s",
                exc,
            )
        else:
            if selected_uploads:
                requirements_parts.append("\n本次限定参考资料：")
                for upload in selected_uploads:
                    requirements_parts.append(
                        f"- {upload.filename}（状态：{upload.status}）"
                    )

    return "\n".join(requirements_parts)


async def load_session_outline(
    db_service,
    session_id: Optional[str],
) -> tuple[Optional[dict], Optional[int]]:
    """Load latest outline document for a generation session."""
    if not session_id:
        return None, None

    latest_outline = await db_service.db.outlineversion.find_first(
        where={"sessionId": session_id},
        order={"version": "desc"},
    )
    if not latest_outline:
        return None, None

    try:
        outline_doc = json.loads(latest_outline.outlineData)
    except (TypeError, json.JSONDecodeError):
        logger.warning(
            "Failed to decode outline data for session %s version %s",
            session_id,
            latest_outline.version,
        )
        return None, None

    return outline_doc, latest_outline.version
