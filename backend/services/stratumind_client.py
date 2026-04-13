"""HTTP client for the Stratumind retrieval service."""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Any, Optional
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from utils.exceptions import ExternalServiceException


def stratumind_base_url() -> str:
    return os.getenv("STRATUMIND_BASE_URL", "").strip().rstrip("/")


def stratumind_enabled() -> bool:
    return bool(stratumind_base_url())


def _timeout_seconds() -> float:
    raw = os.getenv("STRATUMIND_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return 15.0
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 15.0


@dataclass
class StratumindClientError(Exception):
    message: str
    code: str
    status_code: int
    details: dict[str, Any] | None = None
    retryable: bool | None = None

    def __str__(self) -> str:
        return self.message


async def _request(
    method: str,
    endpoint: str,
    *,
    payload: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base_url = stratumind_base_url()
    if not base_url:
        raise RuntimeError("stratumind_base_url_not_configured")
    url = f"{base_url}{endpoint}"
    if query:
        encoded = urllib_parse.urlencode(
            {key: value for key, value in query.items() if value is not None}
        )
        if encoded:
            url = f"{url}?{encoded}"

    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    def _run() -> tuple[int, str]:
        request = urllib_request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib_request.urlopen(
                request, timeout=_timeout_seconds()
            ) as response:
                return response.getcode(), response.read().decode("utf-8")
        except urllib_error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", errors="replace")
        except urllib_error.URLError as exc:
            raise ExternalServiceException(
                message="Stratumind service unreachable",
                details={"reason": str(exc.reason)},
                retryable=True,
            ) from exc
        except TimeoutError as exc:
            raise ExternalServiceException(
                message="Stratumind request timeout",
                retryable=True,
            ) from exc

    status_code, body = await asyncio.to_thread(_run)
    try:
        payload_obj = json.loads(body) if body else {}
    except json.JSONDecodeError as exc:
        raise ExternalServiceException(
            message="Stratumind returned invalid JSON",
            details={"status_code": status_code, "body": body[:300]},
            retryable=False,
        ) from exc

    if status_code >= 400:
        if not isinstance(payload_obj, dict):
            raise ExternalServiceException(
                message=f"Stratumind request failed: status={status_code}",
                details={"status_code": status_code},
                retryable=status_code >= 500,
            )
        error_payload = payload_obj.get("error") or {}
        raise StratumindClientError(
            message=str(
                error_payload.get("message")
                or f"stratumind_request_failed status={status_code}"
            ),
            code=str(error_payload.get("code") or "UNKNOWN"),
            status_code=status_code,
            details=(
                error_payload.get("details")
                if isinstance(error_payload.get("details"), dict)
                else None
            ),
            retryable=error_payload.get("retryable"),
        )

    if not isinstance(payload_obj, dict):
        raise ExternalServiceException(message="Invalid Stratumind response payload")
    return payload_obj


class StratumindClient:
    async def index_chunks(
        self, *, project_id: str, chunks: list[dict[str, Any]]
    ) -> dict[str, Any]:
        return await _request(
            "POST",
            "/indexes/chunks",
            payload={
                "project_id": project_id,
                "chunks": chunks,
            },
        )

    async def search_text(
        self,
        *,
        project_id: str,
        query: str,
        top_k: int = 5,
        session_id: str | None = None,
        filters: Optional[dict] = None,
        planning: Optional[dict] = None,
        response: Optional[dict] = None,
    ) -> dict[str, Any]:
        return await _request(
            "POST",
            "/search/text",
            payload={
                "project_id": project_id,
                "query": query,
                "top_k": top_k,
                "session_id": session_id,
                "filters": filters or {},
                "planning": planning or {},
                "response": response or {},
            },
        )

    async def get_source_detail(
        self, *, project_id: str, chunk_id: str
    ) -> dict[str, Any]:
        return await _request(
            "GET",
            f"/sources/{chunk_id}",
            query={"project_id": project_id},
        )

    async def delete_project_index(self, *, project_id: str) -> dict[str, Any]:
        return await _request("DELETE", f"/indexes/projects/{project_id}")

    async def delete_upload_index(
        self, *, project_id: str, upload_id: str
    ) -> dict[str, Any]:
        return await _request(
            "DELETE", f"/indexes/projects/{project_id}/uploads/{upload_id}"
        )


stratumind_client = StratumindClient()
