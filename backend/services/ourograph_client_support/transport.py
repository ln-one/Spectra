"""Transport and normalization helpers for the remote Ourograph client."""

from __future__ import annotations

import asyncio
import json
import os
import re
from types import SimpleNamespace
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from services.runtime_env import normalize_internal_service_base_url, running_inside_container
from utils.exceptions import (
    ConflictException,
    ExternalServiceException,
    ForbiddenException,
    InternalServerException,
    NotFoundException,
    ValidationException,
)


def ourograph_base_url() -> str:
    return (
        normalize_internal_service_base_url(
            os.getenv("OUROGRAPH_BASE_URL"),
            service_name="ourograph",
            inside_container=running_inside_container(),
            local_override=os.getenv("OUROGRAPH_BASE_URL_LOCAL"),
        )
        or ""
    )


def ourograph_enabled() -> bool:
    return bool(ourograph_base_url())


def _timeout_seconds() -> float:
    raw = os.getenv("OUROGRAPH_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return 30.0
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 30.0


_SNAKE_CASE_PATTERN = re.compile(r"_([a-zA-Z0-9])")


def _snake_to_camel(value: str) -> str:
    return _SNAKE_CASE_PATTERN.sub(lambda match: match.group(1).upper(), value)


def _normalize_remote_payload(value: Any) -> Any:
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            normalized[key] = _normalize_remote_payload(item)
        for key, item in list(normalized.items()):
            if "_" not in key:
                continue
            alias = _snake_to_camel(key)
            if alias and alias not in normalized:
                normalized[alias] = item
        return normalized
    if isinstance(value, list):
        return [_normalize_remote_payload(item) for item in value]
    return value


def namespace(value: Any) -> Any:
    if isinstance(value, dict):
        normalized = _normalize_remote_payload(value)
        return SimpleNamespace(
            **{key: namespace(item) for key, item in normalized.items()}
        )
    if isinstance(value, list):
        return [namespace(item) for item in value]
    return value


def _raise_service_error(
    status_code: int,
    payload: dict[str, Any] | None,
    *,
    base_url: str,
):
    message = (
        (payload or {}).get("message")
        or (payload or {}).get("detail", {}).get("message")
        or f"ourograph_request_failed status={status_code}"
    )
    error_code = (payload or {}).get("error_code")
    if status_code == 400:
        raise ValidationException(message=message)
    if status_code == 403:
        raise ForbiddenException(message=message)
    if status_code == 404:
        raise NotFoundException(message=message)
    if status_code == 409:
        raise ConflictException(message=message)
    raise InternalServerException(
        message=message,
        details={
            "error_code": error_code,
            "status_code": status_code,
            "base_url": base_url,
        },
    )


async def request_json(
    method: str,
    endpoint: str,
    *,
    payload: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base_url = ourograph_base_url()
    if not base_url:
        raise RuntimeError("ourograph_base_url_not_configured")
    url = f"{base_url}{endpoint}"
    if query:
        encoded = urllib_parse.urlencode(
            {key: value for key, value in query.items() if value is not None}
        )
        if encoded:
            url = f"{url}?{encoded}"
    data = None
    headers: dict[str, str] = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    def _run() -> tuple[int, str]:
        request = urllib_request.Request(
            url,
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib_request.urlopen(
                request, timeout=_timeout_seconds()
            ) as response:
                return response.getcode(), response.read().decode("utf-8")
        except urllib_error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", errors="replace")
        except urllib_error.URLError as exc:
            raise ExternalServiceException(
                message="Ourograph service unreachable",
                details={"reason": str(exc.reason), "base_url": base_url},
                retryable=True,
            ) from exc
        except TimeoutError as exc:
            raise ExternalServiceException(
                message="Ourograph request timeout",
                details={"base_url": base_url},
                retryable=True,
            ) from exc

    status_code, body = await asyncio.to_thread(_run)
    try:
        payload_obj = json.loads(body) if body else {}
    except json.JSONDecodeError as exc:
        raise InternalServerException(
            message="Ourograph returned invalid JSON",
            details={"status_code": status_code, "body": body[:300], "base_url": base_url},
        ) from exc
    if status_code >= 400:
        _raise_service_error(
            status_code,
            payload_obj if isinstance(payload_obj, dict) else None,
            base_url=base_url,
        )
    if not isinstance(payload_obj, dict):
        raise InternalServerException(message="Invalid Ourograph response payload")
    return _normalize_remote_payload(payload_obj)
