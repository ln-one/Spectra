import json
import logging
import os
import pathlib
from typing import Any, Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel

from services import db_service, file_service
from services.rag_indexing_service import index_upload_file_for_rag
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.file_utils import cleanup_file
from utils.responses import success_response

router = APIRouter(prefix="/files", tags=["Files"])
logger = logging.getLogger(__name__)

_DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"
_SYNC_RAG_INDEXING = os.getenv(
    "SYNC_RAG_INDEXING", "true" if _DEBUG_MODE else "false"
).lower() == "true"


class UpdateFileIntentRequest(BaseModel):
    """标注文件用途请求"""

    usage_intent: str


class BatchDeleteRequest(BaseModel):
    file_ids: list[str]


MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", str(100 * 1024 * 1024)))
_DEFAULT_EXTENSIONS = {
    "pdf",
    "docx",
    "doc",
    "pptx",
    "ppt",
    "txt",
    "md",
    "csv",
    "mp4",
    "mov",
    "avi",
    "webm",
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "mp3",
    "wav",
    "m4a",
    "ogg",
}
_EXTRA_EXTENSIONS = {
    ext.strip().lower().lstrip(".")
    for ext in os.getenv("ALLOWED_EXTENSIONS", "").split(",")
    if ext.strip()
}
ALLOWED_EXTENSIONS = _DEFAULT_EXTENSIONS | _EXTRA_EXTENSIONS


def _resolve_file_type(filename: str, mime_type: Optional[str] = None) -> str:
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if mime_type:
        if mime_type == "application/pdf":
            return "pdf"
        if mime_type.startswith("text/"):
            return "word"
        if "wordprocessingml" in mime_type or mime_type in {"application/msword"}:
            return "word"
        if "presentationml" in mime_type or mime_type in {
            "application/vnd.ms-powerpoint"
        }:
            return "ppt"
        if mime_type.startswith("video/"):
            return "video"
        if mime_type.startswith("image/"):
            return "image"

    file_type_map = {
        "pdf": "pdf",
        "docx": "word",
        "doc": "word",
        "txt": "word",
        "md": "word",
        "csv": "word",
        "pptx": "ppt",
        "ppt": "ppt",
        "mp4": "video",
        "mov": "video",
        "avi": "video",
        "webm": "video",
        "jpg": "image",
        "jpeg": "image",
        "png": "image",
        "gif": "image",
        "webp": "image",
    }
    return file_type_map.get(ext, "pdf")


async def _verify_project_access(project_id: str, user_id: str):
    project = await db_service.get_project(project_id)
    if not project:
        raise NotFoundException(message=f"项目不存在: {project_id}")
    if project.userId != user_id:
        raise ForbiddenException(message="无权限访问此项目")
    return project


async def _index_upload_for_rag(
    upload,
    project_id: str,
    session_id: Optional[str] = None,
):
    """解析上传文件并建立 RAG 索引（BackgroundTasks 降级路径）。"""
    await db_service.update_upload_status(upload.id, status="parsing")

    try:
        parse_result = await index_upload_file_for_rag(
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
            status="ready",
            parse_result=parse_result,
            error_message=None,
        )
    except Exception as e:
        logger.error(
            f"Failed to parse/index file {upload.id}: {e}",
            extra={"file_id": upload.id, "project_id": project_id},
            exc_info=True,
        )
        await db_service.update_upload_status(
            upload.id,
            status="failed",
            error_message=str(e),
        )


def _dispatch_rag_indexing(
    request: Request,
    background_tasks: BackgroundTasks,
    upload,
    project_id: str,
    session_id: Optional[str],
) -> None:
    """
    C1：优先将 RAG 索引任务投递到 RQ 可恢复队列；
    队列不可用时降级到进程内 BackgroundTasks。
    """
    task_queue_service = getattr(request.app.state, "task_queue_service", None)
    if task_queue_service is not None:
        try:
            queue_info = task_queue_service.get_queue_info()
            workers = (queue_info.get("workers") or {}).get("count", 0)
            if workers <= 0:
                logger.warning(
                    "No RQ workers detected, fallback to BackgroundTasks: file_id=%s",
                    upload.id,
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
                "Failed to enqueue RAG indexing task, falling back to"
                " BackgroundTasks: file_id=%s error=%s",
                upload.id,
                enqueue_err,
            )
    background_tasks.add_task(_index_upload_for_rag, upload, project_id, session_id)


async def _save_and_record_upload(file: UploadFile, project_id: str):
    _validate_upload_file(file.filename)
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise ValueError(
            f"文件大小超限（{len(content)} bytes），最大允许 {MAX_FILE_SIZE} bytes"
        )
    filepath, file_size = await file_service.save_file(file.filename, content)
    file_type = _resolve_file_type(file.filename, file.content_type)
    return await db_service.create_upload(
        filename=file.filename,
        filepath=filepath,
        size=file_size,
        project_id=project_id,
        file_type=file_type,
        mime_type=file.content_type,
    )


def _validate_upload_file(filename: str):
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if not ext or ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件类型: {filename}")


def _derive_parse_progress(status: Optional[str]) -> Optional[int]:
    if not status:
        return None
    status_l = status.lower()
    if status_l in {"ready", "failed"}:
        return 100
    if status_l == "parsing":
        return 50
    if status_l == "uploading":
        return 0
    return None


def _safe_parse_json_object(value: Any) -> Optional[dict]:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid parseResult JSON during upload serialization")
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _extract_parse_details(parse_result: Optional[dict]) -> Optional[dict]:
    if not parse_result:
        return None
    keys = {"pages_extracted", "images_extracted", "text_length", "duration"}
    details = {k: parse_result[k] for k in keys if k in parse_result}
    return details or None


