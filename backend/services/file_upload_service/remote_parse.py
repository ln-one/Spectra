from __future__ import annotations

import asyncio
import io
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
from services.platform.redis_manager import RedisConnectionManager
from services.task_queue import TaskQueueService

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


async def apply_mineru_parse_result_internal(
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
        provider_override="mineru_remote",
    )
    await db.update_upload_status(
        file_id,
        status=UploadStatus.READY.value,
        parse_result=result,
        error_message=None,
    )
    return result


async def trigger_fallback_parse_internal(
    *,
    db,
    file_id: str,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    from services.media.rag_indexing import index_upload_file_for_rag

    upload = await db.get_file(file_id)
    if upload is None:
        raise ValueError(f"upload_not_found:{file_id}")

    await db.update_upload_status(
        file_id,
        status=UploadStatus.PARSING.value,
        parse_result={
            "parse_mode": "fallback",
            "fallback_reason": "remote_parse_failed",
        },
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
    return result


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

    result = client.get_upload_sync(upload_id)
    if _should_trigger_replay(result):
        try:
            result = client.trigger_replay_sync(upload_id)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 409:
                raise

    result_url = _extract_result_url(result)
    if result_url:
        details = build_dualweave_parse_result(result, provider="dualweave_mineru")
        details["dualweave_result_url"] = result_url
        text = _download_markdown_from_result_url(result_url, client.timeout_seconds)
        await apply_mineru_parse_result_internal(
            db=db,
            file_id=file_id,
            parsed_text=text,
            parse_details=details,
            session_id=session_id,
        )
        return "completed"

    if _is_terminal_without_result(result):
        await trigger_fallback_parse_internal(
            db=db,
            file_id=file_id,
            session_id=session_id,
        )
        return "fallback"

    await db.update_upload_status(
        file_id,
        status=UploadStatus.UPLOADING.value,
        parse_result=build_dualweave_parse_result(result, provider="dualweave_mineru"),
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
