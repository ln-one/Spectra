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
from utils.exceptions import APIException
from utils.responses import success_response

from .shared import logger

router = APIRouter()


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
    except Exception as exc:
        logger.error(
            "Failed to upload file: %s",
            exc,
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {exc}",
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
            except Exception as exc:
                failed.append({"filename": file.filename, "error": str(exc)})

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
    except Exception as exc:
        logger.error(
            "Failed to batch upload files: %s",
            exc,
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to batch upload files: {exc}",
        )
