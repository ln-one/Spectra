from typing import Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Header,
    Request,
    UploadFile,
)

from services.file_upload_service import (
    apply_mineru_parse_result_response,
    batch_upload_files_response,
    upload_file_response,
)
from utils.dependencies import get_current_user
from utils.exceptions import APIException, InternalServerException

from .shared import (
    MineruParseResultRequest,
    logger,
)

router = APIRouter()


@router.post("")
async def upload_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: str = Form(...),
    session_id: Optional[str] = Form(None),
    defer_parse: bool = Form(False),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    try:
        response = await upload_file_response(
            request=request,
            background_tasks=background_tasks,
            file=file,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
            idempotency_key=str(idempotency_key) if idempotency_key else None,
            defer_parse=defer_parse,
        )
        logger.info(
            "file_uploaded",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "upload_filename": file.filename,
                "session_id": session_id,
                "defer_parse": defer_parse,
                "idempotency_key": bool(idempotency_key),
            },
        )
        return response
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to upload file: %s",
            exc,
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise InternalServerException(
            message="文件上传失败",
            details={"project_id": project_id, "session_id": session_id},
        )


@router.post("/batch")
async def batch_upload_files(
    request: Request,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    project_id: str = Form(...),
    session_id: Optional[str] = Form(None),
    defer_parse: bool = Form(False),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    try:
        response = await batch_upload_files_response(
            request=request,
            background_tasks=background_tasks,
            files=files,
            project_id=project_id,
            session_id=session_id,
            user_id=user_id,
            idempotency_key=str(idempotency_key) if idempotency_key else None,
            defer_parse=defer_parse,
        )
        payload = response["data"]
        logger.info(
            "batch_files_uploaded",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "success_count": payload["total"],
                "failed_count": len(payload["failed"] or []),
                "session_id": session_id,
                "defer_parse": defer_parse,
                "idempotency_key": bool(idempotency_key),
            },
        )
        return response
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to batch upload files: %s",
            exc,
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise InternalServerException(
            message="批量上传文件失败",
            details={"project_id": project_id, "session_id": session_id},
        )


@router.post("/{file_id}/parse/mineru")
async def apply_mineru_parse_result(
    file_id: str,
    payload: MineruParseResultRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        return await apply_mineru_parse_result_response(
            file_id=file_id,
            user_id=user_id,
            parsed_text=payload.parsed_text,
            parse_details=payload.parse_details,
            session_id=payload.session_id,
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to apply MinerU parse result: %s",
            exc,
            extra={"user_id": user_id, "file_id": file_id},
            exc_info=True,
        )
        raise InternalServerException(
            message="MinerU 解析结果同步失败",
            details={"file_id": file_id},
        )

