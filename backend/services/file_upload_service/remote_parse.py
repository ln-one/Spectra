from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
import zipfile
from typing import Any, Optional

import httpx

from services.platform.dualweave_client import (
    _extract_result_url,
    _is_terminal_without_result,
    _should_trigger_replay,
    build_dualweave_client,
)
from services.platform.dualweave_execution import (
    build_dualweave_execution,
    dualweave_remote_parse_supported,
)
from services.platform.redis_manager import RedisConnectionManager
from services.task_queue import TaskQueueService

from .access import FileType, normalize_file_type
from .constants import UploadStatus
from .dualweave_bridge import build_dualweave_parse_result
from .serialization import safe_parse_json_object

logger = logging.getLogger(__name__)


def remote_parse_reconcile_delay_seconds() -> int:
    raw = os.getenv("DUALWEAVE_RECONCILE_DELAY_SECONDS", "5").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 5


def is_deferred_parse_result(parse_result: Optional[dict[str, Any]]) -> bool:
    return bool(isinstance(parse_result, dict) and parse_result.get("deferred_parse"))


def should_use_dualweave_remote_parse(file_type: str) -> bool:
    normalized = normalize_file_type(file_type)
    if not dualweave_remote_parse_supported(normalized):
        return False
    return (
        build_dualweave_client() is not None
        and build_dualweave_execution(normalized) is not None
    )


def _extract_dualweave_upload_id(parse_result: dict[str, Any]) -> str:
    dualweave = parse_result.get("dualweave") or {}
    value = dualweave.get("upload_id")
    return str(value or "").strip()


