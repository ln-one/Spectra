import logging
from typing import Optional

from services.application.access import get_owned_project
from services.database import db_service
from services.file_upload_service import serialize_upload
from utils.exceptions import ForbiddenException, NotFoundException

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


async def resolve_and_validate_chunk_access(
    *,
    chunk_id: str,
    user_id: str,
    project_id: Optional[str] = None,
    allow_scope_fallback: bool = True,
):
    resolved_project_id, parsed = await resolve_chunk_project_and_upload(chunk_id)
    requested_project_id = str(project_id or "").strip()
    if resolved_project_id:
        if requested_project_id and requested_project_id != resolved_project_id:
            raise ForbiddenException(
                message="来源分块与请求项目不一致",
                details={
                    "chunk_id": chunk_id,
                    "requested_project_id": requested_project_id,
                    "resolved_project_id": resolved_project_id,
                },
            )
        await ensure_project_access(resolved_project_id, user_id)
        return resolved_project_id, parsed

    if allow_scope_fallback and requested_project_id:
        await ensure_project_access(requested_project_id, user_id)
        return requested_project_id, None

    raise NotFoundException(message=f"分块不存在: {chunk_id}")


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
