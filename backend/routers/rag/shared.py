import logging
import os
import tempfile
from typing import Optional

from fastapi import HTTPException, UploadFile, status

from services import db_service
from utils.exceptions import ForbiddenException

logger = logging.getLogger(__name__)
_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB


def _build_index_metadata(unit: dict) -> dict:
    """Merge unit metadata and citation fields for stable traceability."""
    metadata = dict(unit.get("metadata") or {})
    citation = dict(unit.get("citation") or {})

    if citation:
        metadata.update(
            {
                "chunk_id": citation.get("chunk_id"),
                "source_type": citation.get("source_type"),
                "filename": citation.get("filename"),
                "page_number": citation.get("page_number"),
                "timestamp": citation.get("timestamp"),
            }
        )

    metadata = {k: v for k, v in metadata.items() if v is not None}
    return metadata


def _serialize_upload(upload) -> dict:
    return {
        "id": getattr(upload, "id", None),
        "filename": getattr(upload, "filename", None),
        "file_type": getattr(upload, "fileType", None),
        "mime_type": getattr(upload, "mimeType", None),
        "file_size": getattr(upload, "size", None),
        "status": getattr(upload, "status", None),
        "parse_progress": None,
        "parse_details": None,
        "parse_error": getattr(upload, "errorMessage", None),
        "usage_intent": getattr(upload, "usageIntent", None),
        "parse_result": None,
        "created_at": getattr(upload, "createdAt", None),
        "updated_at": getattr(upload, "updatedAt", None),
    }


async def _save_upload_to_temp_file(file: UploadFile, suffix: str) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        while True:
            chunk = await file.read(_UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            tmp.write(chunk)
        return tmp.name


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
    except Exception as file_err:
        logger.warning(
            "Failed to resolve project for chunk %s: %s",
            chunk_id,
            file_err,
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
            return _serialize_upload(parsed.upload)
    except Exception as file_err:
        logger.warning("Failed to load file info for chunk %s: %s", chunk_id, file_err)
    return None


async def cleanup_temp_file(tmp_path: Optional[str]) -> None:
    if tmp_path and os.path.exists(tmp_path):
        os.unlink(tmp_path)


def handle_rag_error(message: str, exc: Exception) -> HTTPException:
    logger.error("%s: %s", message, exc, exc_info=True)
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=message,
    )
