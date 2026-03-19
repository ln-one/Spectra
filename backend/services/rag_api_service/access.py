import logging
from typing import Optional

from services import db_service
from services.file_upload_service import serialize_upload
from utils.exceptions import ForbiddenException

logger = logging.getLogger(__name__)


async def ensure_project_access(project_id: str, user_id: str):
    project = await db_service.get_project(project_id)
    if not project or project.userId != user_id:
        raise ForbiddenException(message="无权限访问此项目")
    return project


async def resolve_chunk_project_and_upload(chunk_id: str):
    parsed = None
    resolved_project_id: Optional[str] = None
    try:
        parsed = await db_service.db.parsedchunk.find_unique(
            where={"id": chunk_id},
            include={"upload": True},
        )
        if parsed and parsed.upload:
            resolved_project_id = parsed.upload.projectId
    except Exception as exc:
        logger.warning(
            "Failed to resolve project for chunk %s: %s",
            chunk_id,
            exc,
        )
    return resolved_project_id, parsed


async def load_chunk_upload_info(chunk_id: str, parsed=None):
    try:
        if parsed is None:
            parsed = await db_service.db.parsedchunk.find_unique(
                where={"id": chunk_id},
                include={"upload": True},
            )
        if parsed and parsed.upload:
            return serialize_upload(parsed.upload)
    except Exception as exc:
        logger.warning(
            "Failed to load file info for chunk %s: %s",
            chunk_id,
            exc,
        )
    return None
