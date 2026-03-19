import logging
from typing import Optional

from services.application.access import get_owned_project
from services.database import db_service
from services.file_upload_service import serialize_upload

logger = logging.getLogger(__name__)


async def ensure_project_access(project_id: str, user_id: str):
    return await get_owned_project(project_id, user_id)


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
