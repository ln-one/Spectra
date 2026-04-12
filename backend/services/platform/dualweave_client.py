from __future__ import annotations

import os
import time
import json
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


def dualweave_poll_interval_seconds() -> float:
    raw = os.getenv("DUALWEAVE_POLL_INTERVAL_SECONDS", "2").strip()
    try:
        return max(0.1, float(raw))
    except ValueError:
        return 2.0


class DualweaveClient:
    def __init__(
        self,
        *,
        base_url: str,
        timeout_seconds: float = 600.0,
        poll_interval_seconds: float = 2.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds

    async def upload_file(
        self,
        *,
        filepath: str,
        filename: str,
        execution: dict[str, Any],
        mime_type: Optional[str] = None,
    ) -> dict[str, Any]:
        path = Path(filepath)
        timeout = httpx.Timeout(self.timeout_seconds)
        data = {"execution": json.dumps(execution, ensure_ascii=False)}

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
        execution: dict[str, Any],
        mime_type: Optional[str] = None,
    ) -> dict[str, Any]:
        path = Path(filepath)
        timeout = httpx.Timeout(self.timeout_seconds)
        data = {"execution": json.dumps(execution, ensure_ascii=False)}

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

    def trigger_replay_sync(self, upload_id: str) -> dict[str, Any]:
        timeout = httpx.Timeout(self.timeout_seconds)
        with httpx.Client(timeout=timeout) as client:
            response = client.post(f"{self.base_url}/uploads/{upload_id}/replay")
            response.raise_for_status()
            return _decode_json_object(response)

    def upload_file_and_wait_sync(
        self,
        *,
        filepath: str,
        filename: str,
        execution: dict[str, Any],
        mime_type: Optional[str] = None,
    ) -> dict[str, Any]:
        result = self.upload_file_sync(
            filepath=filepath,
            filename=filename,
            execution=execution,
            mime_type=mime_type,
        )
        return self.wait_for_result_url_sync(result)

    def wait_for_result_url_sync(self, result: dict[str, Any]) -> dict[str, Any]:
        result_url = _extract_result_url(result)
        if result_url:
            return result

        upload_id = str(result.get("upload_id") or "").strip()
        if not upload_id:
            return result

        deadline = time.monotonic() + self.timeout_seconds
        last_result = result
        replay_requested = False

        while time.monotonic() < deadline:
            if _should_trigger_replay(last_result) and not replay_requested:
                try:
                    last_result = self.trigger_replay_sync(upload_id)
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code != 409:
                        raise
                replay_requested = True
                if _extract_result_url(last_result):
                    return last_result

            if _is_terminal_without_result(last_result):
                return last_result

            time.sleep(self.poll_interval_seconds)
            last_result = self.get_upload_sync(upload_id)
            if _extract_result_url(last_result):
                return last_result

        return last_result


def _decode_json_object(response: httpx.Response) -> dict[str, Any]:
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Dualweave response must be a JSON object")
    return payload


def _extract_result_url(result: dict[str, Any]) -> Optional[str]:
    artifact = result.get("processing_artifact") or {}
    value = artifact.get("result_url")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _should_trigger_replay(result: dict[str, Any]) -> bool:
    status = str(result.get("status") or "").strip()
    if status != "pending_remote":
        return False

    replay_status = str(result.get("replay_status") or "").strip()
    if replay_status in {"in_progress", "succeeded"}:
        return False

    replay_blocked_reason = str(result.get("replay_blocked_reason") or "").strip()
    if replay_blocked_reason:
        return False

    if result.get("replay_eligible") is False:
        return False

    remote_next_action = str(result.get("remote_next_action") or "").strip()
    if remote_next_action and remote_next_action != "retry_remote_later":
        return False

    return True


def _is_terminal_without_result(result: dict[str, Any]) -> bool:
    status = str(result.get("status") or "").strip()
    if status == "completed":
        return False
    if status in {"failed", "degraded"}:
        return True

    replay_status = str(result.get("replay_status") or "").strip()
    if replay_status == "failed":
        return True

    replay_blocked_reason = str(result.get("replay_blocked_reason") or "").strip()
    if replay_blocked_reason in {
        "local_artifact_unavailable",
        "remote_next_action_blocked",
        "replay_failed",
        "not_pending_remote",
        "replay_not_applicable",
    }:
        return True

    return False


def build_dualweave_client(
    *,
    base_url: str | None = None,
) -> Optional[DualweaveClient]:
    base_url = (base_url or "").strip() or dualweave_base_url()
    if not dualweave_enabled() or not base_url:
        return None
    return DualweaveClient(
        base_url=base_url,
        timeout_seconds=dualweave_timeout_seconds(),
        poll_interval_seconds=dualweave_poll_interval_seconds(),
    )
