"""RAG indexing task workflow."""

import asyncio
import logging
from typing import Optional

from .common import run_async_entrypoint

logger = logging.getLogger(__name__)


def run_rag_indexing_task(
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
):
    """Sync wrapper for RQ workers to execute RAG indexing."""
    run_async_entrypoint(
        lambda: execute_rag_indexing_task(
            file_id=file_id,
            project_id=project_id,
            session_id=session_id,
        )
    )


async def execute_rag_indexing_task(
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
):
    from services.database import DatabaseService
    from services.file_upload_service.constants import UploadStatus
    from services.media.rag_indexing import index_upload_file_for_rag

    db = DatabaseService()
    db_connected = False
    try:
        await asyncio.wait_for(db.connect(), timeout=10)
        db_connected = True

        upload = await db.get_file(file_id)
        if not upload:
            logger.error("rag_indexing_task: file not found: %s", file_id)
            return

        await db.update_upload_status(upload.id, status=UploadStatus.PARSING.value)
        parse_result = await index_upload_file_for_rag(
            upload=upload,
            project_id=project_id,
            session_id=session_id,
            chunk_size=500,
            chunk_overlap=50,
            reindex=False,
            db=db,
        )
        await db.update_upload_status(
            upload.id,
            status=UploadStatus.READY.value,
            parse_result=parse_result,
            error_message=None,
        )
        logger.info(
            "rag_indexing_task_completed",
            extra={"file_id": file_id, "project_id": project_id},
        )
    except Exception as exc:
        logger.error(
            "rag_indexing_task_failed: file_id=%s error=%s",
            file_id,
            exc,
            exc_info=True,
        )
        try:
            await db.update_upload_status(
                file_id,
                status=UploadStatus.FAILED.value,
                error_message=str(exc),
            )
        except Exception:
            pass
        raise
    finally:
        if db_connected:
            try:
                await asyncio.wait_for(db.disconnect(), timeout=5)
            except Exception:
                pass
