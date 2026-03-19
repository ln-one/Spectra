import logging
import pathlib
from typing import Optional
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

from services import db_service
from services.file_upload_service import (
    _SYNC_RAG_INDEXING,
    dispatch_rag_indexing,
    index_upload_for_rag,
    save_and_record_upload,
    serialize_upload,
    verify_project_access,
)
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
        await verify_project_access(project_id, user_id)
        upload = await save_and_record_upload(file, project_id)
        await db_service.update_upload_status(upload.id, status="parsing")
        latest = await db_service.get_file(upload.id)
        if _SYNC_RAG_INDEXING:
            await index_upload_for_rag(latest, project_id, session_id)
        else:
            dispatch_rag_indexing(
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
            data={"file": serialize_upload(latest)},
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
        await verify_project_access(project_id, user_id)

        uploaded_files = []
        failed = []
        for file in files:
            try:
                upload = await save_and_record_upload(file, project_id)
                await db_service.update_upload_status(upload.id, status="parsing")
                latest = await db_service.get_file(upload.id)
                if _SYNC_RAG_INDEXING:
                    await index_upload_for_rag(latest, project_id, session_id)
                else:
                    dispatch_rag_indexing(
                        request, background_tasks, latest, project_id, session_id
                    )
                uploaded_files.append(serialize_upload(latest))
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
            data={"file": serialize_upload(updated_file)},
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
