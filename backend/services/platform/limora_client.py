from __future__ import annotations

import os
from dataclasses import dataclass
from http.cookies import SimpleCookie
from typing import Any, Optional

import httpx

from utils.exceptions import ErrorCode, ExternalServiceException, UnauthorizedException


def limora_enabled() -> bool:
    return os.getenv("LIMORA_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def limora_base_url() -> Optional[str]:
    value = os.getenv("LIMORA_BASE_URL", "").strip()
    return value.rstrip("/") if value else None


def limora_timeout_seconds() -> float:
    raw = os.getenv("LIMORA_TIMEOUT_SECONDS", "15").strip()
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 15.0


@dataclass(frozen=True)
class LimoraIdentity:
    identity_id: str
    email: str
    name: str
    email_verified: bool
    session_id: str
    memberships: list[dict[str, Any]]


@dataclass(frozen=True)
class LimoraResponse:
    status_code: int
    payload: dict[str, Any]
    set_cookie_headers: list[str]


def merge_cookie_headers(
    current_cookie_header: Optional[str],
    set_cookie_headers: list[str],
) -> Optional[str]:
    jar = SimpleCookie()
    if current_cookie_header:
        jar.load(current_cookie_header)

    for header in set_cookie_headers:
        staged = SimpleCookie()
        staged.load(header)
        for key, morsel in staged.items():
            max_age = str(morsel.get("max-age") or "").strip()
            expires = str(morsel.get("expires") or "").strip().lower()
            should_delete = max_age == "0" or "1970" in expires
            if should_delete:
                jar.pop(key, None)
            else:
                jar[key] = morsel.value

    rendered = "; ".join(f"{key}={morsel.value}" for key, morsel in jar.items())
    return rendered or None


def _read_error_message(payload: dict[str, Any], fallback: str) -> str:
    error = payload.get("error")
    if isinstance(error, dict):
        message = str(error.get("message") or "").strip()
        if message:
            return message
    message = str(payload.get("message") or "").strip()
    return message or fallback


class LimoraClient:
    def __init__(self, *, base_url: str, timeout_seconds: float = 15.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def _request(
        self,
        method: str,
        path: str,
        *,
        payload: Optional[dict[str, Any]] = None,
        cookie_header: Optional[str] = None,
        origin: Optional[str] = None,
    ) -> LimoraResponse:
        headers: dict[str, str] = {"Accept": "application/json"}
        if cookie_header:
            headers["Cookie"] = cookie_header
        if origin:
            headers["Origin"] = origin

        timeout = httpx.Timeout(self.timeout_seconds)
        url = f"{self.base_url}{path}"

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(
                    method,
                    url,
                    json=payload,
                    headers=headers,
                )
        except httpx.TimeoutException as exc:
            raise ExternalServiceException(
                message="Limora request timeout",
                error_code=ErrorCode.UPSTREAM_TIMEOUT,
                details={"url": url},
                retryable=True,
            ) from exc
        except httpx.HTTPError as exc:
            raise ExternalServiceException(
                message="Limora service unreachable",
                error_code=ErrorCode.UPSTREAM_UNAVAILABLE,
                details={"url": url, "error": str(exc)},
                retryable=True,
            ) from exc

        try:
            body = response.json() if response.content else {}
        except ValueError as exc:
            raise ExternalServiceException(
                message="Limora returned invalid JSON",
                details={
                    "url": url,
                    "status_code": response.status_code,
                    "body_preview": response.text[:300],
                },
                retryable=False,
            ) from exc

        if not isinstance(body, dict):
            raise ExternalServiceException(
                message="Limora returned non-object payload",
                details={"url": url, "status_code": response.status_code},
                retryable=False,
            )

        return LimoraResponse(
            status_code=response.status_code,
            payload=body,
            set_cookie_headers=response.headers.get_list("set-cookie"),
        )

    async def sign_up_email(
        self,
        *,
        email: str,
        password: str,
        name: str,
        cookie_header: Optional[str] = None,
        origin: Optional[str] = None,
    ) -> LimoraResponse:
        return await self._request(
            "POST",
            "/v1/auth/register",
            payload={"email": email, "password": password, "name": name},
            cookie_header=cookie_header,
            origin=origin,
        )

    async def sign_in_email(
        self,
        *,
        email: str,
        password: str,
        cookie_header: Optional[str] = None,
        origin: Optional[str] = None,
    ) -> LimoraResponse:
        return await self._request(
            "POST",
            "/v1/auth/login",
            payload={"email": email, "password": password},
            cookie_header=cookie_header,
            origin=origin,
        )

    async def revoke_current_session(
        self,
        *,
        cookie_header: Optional[str] = None,
        origin: Optional[str] = None,
    ) -> LimoraResponse:
        return await self._request(
            "DELETE",
            "/v1/sessions/current",
            cookie_header=cookie_header,
            origin=origin,
        )

    async def get_current_session(
        self,
        *,
        cookie_header: Optional[str] = None,
    ) -> LimoraIdentity:
        response = await self._request(
            "GET",
            "/v1/sessions/current",
            cookie_header=cookie_header,
        )
        if response.status_code == 401:
            raise UnauthorizedException(message="未登录或登录已过期")
        if response.status_code >= 400:
            raise ExternalServiceException(
                message=_read_error_message(response.payload, "获取 Limora 会话失败"),
                status_code=502 if response.status_code < 500 else response.status_code,
                details={
                    "status_code": response.status_code,
                    "limora": response.payload,
                },
                retryable=response.status_code >= 500,
            )

        data = response.payload.get("data") or {}
        identity = data.get("identity") or {}
        session = data.get("session") or {}
        memberships = data.get("memberships") or []

        identity_id = str(identity.get("id") or "").strip()
        if not identity_id:
            raise ExternalServiceException(
                message="Limora current session missing identity id",
                details={"limora": response.payload},
                retryable=False,
            )

        return LimoraIdentity(
            identity_id=identity_id,
            email=str(identity.get("email") or "").strip(),
            name=str(identity.get("name") or "").strip(),
            email_verified=bool(identity.get("emailVerified")),
            session_id=str(session.get("id") or "").strip(),
            memberships=memberships if isinstance(memberships, list) else [],
        )


def build_limora_client(*, base_url: str | None = None) -> LimoraClient | None:
    resolved_base_url = (base_url or "").strip() or limora_base_url()
    if not limora_enabled() or not resolved_base_url:
        return None
    return LimoraClient(
        base_url=resolved_base_url,
        timeout_seconds=limora_timeout_seconds(),
    )
