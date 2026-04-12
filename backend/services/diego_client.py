"""HTTP client for the Diego PPT generation service."""

from __future__ import annotations

import os
from typing import Any

import httpx

from utils.exceptions import ExternalServiceException


def diego_base_url() -> str:
    return os.getenv("DIEGO_BASE_URL", "").strip().rstrip("/")


def diego_enabled() -> bool:
    flag = os.getenv("DIEGO_ENABLED", "false").strip().lower()
    return flag in {"1", "true", "yes", "on"} and bool(diego_base_url())


def diego_timeout_seconds() -> float:
    raw = os.getenv("DIEGO_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return 60.0
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 60.0


def _build_error_message(payload: Any, *, status_code: int) -> str:
    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()
        if isinstance(detail, dict):
            msg = str(detail.get("message") or "").strip()
            if msg:
                return msg
        message = str(payload.get("message") or "").strip()
        if message:
            return message
    return f"Diego request failed: status={status_code}"


class DiegoClient:
    def __init__(self, *, base_url: str, timeout_seconds: float = 60.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        timeout = httpx.Timeout(self.timeout_seconds)
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(method, url, json=payload)
        except httpx.TimeoutException as exc:
            raise ExternalServiceException(
                message="Diego request timeout",
                details={"url": url},
                retryable=True,
            ) from exc
        except httpx.HTTPError as exc:
            raise ExternalServiceException(
                message="Diego service unreachable",
                details={"url": url, "error": str(exc)},
                retryable=True,
            ) from exc

        try:
            body = response.json() if response.content else {}
        except ValueError as exc:
            raise ExternalServiceException(
                message="Diego returned invalid JSON",
                details={
                    "url": url,
                    "status_code": response.status_code,
                    "body_preview": response.text[:300],
                },
                retryable=False,
            ) from exc

        if response.status_code >= 400:
            raise ExternalServiceException(
                message=_build_error_message(body, status_code=response.status_code),
                status_code=(
                    response.status_code
                    if response.status_code >= 500
                    else 502
                ),
                details={
                    "url": url,
                    "status_code": response.status_code,
                    "body": body if isinstance(body, dict) else {},
                },
                retryable=response.status_code >= 500,
            )

        if not isinstance(body, dict):
            raise ExternalServiceException(
                message="Diego returned non-object payload",
                details={"url": url, "status_code": response.status_code},
                retryable=False,
            )
        return body

    async def _request_bytes(self, method: str, path: str) -> bytes:
        timeout = httpx.Timeout(self.timeout_seconds)
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(method, url)
        except httpx.TimeoutException as exc:
            raise ExternalServiceException(
                message="Diego artifact download timeout",
                details={"url": url},
                retryable=True,
            ) from exc
        except httpx.HTTPError as exc:
            raise ExternalServiceException(
                message="Diego artifact download failed",
                details={"url": url, "error": str(exc)},
                retryable=True,
            ) from exc

        if response.status_code >= 400:
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = response.text[:300]
            raise ExternalServiceException(
                message=(
                    _build_error_message(error_payload, status_code=response.status_code)
                    if isinstance(error_payload, dict)
                    else f"Diego artifact download failed: status={response.status_code}"
                ),
                status_code=(
                    response.status_code
                    if response.status_code >= 500
                    else 502
                ),
                details={
                    "url": url,
                    "status_code": response.status_code,
                },
                retryable=response.status_code >= 500,
            )
        return bytes(response.content)

    async def create_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json("POST", "/v1/ppt/runs", payload=payload)

    async def get_run(self, run_id: str) -> dict[str, Any]:
        return await self._request_json("GET", f"/v1/ppt/runs/{run_id}")

    async def confirm_outline(
        self,
        run_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/v1/ppt/runs/{run_id}/outline/confirm",
            payload=payload,
        )

    async def download_pptx(self, run_id: str) -> bytes:
        return await self._request_bytes(
            "GET",
            f"/v1/ppt/runs/{run_id}/artifacts/pptx",
        )


def build_diego_client(
    *,
    base_url: str | None = None,
) -> DiegoClient | None:
    resolved_base_url = (base_url or "").strip() or diego_base_url()
    if not diego_enabled() or not resolved_base_url:
        return None
    return DiegoClient(
        base_url=resolved_base_url,
        timeout_seconds=diego_timeout_seconds(),
    )

