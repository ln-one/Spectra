"""
MinerU official cloud API provider.

Uses the official asynchronous batch-upload flow:
1. POST `/api/v4/file-urls/batch` to obtain upload URLs.
2. PUT the local file bytes to the returned presigned URL.
3. Poll `/api/v4/extract-results/batch/{batch_id}` until the task is done.
4. Download `full_zip_url` and extract `full.md` as the final text.
"""

from __future__ import annotations

import io
import logging
import os
import time
import zipfile
from typing import Any
from urllib.parse import urljoin

import httpx

from .base import BaseParseProvider, ProviderNotAvailableError

logger = logging.getLogger(__name__)


def _get_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _extract_markdown_from_zip(zip_bytes: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        preferred_names = ("full.md",)
        for name in preferred_names:
            if name in archive.namelist():
                return archive.read(name).decode("utf-8", errors="replace").strip()

        for name in archive.namelist():
            if name.lower().endswith(".md"):
                return archive.read(name).decode("utf-8", errors="replace").strip()

    return ""


class MineruCloudProvider(BaseParseProvider):
    name = "mineru_cloud"
    supported_types = {"pdf", "word", "ppt"}

    def __init__(self) -> None:
        self.api_token = os.getenv("MINERU_CLOUD_API_TOKEN", "").strip()
        if not self.api_token:
            raise ProviderNotAvailableError(
                "MINERU_CLOUD_API_TOKEN is not configured."
            )

        self.base_url = (
            os.getenv("MINERU_CLOUD_API_BASE_URL", "https://mineru.net").strip().rstrip("/")
        )
        self.model_version = os.getenv("MINERU_CLOUD_MODEL_VERSION", "vlm").strip() or "vlm"
        self.language = os.getenv("MINERU_CLOUD_LANGUAGE", "ch").strip() or "ch"
        self.enable_formula = _get_bool_env("MINERU_CLOUD_ENABLE_FORMULA", True)
        self.enable_table = _get_bool_env("MINERU_CLOUD_ENABLE_TABLE", True)
        self.is_ocr = _get_bool_env("MINERU_CLOUD_IS_OCR", False)
        self.poll_interval_seconds = float(
            os.getenv("MINERU_CLOUD_POLL_INTERVAL_SECONDS", "3")
        )
        self.timeout_seconds = float(
            os.getenv("MINERU_CLOUD_TIMEOUT_SECONDS", "600")
        )

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_token}"}

    def _request_upload_url(self, client: httpx.Client, filename: str) -> tuple[str, str]:
        response = client.post(
            urljoin(self.base_url + "/", "api/v4/file-urls/batch"),
            headers={**self._headers, "Content-Type": "application/json"},
            json={
                "files": [
                    {
                        "name": filename,
                        "is_ocr": self.is_ocr,
                    }
                ],
                "model_version": self.model_version,
                "language": self.language,
                "enable_formula": self.enable_formula,
                "enable_table": self.enable_table,
            },
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != 0:
            raise RuntimeError(
                f"mineru_cloud_batch_prepare_failed:{payload.get('msg') or payload}"
            )

        data = payload.get("data") or {}
        batch_id = str(data.get("batch_id") or "").strip()
        file_urls = data.get("file_urls") or []
        if not batch_id or not file_urls:
            raise RuntimeError("mineru_cloud_batch_prepare_missing_upload_url")
        return batch_id, str(file_urls[0])

    def _upload_file(self, client: httpx.Client, upload_url: str, filepath: str) -> None:
        with open(filepath, "rb") as stream:
            response = client.put(upload_url, content=stream.read())
        response.raise_for_status()

    def _poll_result(self, client: httpx.Client, batch_id: str) -> dict[str, Any]:
        deadline = time.monotonic() + self.timeout_seconds
        last_payload: dict[str, Any] | None = None

        while time.monotonic() < deadline:
            response = client.get(
                urljoin(self.base_url + "/", f"api/v4/extract-results/batch/{batch_id}"),
                headers=self._headers,
            )
            response.raise_for_status()
            payload = response.json()
            last_payload = payload
            if payload.get("code") != 0:
                raise RuntimeError(
                    f"mineru_cloud_poll_failed:{payload.get('msg') or payload}"
                )

            data = payload.get("data") or {}
            extract_result = data.get("extract_result") or []
            if isinstance(extract_result, dict):
                extract_result = [extract_result]
            if not extract_result:
                time.sleep(self.poll_interval_seconds)
                continue

            result = extract_result[0] or {}
            state = str(result.get("state") or "").strip().lower()
            if state == "done":
                return result
            if state == "failed":
                raise RuntimeError(
                    f"mineru_cloud_failed:{result.get('err_msg') or 'unknown'}"
                )

            time.sleep(self.poll_interval_seconds)

        raise TimeoutError(
            f"mineru_cloud_timeout:{(last_payload or {}).get('trace_id') or batch_id}"
        )

    def _download_markdown(self, client: httpx.Client, full_zip_url: str) -> str:
        response = client.get(full_zip_url, headers=self._headers)
        response.raise_for_status()
        return _extract_markdown_from_zip(response.content)

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        details: dict[str, Any] = {"pages_extracted": 0, "text_length": 0}

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                batch_id, upload_url = self._request_upload_url(client, filename)
                self._upload_file(client, upload_url, filepath)
                result = self._poll_result(client, batch_id)

                full_zip_url = str(result.get("full_zip_url") or "").strip()
                if not full_zip_url:
                    raise RuntimeError("mineru_cloud_missing_full_zip_url")

                text = self._download_markdown(client, full_zip_url)
                progress = result.get("extract_progress") or {}
                total_pages = progress.get("total_pages")
                if isinstance(total_pages, int) and total_pages >= 0:
                    details["pages_extracted"] = total_pages
                details["text_length"] = len(text)
                details["provider_error"] = None
                details["provider_error_type"] = None

                if text:
                    logger.info(
                        "MinerU cloud parsed %s successfully: pages=%d text_length=%d",
                        filename,
                        details["pages_extracted"],
                        details["text_length"],
                    )
                    return text, details

                details["provider_error"] = "empty_output"
                details["provider_error_type"] = "empty_output"
                return "", details
        except Exception as exc:
            raw_error = str(exc).strip()
            details["provider_error"] = (
                raw_error if raw_error else "mineru_cloud_exception_without_message"
            )
            details["provider_error_type"] = "upstream_exception"
            details["provider_raw_error"] = raw_error
            logger.error(
                "MinerU cloud failed for %s: %s",
                filename,
                exc,
                exc_info=True,
            )
            return "", details
