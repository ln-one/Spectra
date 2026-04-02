from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

import httpx


def dualweave_enabled() -> bool:
    return os.getenv("DUALWEAVE_ENABLED", "false").strip().lower() == "true"


def dualweave_base_url() -> Optional[str]:
    value = os.getenv("DUALWEAVE_BASE_URL", "").strip()
    return value.rstrip("/") if value else None


def dualweave_timeout_seconds() -> float:
    raw = os.getenv("DUALWEAVE_TIMEOUT_SECONDS", "600").strip()
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 600.0


class DualweaveClient:
    def __init__(
        self,
        *,
        base_url: str,
        timeout_seconds: float = 600.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def upload_file(
        self,
        *,
        filepath: str,
        filename: str,
        mime_type: Optional[str] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        path = Path(filepath)
        timeout = httpx.Timeout(self.timeout_seconds)
        data = dict(metadata or {})

        with path.open("rb") as stream:
            files = {
                "file": (
                    filename,
                    stream,
                    mime_type or "application/octet-stream",
                )
            }
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{self.base_url}/uploads",
                    files=files,
                    data=data,
                )
                response.raise_for_status()
                return _decode_json_object(response)

    def upload_file_sync(
        self,
        *,
        filepath: str,
        filename: str,
        mime_type: Optional[str] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        path = Path(filepath)
        timeout = httpx.Timeout(self.timeout_seconds)
        data = dict(metadata or {})

        with path.open("rb") as stream:
            files = {
                "file": (
                    filename,
                    stream,
                    mime_type or "application/octet-stream",
                )
            }
            with httpx.Client(timeout=timeout) as client:
                response = client.post(
                    f"{self.base_url}/uploads",
                    files=files,
                    data=data,
                )
                response.raise_for_status()
                return _decode_json_object(response)

    async def get_upload(self, upload_id: str) -> dict[str, Any]:
        timeout = httpx.Timeout(self.timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{self.base_url}/uploads/{upload_id}")
            response.raise_for_status()
            return _decode_json_object(response)

    def get_upload_sync(self, upload_id: str) -> dict[str, Any]:
        timeout = httpx.Timeout(self.timeout_seconds)
        with httpx.Client(timeout=timeout) as client:
            response = client.get(f"{self.base_url}/uploads/{upload_id}")
            response.raise_for_status()
            return _decode_json_object(response)


def _decode_json_object(response: httpx.Response) -> dict[str, Any]:
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Dualweave response must be a JSON object")
    return payload


def build_dualweave_client() -> Optional[DualweaveClient]:
    base_url = dualweave_base_url()
    if not dualweave_enabled() or not base_url:
        return None
    return DualweaveClient(
        base_url=base_url,
        timeout_seconds=dualweave_timeout_seconds(),
    )
