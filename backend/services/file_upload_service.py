import json
import logging
import os
from typing import Any, Optional

from fastapi import BackgroundTasks, Request, UploadFile

from services import db_service, file_service
from services.rag_indexing_service import index_upload_file_for_rag
from utils.exceptions import ForbiddenException, NotFoundException
from utils.responses import success_response

logger = logging.getLogger(__name__)
_SYNC_RAG_INDEXING = os.getenv("SYNC_RAG_INDEXING", "false").lower() == "true"
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


def resolve_file_type(filename: str, mime_type: Optional[str] = None) -> str:
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


async def verify_project_access(project_id: str, user_id: str):
    project = await db_service.get_project(project_id)
    if not project:
        raise NotFoundException(message=f"项目不存在: {project_id}")
    if project.userId != user_id:
        raise ForbiddenException(message="无权限访问此项目")
    return project


async def index_upload_for_rag(
    upload,
    project_id: str,
    session_id: Optional[str] = None,
):
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
            status="failed",
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
                "Failed to enqueue RAG indexing task, falling back to BackgroundTasks: "
                "file_id=%s error=%s",
                upload.id,
                enqueue_err,
            )
    background_tasks.add_task(index_upload_for_rag, upload, project_id, session_id)


async def save_and_record_upload(file: UploadFile, project_id: str):
    validate_upload_file(file.filename)
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise ValueError(
            f"文件大小超限（{len(content)} bytes），最大允许 {MAX_FILE_SIZE} bytes"
        )
    filepath, file_size = await file_service.save_file(file.filename, content)
    file_type = resolve_file_type(file.filename, file.content_type)
    return await db_service.create_upload(
        filename=file.filename,
        filepath=filepath,
        size=file_size,
        project_id=project_id,
        file_type=file_type,
        mime_type=file.content_type,
    )


async def _prepare_uploaded_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile,
    project_id: str,
    session_id: Optional[str],
) -> dict:
    upload = await save_and_record_upload(file, project_id)
    await db_service.update_upload_status(upload.id, status="parsing")
    latest = await db_service.get_file(upload.id)
    if _SYNC_RAG_INDEXING:
        await index_upload_for_rag(latest, project_id, session_id)
    else:
        dispatch_rag_indexing(request, background_tasks, latest, project_id, session_id)
    return serialize_upload(latest)


async def upload_file_response(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile,
    project_id: str,
    session_id: Optional[str],
    user_id: str,
):
    await verify_project_access(project_id, user_id)
    file_payload = await _prepare_uploaded_file(
        request=request,
        background_tasks=background_tasks,
        file=file,
        project_id=project_id,
        session_id=session_id,
    )
    return success_response(
        data={"file": file_payload},
        message="文件上传成功",
    )


async def batch_upload_files_response(
    request: Request,
    background_tasks: BackgroundTasks,
    files: list[UploadFile],
    project_id: str,
    session_id: Optional[str],
    user_id: str,
):
    await verify_project_access(project_id, user_id)

    uploaded_files = []
    failed = []
    for file in files:
        try:
            uploaded_files.append(
                await _prepare_uploaded_file(
                    request=request,
                    background_tasks=background_tasks,
                    file=file,
                    project_id=project_id,
                    session_id=session_id,
                )
            )
        except Exception as exc:
            failed.append({"filename": file.filename, "error": str(exc)})

    return success_response(
        data={
            "files": uploaded_files,
            "total": len(uploaded_files),
            "failed": failed or None,
        },
        message="批量上传完成",
    )


def validate_upload_file(filename: str):
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if not ext or ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件类型: {filename}")


def derive_parse_progress(status: Optional[str]) -> Optional[int]:
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


def safe_parse_json_object(value: Any) -> Optional[dict]:
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


def extract_parse_details(parse_result: Optional[dict]) -> Optional[dict]:
    if not parse_result:
        return None
    keys = {"pages_extracted", "images_extracted", "text_length", "duration"}
    details = {k: parse_result[k] for k in keys if k in parse_result}
    return details or None


def serialize_upload(upload: Any) -> dict:
    parse_result = safe_parse_json_object(getattr(upload, "parseResult", None))
    status = getattr(upload, "status", None)
    return {
        "id": getattr(upload, "id", None),
        "filename": getattr(upload, "filename", None),
        "file_type": getattr(upload, "fileType", None),
        "mime_type": getattr(upload, "mimeType", None),
        "file_size": getattr(upload, "size", None),
        "status": status,
        "parse_progress": derive_parse_progress(status),
        "parse_details": extract_parse_details(parse_result),
        "parse_error": getattr(upload, "errorMessage", None),
        "usage_intent": getattr(upload, "usageIntent", None),
        "parse_result": parse_result,
        "created_at": getattr(upload, "createdAt", None),
        "updated_at": getattr(upload, "updatedAt", None),
    }


__all__ = [
    "_SYNC_RAG_INDEXING",
    "batch_upload_files_response",
    "dispatch_rag_indexing",
    "index_upload_for_rag",
    "save_and_record_upload",
    "serialize_upload",
    "upload_file_response",
    "verify_project_access",
]
