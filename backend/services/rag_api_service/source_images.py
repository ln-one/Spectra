from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import mimetypes
import os
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import httpx

from services.database import db_service
from services.runtime_paths import get_upload_dir
from utils.exceptions import (
    ErrorCode,
    ExternalServiceException,
    NotFoundException,
    ValidationException,
)

logger = logging.getLogger(__name__)

_CACHE_SUBDIR = "rag_source_images"
_DOWNLOAD_TIMEOUT_SECONDS = float(
    os.getenv("RAG_SOURCE_IMAGE_DOWNLOAD_TIMEOUT_SECONDS", "30")
)
_CACHE_MAX_AGE_SECONDS = int(
    os.getenv("RAG_SOURCE_IMAGE_CACHE_MAX_AGE_SECONDS", "86400")
)

_LOCKS: dict[str, asyncio.Lock] = {}
_LOCKS_GUARD = asyncio.Lock()


@dataclass
class SourceImagePayload:
    content: bytes
    media_type: str
    etag: str
    cache_control: str


def normalize_image_relative_path(raw_path: str) -> str:
    candidate = str(raw_path or "").strip().replace("\\", "/")
    if candidate.startswith("./"):
        candidate = candidate[2:]
    if not candidate:
        raise ValidationException(message="图片路径不能为空")
    if candidate.startswith("/") or candidate.startswith("../"):
        raise ValidationException(message="图片路径非法", details={"path": raw_path})
    if "/../" in f"/{candidate}" or ".." in candidate.split("/"):
        raise ValidationException(message="图片路径非法", details={"path": raw_path})
    if not candidate.startswith("images/"):
        raise ValidationException(
            message="仅支持 images/ 相对路径",
            details={"path": raw_path},
        )
    return candidate


def _get_cache_root() -> Path:
    root = get_upload_dir() / _CACHE_SUBDIR
    root.mkdir(parents=True, exist_ok=True)
    return root


def _build_cache_path(upload_id: str, result_url: str, relative_path: str) -> Path:
    url_hash = hashlib.sha256(result_url.encode("utf-8")).hexdigest()[:16]
    return _get_cache_root() / upload_id / url_hash / relative_path


def _safe_parse_result(upload: Any) -> Optional[dict]:
    value = getattr(upload, "parseResult", None)
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
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _extract_image_entry(zip_bytes: bytes, relative_path: str) -> bytes:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        names = set(archive.namelist())
        if relative_path not in names:
            raise NotFoundException(
                message="来源图片不存在",
                details={"path": relative_path},
            )
        return archive.read(relative_path)


async def _download_zip_bytes(result_url: str) -> bytes:
    timeout = httpx.Timeout(_DOWNLOAD_TIMEOUT_SECONDS)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(result_url)
            response.raise_for_status()
            return response.content
    except httpx.TimeoutException as exc:
        raise ExternalServiceException(
            message="来源图片下载超时",
            status_code=504,
            error_code=ErrorCode.UPSTREAM_TIMEOUT,
            details={"result_url": result_url},
            retryable=True,
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise ExternalServiceException(
            message="来源图片下载失败",
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            details={"status_code": exc.response.status_code, "result_url": result_url},
            retryable=True,
        ) from exc
    except httpx.HTTPError as exc:
        raise ExternalServiceException(
            message="来源图片下载失败",
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            details={"result_url": result_url, "error_type": type(exc).__name__},
            retryable=True,
        ) from exc


async def _get_lock(lock_key: str) -> asyncio.Lock:
    async with _LOCKS_GUARD:
        lock = _LOCKS.get(lock_key)
        if lock is None:
            lock = asyncio.Lock()
            _LOCKS[lock_key] = lock
        return lock


async def _ensure_cached_image(
    *,
    upload_id: str,
    result_url: str,
    relative_path: str,
    cache_path: Path,
) -> None:
    if cache_path.exists():
        return

    lock_key = f"{upload_id}:{relative_path}"
    lock = await _get_lock(lock_key)
    async with lock:
        if cache_path.exists():
            return
        zip_bytes = await _download_zip_bytes(result_url)
        image_bytes = _extract_image_entry(zip_bytes, relative_path)

        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "wb", delete=False, dir=str(cache_path.parent)
        ) as temp_file:
            temp_file.write(image_bytes)
            temp_name = temp_file.name
        Path(temp_name).replace(cache_path)


async def _load_chunk_upload(chunk_id: str, parsed=None):
    if parsed is None:
        parsed = await db_service.db.parsedchunk.find_unique(
            where={"id": chunk_id},
            include={"upload": True},
        )
    if not parsed or not parsed.upload:
        raise NotFoundException(message=f"分块不存在: {chunk_id}")
    return parsed.upload


async def load_source_image_payload(
    *,
    chunk_id: str,
    image_path: str,
    parsed=None,
) -> SourceImagePayload:
    relative_path = normalize_image_relative_path(image_path)
    upload = await _load_chunk_upload(chunk_id, parsed=parsed)
    parse_result = _safe_parse_result(upload)
    result_url = str((parse_result or {}).get("dualweave_result_url") or "").strip()
    if not result_url:
        raise NotFoundException(
            message="当前来源无可用图片",
            details={"chunk_id": chunk_id},
        )

    upload_id = str(getattr(upload, "id", "") or "").strip()
    if not upload_id:
        raise NotFoundException(
            message="来源文件不存在", details={"chunk_id": chunk_id}
        )

    cache_path = _build_cache_path(upload_id, result_url, relative_path)
    await _ensure_cached_image(
        upload_id=upload_id,
        result_url=result_url,
        relative_path=relative_path,
        cache_path=cache_path,
    )

    content = cache_path.read_bytes()
    etag = f'"{hashlib.sha256(content).hexdigest()}"'
    media_type = mimetypes.guess_type(relative_path)[0] or "application/octet-stream"
    cache_control = f"private, max-age={max(_CACHE_MAX_AGE_SECONDS, 0)}"
    return SourceImagePayload(
        content=content,
        media_type=media_type,
        etag=etag,
        cache_control=cache_control,
    )
