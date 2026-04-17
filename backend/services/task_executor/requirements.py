"""Requirement-building helpers for generation tasks."""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _read_field(record, field_name: str):
    if isinstance(record, dict):
        return record.get(field_name)
    return getattr(record, field_name, None)


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
            # Try to select only required fields for performance
            try:
                selected_uploads = await db_service.db.upload.find_many(
                    where={"projectId": project_id, "id": {"in": rag_source_ids}},
                    select={"filename": True, "status": True},
                )
            except TypeError:
                # Fallback if select is not supported
                selected_uploads = await db_service.db.upload.find_many(
                    where={"projectId": project_id, "id": {"in": rag_source_ids}},
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
                        (
                            f"- {_read_field(upload, 'filename')}"
                            f"（状态：{_read_field(upload, 'status')}）"
                        )
                    )

    return "\n".join(requirements_parts)


async def load_session_outline(
    db_service,
    session_id: Optional[str],
    outline_version: Optional[int] = None,
) -> tuple[Optional[dict], Optional[int]]:
    """Load latest outline document for a generation session."""
    if not session_id:
        return None, None

    target_version: Optional[int] = None
    try:
        parsed = int(outline_version) if outline_version is not None else None
        if parsed is not None and parsed >= 1:
            target_version = parsed
    except (TypeError, ValueError):
        target_version = None

    outline_record = (
        await db_service.db.outlineversion.find_first(
            where={"sessionId": session_id, "version": target_version},
        )
        if target_version is not None
        else await db_service.db.outlineversion.find_first(
            where={"sessionId": session_id},
            order={"version": "desc"},
        )
    )
    if not outline_record:
        return None, None

    try:
        outline_doc = json.loads(outline_record.outlineData)
    except (TypeError, json.JSONDecodeError):
        logger.warning(
            "Failed to decode outline data for session %s version %s",
            session_id,
            getattr(outline_record, "version", None),
        )
        return None, None

    return outline_doc, getattr(outline_record, "version", None)
