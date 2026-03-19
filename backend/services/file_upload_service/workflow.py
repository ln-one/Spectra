from typing import Optional

from fastapi import BackgroundTasks, Request, UploadFile

from services import db_service, file_service
from utils.responses import success_response

from .access import (
    MAX_FILE_SIZE,
    resolve_file_type,
    validate_upload_file,
    verify_project_access,
)
from .indexing import _SYNC_RAG_INDEXING, dispatch_rag_indexing, index_upload_for_rag
from .serialization import serialize_upload


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
    return success_response(data={"file": file_payload}, message="文件上传成功")


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
