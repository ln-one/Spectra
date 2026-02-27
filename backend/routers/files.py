import logging
import pathlib
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
    status,
)
from pydantic import BaseModel

from services import db_service, file_service
from services.chunking import split_text
from services.file_parser import extract_text_for_rag
from services.rag_service import ParsedChunkData, rag_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.file_utils import cleanup_file
from utils.responses import success_response

router = APIRouter(prefix="/files", tags=["Files"])
logger = logging.getLogger(__name__)


class UpdateFileIntentRequest(BaseModel):
    """标注文件用途请求"""

    usage_intent: str


class BatchDeleteRequest(BaseModel):
    file_ids: list[str]


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


async def _index_upload_for_rag(upload, project_id: str):
    """解析上传文件并建立 RAG 索引。"""
    await db_service.update_upload_status(upload.id, status="parsing")

    try:
        text, parse_details = extract_text_for_rag(
            filepath=upload.filepath,
            filename=upload.filename,
            file_type=upload.fileType,
        )
        if not text.strip():
            text = (
                f"资料名称：{upload.filename}\n"
                f"资料类型：{upload.fileType}\n"
                "该资料可作为课堂讲解与课件生成的参考来源。"
            )
            parse_details["text_length"] = len(text)

        chunks = split_text(text, chunk_size=500, chunk_overlap=50)
        if not chunks:
            chunks = [text]

        chunk_payloads = [
            {
                "chunk_index": idx,
                "content": chunk,
                "metadata": {
                    "filename": upload.filename,
                    "source_type": upload.fileType,
                },
            }
            for idx, chunk in enumerate(chunks)
        ]

        db_chunks = await db_service.create_parsed_chunks(
            upload_id=upload.id,
            source_type=upload.fileType,
            chunks=chunk_payloads,
        )

        rag_chunks = []
        for db_chunk, payload in zip(db_chunks, chunk_payloads):
            metadata = payload["metadata"] | {
                "upload_id": upload.id,
                "chunk_index": payload["chunk_index"],
            }
            rag_chunks.append(
                ParsedChunkData(
                    chunk_id=db_chunk.id,
                    content=payload["content"],
                    metadata=metadata,
                )
            )

        indexed_count = await rag_service.index_chunks(project_id, rag_chunks)
        parse_result = {
            "chunk_count": len(chunks),
            "indexed_count": indexed_count,
            **parse_details,
        }
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


async def _save_and_record_upload(file: UploadFile, project_id: str):
    content = await file.read()
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


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    try:
        await _verify_project_access(project_id, user_id)
        upload = await _save_and_record_upload(file, project_id)
        await _index_upload_for_rag(upload, project_id)

        logger.info(
            "file_uploaded",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "file_id": upload.id,
                "upload_filename": file.filename,
                "idempotency_key": bool(idempotency_key),
            },
        )
        latest = await db_service.get_file(upload.id)
        return success_response(data={"file": latest}, message="文件上传成功")
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
    files: list[UploadFile] = File(...),
    project_id: str = Form(...),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    try:
        await _verify_project_access(project_id, user_id)

        uploaded_files = []
        failed = []
        for file in files:
            try:
                upload = await _save_and_record_upload(file, project_id)
                await _index_upload_for_rag(upload, project_id)
                latest = await db_service.get_file(upload.id)
                uploaded_files.append(latest)
            except Exception as e:
                failed.append({"filename": file.filename, "error": str(e)})

        logger.info(
            "batch_files_uploaded",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "success_count": len(uploaded_files),
                "failed_count": len(failed),
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
            data={"file": updated_file},
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
