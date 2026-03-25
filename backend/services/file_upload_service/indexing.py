import logging
import os
from typing import Optional

from fastapi import BackgroundTasks, Request

from services.database import db_service
from services.task_queue.status import inspect_worker_availability
from services.task_queue.status_constants import QueueWorkerAvailability
from utils.upstream_failures import describe_upstream_failure

from .constants import UploadStatus

logger = logging.getLogger(__name__)
_SYNC_RAG_INDEXING = os.getenv("SYNC_RAG_INDEXING", "false").lower() == "true"


def _build_rag_index_failure_payload(exc: Exception) -> dict:
    failure = describe_upstream_failure(exc)
    return {
        "status": "failed",
        "stage": "rag_indexing",
        "failure_type": failure["failure_type"],
        "retryable": bool(failure["retryable"]),
        "raw_message": failure["raw_message"],
    }


async def index_upload_for_rag(
    upload,
    project_id: str,
    session_id: Optional[str] = None,
):
    try:
        from services.media.rag_indexing import (
            index_upload_file_for_rag as index_upload,
        )

        parse_result = await index_upload(
            upload=upload,
            project_id=project_id,
            session_id=session_id,
            chunk_size=500,
            chunk_overlap=50,
            reindex=False,
            db=db_service,
        )
        await db_service.update_upload_status(
            upload.id,
            status=UploadStatus.READY.value,
            parse_result=parse_result,
            error_message=None,
        )
    except Exception as exc:
        logger.error(
            "Failed to parse/index file %s: %s",
            upload.id,
            exc,
            extra={"file_id": upload.id, "project_id": project_id},
            exc_info=True,
        )
        await db_service.update_upload_status(
            upload.id,
            status=UploadStatus.FAILED.value,
            parse_result=_build_rag_index_failure_payload(exc),
            error_message=str(exc),
        )


def dispatch_rag_indexing(
    request: Request,
    background_tasks: BackgroundTasks,
    upload,
    project_id: str,
    session_id: Optional[str],
) -> None:
    task_queue_service = getattr(request.app.state, "task_queue_service", None)
    if task_queue_service is not None:
        try:
            availability = inspect_worker_availability(task_queue_service)
            if availability["status"] != QueueWorkerAvailability.AVAILABLE.value:
                logger.warning(
                    "RAG indexing queue unavailable, fallback to BackgroundTasks: "
                    "file_id=%s queue_health=%s workers=%s stale=%s error=%s",
                    upload.id,
                    availability["status"],
                    availability.get("worker_count", 0),
                    availability.get("stale_worker_count", 0),
                    availability.get("error"),
                )
            else:
                task_queue_service.enqueue_rag_indexing_task(
                    file_id=upload.id,
                    project_id=project_id,
                    session_id=session_id,
                )
                return
        except Exception as enqueue_err:
            logger.warning(
                "Failed to enqueue RAG indexing task, falling back to BackgroundTasks: "
                "file_id=%s error=%s",
                upload.id,
                enqueue_err,
            )
    background_tasks.add_task(index_upload_for_rag, upload, project_id, session_id)