def _extract_markdown_from_zip(zip_bytes: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        for name in ("full.md",):
            if name in archive.namelist():
                return archive.read(name).decode("utf-8", errors="replace").strip()

        for name in archive.namelist():
            if name.lower().endswith(".md"):
                return archive.read(name).decode("utf-8", errors="replace").strip()

    return ""


def _download_markdown_from_result_url(result_url: str, timeout_seconds: float) -> str:
    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.get(result_url)
        response.raise_for_status()
        return _extract_markdown_from_zip(response.content)


def _build_execution_trace(execution: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(execution, dict):
        return {}
    compact = {
        "chunk_size": execution.get("chunk_size"),
        "local": {"kind": ((execution.get("local") or {}).get("kind"))},
        "send": {"kind": ((execution.get("send") or {}).get("kind"))},
        "workflow": {"kind": ((execution.get("workflow") or {}).get("kind"))},
        "result": {"kind": ((execution.get("result") or {}).get("kind"))},
        "auth": {"kind": ((execution.get("auth") or {}).get("kind"))},
        "custom": {"kind": ((execution.get("custom") or {}).get("kind"))},
    }
    compact["execution_digest"] = hashlib.sha256(
        json.dumps(execution, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    return compact


def _build_remote_parse_result(
    result: dict[str, Any], file_type: str
) -> dict[str, Any]:
    parse_result = build_dualweave_parse_result(result)
    if normalize_file_type(file_type) == FileType.IMAGE:
        parse_result.setdefault("images_extracted", 1)
    return parse_result


def _extract_remote_parsed_text(result: dict[str, Any], timeout_seconds: float) -> str:
    processing_artifact = result.get("processing_artifact") or {}
    metadata = processing_artifact.get("metadata") or {}
    parsed_text = metadata.get("parsed_text")
    if isinstance(parsed_text, str) and parsed_text.strip():
        return parsed_text.strip()

    provider_job = result.get("provider_job") or {}
    job_metadata = provider_job.get("metadata") or {}
    parsed_text = job_metadata.get("parsed_text")
    if isinstance(parsed_text, str) and parsed_text.strip():
        return parsed_text.strip()

    result_url = _extract_result_url(result)
    if result_url:
        return _download_markdown_from_result_url(result_url, timeout_seconds)

    return ""


async def apply_dualweave_parse_result_internal(
    *,
    db,
    file_id: str,
    parsed_text: str,
    parse_details: Optional[dict[str, Any]] = None,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    from services.media.rag_indexing import index_upload_file_for_rag

    upload = await db.get_file(file_id)
    if upload is None:
        raise ValueError(f"upload_not_found:{file_id}")

    await db.update_upload_status(
        file_id,
        status=UploadStatus.PARSING.value,
        error_message=None,
    )

    result = await index_upload_file_for_rag(
        upload=upload,
        project_id=upload.projectId,
        session_id=session_id,
        chunk_size=500,
        chunk_overlap=50,
        reindex=True,
        db=db,
        preparsed_text=parsed_text,
        preparsed_details=parse_details or {},
    )
    await db.update_upload_status(
        file_id,
        status=UploadStatus.READY.value,
        parse_result=result,
        error_message=None,
    )
    try:
        from services.prompt_suggestion_pool import (
            ALL_PROMPT_SUGGESTION_SURFACES,
            build_project_source_fingerprint,
            enqueue_project_prompt_suggestion_refresh_from_env,
        )

        source_fingerprint, _ = await build_project_source_fingerprint(
            upload.projectId,
            db=db,
        )
        await enqueue_project_prompt_suggestion_refresh_from_env(
            project_id=upload.projectId,
            surfaces=ALL_PROMPT_SUGGESTION_SURFACES,
            source_fingerprint=source_fingerprint,
        )
    except Exception as exc:
        logger.warning(
            "prompt_suggestion_pool_enqueue_failed: project_id=%s error=%s",
            upload.projectId,
            exc,
            exc_info=True,
        )
    return result


async def _mark_remote_parse_failure(
    *,
    db,
    file_id: str,
    parse_result: Optional[dict[str, Any]] = None,
    error_message: str | None = None,
) -> dict[str, Any]:
    failure_result = dict(parse_result or {})
    failure_result["parse_mode"] = "dualweave_remote"
    failure_result["fallback_reason"] = "remote_parse_failed"
    failure_result["remote_parse_terminal"] = True

    await db.update_upload_status(
        file_id,
        status=UploadStatus.FAILED.value,
        parse_result=failure_result,
        error_message=error_message or "远端解析失败",
    )
    return failure_result


async def trigger_fallback_parse_internal(
    *,
    db,
    file_id: str,
    session_id: Optional[str] = None,
    parse_result: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    from services.media.rag_indexing import index_upload_file_for_rag

    upload = await db.get_file(file_id)
    if upload is None:
        raise ValueError(f"upload_not_found:{file_id}")

    if normalize_file_type(upload.fileType) == FileType.IMAGE:
        return await _mark_remote_parse_failure(
            db=db,
            file_id=file_id,
            parse_result=parse_result,
            error_message="远端图片解析失败",
        )

    fallback_result = dict(parse_result or {})
    fallback_result["parse_mode"] = "fallback"
    fallback_result["fallback_reason"] = "remote_parse_failed"

    await db.update_upload_status(
        file_id,
        status=UploadStatus.PARSING.value,
        parse_result=fallback_result,
        error_message=None,
    )

    result = await index_upload_file_for_rag(
        upload=upload,
        project_id=upload.projectId,
        session_id=session_id,
        chunk_size=500,
        chunk_overlap=50,
        reindex=False,
        db=db,
        parse_provider_override="local",
        fallback_triggered=True,
    )
    await db.update_upload_status(
        file_id,
        status=UploadStatus.READY.value,
        parse_result=result,
        error_message=None,
    )
    try:
        from services.prompt_suggestion_pool import (
            ALL_PROMPT_SUGGESTION_SURFACES,
            build_project_source_fingerprint,
            enqueue_project_prompt_suggestion_refresh_from_env,
        )

        source_fingerprint, _ = await build_project_source_fingerprint(
            upload.projectId,
            db=db,
        )
        await enqueue_project_prompt_suggestion_refresh_from_env(
            project_id=upload.projectId,
            surfaces=ALL_PROMPT_SUGGESTION_SURFACES,
            source_fingerprint=source_fingerprint,
        )
    except Exception as exc:
        logger.warning(
            "prompt_suggestion_pool_enqueue_failed: project_id=%s error=%s",
            upload.projectId,
            exc,
            exc_info=True,
        )
    return result


async def start_remote_parse_upload(
    *,
    db,
    upload,
    session_id: Optional[str] = None,
) -> str:
    normalized_file_type = normalize_file_type(upload.fileType)
    client = build_dualweave_client()
    if client is None:
        raise RuntimeError("dualweave_client_unavailable")
    execution = build_dualweave_execution(normalized_file_type.value)
    if execution is None:
        raise RuntimeError(
            f"dualweave_execution_unavailable:{normalized_file_type.value}"
        )

    result = client.upload_file_sync(
        filepath=upload.filepath,
        filename=upload.filename,
        execution=execution,
        mime_type=getattr(upload, "mimeType", None),
    )
    parse_result = _build_remote_parse_result(result, normalized_file_type.value)
    parse_result.setdefault("dualweave", {}).update(_build_execution_trace(execution))

    parsed_text = _extract_remote_parsed_text(result, client.timeout_seconds)
    if parsed_text:
        parse_result["text_length"] = len(parsed_text)
        await apply_dualweave_parse_result_internal(
            db=db,
            file_id=upload.id,
            parsed_text=parsed_text,
            parse_details=parse_result,
            session_id=session_id,
        )
        return "completed"

    if _is_terminal_without_result(result):
        await trigger_fallback_parse_internal(
            db=db,
            file_id=upload.id,
            session_id=session_id,
            parse_result=parse_result,
        )
        return "fallback"

    await db.update_upload_status(
        upload.id,
        status=UploadStatus.UPLOADING.value,
        parse_result=parse_result,
        error_message=None,
    )
    return "pending"


async def reconcile_remote_parse_once(
    *,
    db,
    file_id: str,
    session_id: Optional[str] = None,
) -> str:
    upload = await db.get_file(file_id)
    if upload is None:
        logger.warning("remote_parse_reconcile_missing_upload: file_id=%s", file_id)
        return "missing"

    parse_result = safe_parse_json_object(getattr(upload, "parseResult", None)) or {}
    upload_id = _extract_dualweave_upload_id(parse_result)
    if not upload_id:
        logger.warning(
            "remote_parse_reconcile_missing_upload_id: file_id=%s parse_result=%s",
            file_id,
            parse_result,
        )
        return "missing"

    client = build_dualweave_client()
    if client is None:
        raise RuntimeError("dualweave_client_unavailable")
    execution = build_dualweave_execution(upload.fileType)
    if execution is None:
        raise RuntimeError(f"dualweave_execution_unavailable:{upload.fileType}")

    result = client.get_upload_sync(upload_id)
    if _should_trigger_replay(result):
        try:
            result = client.trigger_replay_sync(upload_id)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 409:
                raise

    updated_parse_result = _build_remote_parse_result(result, upload.fileType)
    updated_parse_result.setdefault("dualweave", {}).update(
        _build_execution_trace(execution)
    )
    parsed_text = _extract_remote_parsed_text(result, client.timeout_seconds)
    if parsed_text:
        updated_parse_result["text_length"] = len(parsed_text)
        await apply_dualweave_parse_result_internal(
            db=db,
            file_id=file_id,
            parsed_text=parsed_text,
            parse_details=updated_parse_result,
            session_id=session_id,
        )
        return "completed"

    if _is_terminal_without_result(result):
        await trigger_fallback_parse_internal(
            db=db,
            file_id=file_id,
            session_id=session_id,
            parse_result=updated_parse_result,
        )
        return "fallback"

    await db.update_upload_status(
        file_id,
        status=UploadStatus.PARSING.value,
        parse_result=updated_parse_result,
        error_message=None,
    )
    return "pending"


async def reconcile_remote_parse_until_terminal(
    *,
    db,
    file_id: str,
    session_id: Optional[str] = None,
) -> str:
    delay_seconds = float(remote_parse_reconcile_delay_seconds())

    while True:
        outcome = await reconcile_remote_parse_once(
            db=db,
            file_id=file_id,
            session_id=session_id,
        )
        if outcome != "pending":
            return outcome
        await asyncio.sleep(delay_seconds)


def enqueue_remote_parse_reconcile(
    *,
    task_queue_service: TaskQueueService,
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
    delay_seconds: Optional[int] = None,
) -> None:
    task_queue_service.enqueue_remote_parse_reconcile_task(
        file_id=file_id,
        project_id=project_id,
        session_id=session_id,
        delay_seconds=delay_seconds or remote_parse_reconcile_delay_seconds(),
    )


async def enqueue_remote_parse_reconcile_from_env(
    *,
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
    delay_seconds: Optional[int] = None,
) -> None:
    manager = RedisConnectionManager.from_env()
    await manager.connect()
    try:
        service = TaskQueueService(manager.get_connection())
        enqueue_remote_parse_reconcile(
            task_queue_service=service,
            file_id=file_id,
            project_id=project_id,
            session_id=session_id,
            delay_seconds=delay_seconds,
        )
    finally:
        await manager.disconnect()