def _serialize_upload(upload: Any) -> dict:
    parse_result = _safe_parse_json_object(getattr(upload, "parseResult", None))
    status = getattr(upload, "status", None)
    return {
        "id": getattr(upload, "id", None),
        "filename": getattr(upload, "filename", None),
        "file_type": getattr(upload, "fileType", None),
        "mime_type": getattr(upload, "mimeType", None),
        "file_size": getattr(upload, "size", None),
        "status": status,
        "parse_progress": _derive_parse_progress(status),
        "parse_details": _extract_parse_details(parse_result),
        "parse_error": getattr(upload, "errorMessage", None),
        "usage_intent": getattr(upload, "usageIntent", None),
        "parse_result": parse_result,
        "created_at": getattr(upload, "createdAt", None),
        "updated_at": getattr(upload, "updatedAt", None),
    }


@router.post("")
async def upload_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: str = Form(...),
    session_id: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    try:
        await _verify_project_access(project_id, user_id)
        upload = await _save_and_record_upload(file, project_id)
        await db_service.update_upload_status(upload.id, status="parsing")
        latest = await db_service.get_file(upload.id)
        if _SYNC_RAG_INDEXING:
            await _index_upload_for_rag(latest, project_id, session_id)
        else:
            _dispatch_rag_indexing(
                request, background_tasks, latest, project_id, session_id
            )

        logger.info(
            "file_uploaded",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "file_id": upload.id,
                "upload_filename": file.filename,
                "session_id": session_id,
                "idempotency_key": bool(idempotency_key),
            },
        )
        return success_response(
            data={"file": _serialize_upload(latest)},
            message="文件上传成功",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to upload file: {str(e)}",
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {e}",
        )


@router.post("/batch")
async def batch_upload_files(
    request: Request,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    project_id: str = Form(...),
    session_id: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    try:
        await _verify_project_access(project_id, user_id)

        uploaded_files = []
        failed = []
        for file in files:
            try:
                upload = await _save_and_record_upload(file, project_id)
                await db_service.update_upload_status(upload.id, status="parsing")
                latest = await db_service.get_file(upload.id)
                if _SYNC_RAG_INDEXING:
                    await _index_upload_for_rag(latest, project_id, session_id)
                else:
                    _dispatch_rag_indexing(
                        request, background_tasks, latest, project_id, session_id
                    )
                uploaded_files.append(_serialize_upload(latest))
            except Exception as e:
                failed.append({"filename": file.filename, "error": str(e)})

        logger.info(
            "batch_files_uploaded",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "success_count": len(uploaded_files),
                "failed_count": len(failed),
                "session_id": session_id,
                "idempotency_key": bool(idempotency_key),
            },
        )

        return success_response(
            data={
                "files": uploaded_files,
                "total": len(uploaded_files),
                "failed": failed or None,
            },
            message="批量上传完成",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to batch upload files: {str(e)}",
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to batch upload files: {e}",
        )


@router.patch("/{file_id}/intent")
async def update_file_intent(
    file_id: str,
    request: UpdateFileIntentRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        file = await db_service.get_file(file_id)
        if not file:
            raise NotFoundException(message=f"文件不存在: {file_id}")

        project = await db_service.get_project(file.projectId)
        if not project or project.userId != user_id:
            raise ForbiddenException(message="无权限访问此文件")

        updated_file = await db_service.update_file_intent(
            file_id, request.usage_intent
        )

        logger.info(
            "file_intent_updated",
            extra={
                "user_id": user_id,
                "file_id": file_id,
                "usage_intent": request.usage_intent,
            },
        )

        return success_response(
            data={"file": _serialize_upload(updated_file)},
            message="文件用途标注成功",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to update file intent: {str(e)}",
            extra={"user_id": user_id, "file_id": file_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update file intent: {e}",
        )


@router.delete("/batch")
async def batch_delete_files(
    request: BatchDeleteRequest,
    user_id: str = Depends(get_current_user),
):
    deleted = 0
    failed = []
    for file_id in request.file_ids:
        try:
            file = await db_service.get_file(file_id)
            if not file:
                failed.append({"file_id": file_id, "error": "文件不存在"})
                continue

            project = await db_service.get_project(file.projectId)
            if not project or project.userId != user_id:
                failed.append({"file_id": file_id, "error": "无权限删除此文件"})
                continue

            await db_service.delete_file(file_id)
            cleanup_file(pathlib.Path(file.filepath))
            deleted += 1
        except Exception as e:
            failed.append({"file_id": file_id, "error": str(e)})

    return success_response(
        data={"deleted": deleted, "failed": failed or None},
        message="批量删除完成",
    )


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        file = await db_service.get_file(file_id)
        if not file:
            raise NotFoundException(message=f"文件不存在: {file_id}")

        project = await db_service.get_project(file.projectId)
        if not project or project.userId != user_id:
            raise ForbiddenException(message="无权限删除此文件")

        await db_service.delete_file(file_id)
        cleanup_file(pathlib.Path(file.filepath))

        logger.info(
            "file_deleted",
            extra={
                "user_id": user_id,
                "file_id": file_id,
                "project_id": file.projectId,
            },
        )

        return success_response(data={"file_id": file_id}, message="文件删除成功")
    except APIException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to delete file: {str(e)}",
            extra={"user_id": user_id, "file_id": file_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete file: {e}",
        )
