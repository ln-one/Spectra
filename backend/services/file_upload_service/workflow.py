from typing import Any, Optional

from fastapi import BackgroundTasks, Request, UploadFile
from fastapi.encoders import jsonable_encoder

from services.database import db_service
from services.file import file_service
from utils.exceptions import NotFoundException, ValidationException
from utils.responses import success_response

from .access import (
    MAX_FILE_SIZE,
    resolve_file_type,
    validate_upload_file,
    verify_project_access,
)
from .constants import UploadStatus
from .indexing import (
    _SYNC_RAG_INDEXING,
    _build_rag_index_failure_payload,
    dispatch_rag_indexing,
    index_upload_for_rag,
)
from .serialization import serialize_upload


def _is_deferred_parse_payload(file_payload: dict) -> bool:
    parse_result = file_payload.get("parse_result")
    return bool(isinstance(parse_result, dict) and parse_result.get("deferred_parse"))


def _build_upload_response_message(file_payload: dict) -> str:
    if _is_deferred_parse_payload(file_payload):
        return "文件上传成功，等待远端解析结果"
    status = str(file_payload.get("status") or "").lower()
    if status == UploadStatus.READY.value:
        return "文件上传并解析完成"
    if status == UploadStatus.FAILED.value:
        return "文件已上传，但解析失败"
    if status in {UploadStatus.PARSING.value, UploadStatus.UPLOADING.value}:
        return "文件上传成功，正在解析中"
    return "文件上传成功"


def _build_batch_upload_response_message(files: list[dict], failed: list[dict]) -> str:
    if failed and not files:
        return "批量上传失败"

    if files and all(_is_deferred_parse_payload(item) for item in files):
        return "批量上传完成，等待远端解析结果"

    statuses = {str(item.get("status") or "").lower() for item in files}
    if failed:
        return "批量上传完成，部分文件失败"
    if UploadStatus.FAILED.value in statuses:
        return "批量上传完成，部分文件解析失败"
    if statuses & {UploadStatus.PARSING.value, UploadStatus.UPLOADING.value}:
        return "批量上传完成，文件正在解析中"
    if statuses == {UploadStatus.READY.value}:
        return "批量上传并解析完成"
    return "批量上传完成"


def _build_upload_idempotency_cache_key(
    *,
    user_id: str,
    project_id: str,
    session_id: Optional[str],
    idempotency_key: Optional[str],
    scope: str,
) -> Optional[str]:
    if not idempotency_key:
        return None
    session_token = session_id or "-"
    return f"files:{scope}:{user_id}:{project_id}:{session_token}:{idempotency_key}"


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
    defer_parse: bool = False,
) -> dict:
    upload = await save_and_record_upload(file, project_id)
    task_queue_service = getattr(request.app.state, "task_queue_service", None)
    if defer_parse:
        await db_service.update_upload_status(
            upload.id,
            status=UploadStatus.UPLOADING.value,
            parse_result={
                "deferred_parse": True,
                "parse_mode": "dual_channel",
                "state": "awaiting_remote_result",
            },
            error_message=None,
        )
    else:
        await db_service.update_upload_status(
            upload.id, status=UploadStatus.PARSING.value
        )
        if _SYNC_RAG_INDEXING:
            await index_upload_for_rag(
                upload,
                project_id,
                session_id,
                task_queue_service=task_queue_service,
            )
        else:
            dispatch_rag_indexing(
                request, background_tasks, upload, project_id, session_id
            )
    latest = await db_service.get_file(upload.id)
    return serialize_upload(latest)


async def upload_file_response(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile,
    project_id: str,
    session_id: Optional[str],
    user_id: str,
    idempotency_key: Optional[str] = None,
    defer_parse: bool = False,
):
    await verify_project_access(project_id, user_id)
    cache_key = _build_upload_idempotency_cache_key(
        user_id=user_id,
        project_id=project_id,
        session_id=session_id,
        idempotency_key=idempotency_key,
        scope="single",
    )
    if cache_key:
        cached_response = await db_service.get_idempotency_response(cache_key)
        if cached_response:
            return cached_response

    file_payload = await _prepare_uploaded_file(
        request=request,
        background_tasks=background_tasks,
        file=file,
        project_id=project_id,
        session_id=session_id,
        defer_parse=defer_parse,
    )
    response = success_response(
        data={"file": file_payload},
        message=_build_upload_response_message(file_payload),
    )
    if cache_key:
        await db_service.save_idempotency_response(
            cache_key, jsonable_encoder(response)
        )
    return response


async def batch_upload_files_response(
    request: Request,
    background_tasks: BackgroundTasks,
    files: list[UploadFile],
    project_id: str,
    session_id: Optional[str],
    user_id: str,
    idempotency_key: Optional[str] = None,
    defer_parse: bool = False,
):
    await verify_project_access(project_id, user_id)
    cache_key = _build_upload_idempotency_cache_key(
        user_id=user_id,
        project_id=project_id,
        session_id=session_id,
        idempotency_key=idempotency_key,
        scope="batch",
    )
    if cache_key:
        cached_response = await db_service.get_idempotency_response(cache_key)
        if cached_response:
            return cached_response

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
                    defer_parse=defer_parse,
                )
            )
        except Exception as exc:
            failed.append({"filename": file.filename, "error": str(exc)})

    response = success_response(
        data={
            "files": uploaded_files,
            "total": len(uploaded_files),
            "failed": failed or None,
        },
        message=_build_batch_upload_response_message(uploaded_files, failed),
    )
    if cache_key:
        await db_service.save_idempotency_response(
            cache_key, jsonable_encoder(response)
        )
    return response


async def apply_mineru_parse_result_response(
    *,
    file_id: str,
    user_id: str,
    parsed_text: str,
    parse_details: Optional[dict[str, Any]] = None,
    session_id: Optional[str] = None,
):
    upload = await db_service.get_file(file_id)
    if upload is None:
        raise NotFoundException(message="文件不存在", details={"file_id": file_id})

    await verify_project_access(upload.projectId, user_id)

    text = str(parsed_text or "").strip()
    if not text:
        raise ValidationException(
            message="MinerU 解析结果为空，无法建立索引",
            details={"file_id": file_id},
        )

    await db_service.update_upload_status(
        file_id,
        status=UploadStatus.PARSING.value,
        error_message=None,
    )

    try:
        from services.media.rag_indexing import index_upload_file_for_rag

        result = await index_upload_file_for_rag(
            upload=upload,
            project_id=upload.projectId,
            session_id=session_id,
            chunk_size=500,
            chunk_overlap=50,
            reindex=True,
            db=db_service,
            preparsed_text=text,
            preparsed_details=parse_details or {},
            provider_override="mineru_remote",
        )
        await db_service.update_upload_status(
            file_id,
            status=UploadStatus.READY.value,
            parse_result=result,
            error_message=None,
        )
    except Exception as exc:
        await db_service.update_upload_status(
            file_id,
            status=UploadStatus.FAILED.value,
            parse_result=_build_rag_index_failure_payload(exc),
            error_message=str(exc),
        )
        raise

    latest = await db_service.get_file(file_id)
    return success_response(
        data={"file": serialize_upload(latest)},
        message="MinerU 解析结果已同步并完成索引",
    )
