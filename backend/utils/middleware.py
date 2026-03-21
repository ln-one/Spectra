"""Request lifecycle middleware and logging context helpers."""

import logging
import os
import re
import time
import uuid
from contextvars import ContextVar
from typing import Optional

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("spectra.access")
_SAFE_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_DEFAULT_SLOW_REQUEST_THRESHOLD_MS = 1200.0


def _load_slow_request_threshold_ms() -> float:
    raw = os.getenv("SLOW_REQUEST_THRESHOLD_MS", "").strip()
    if not raw:
        return _DEFAULT_SLOW_REQUEST_THRESHOLD_MS
    try:
        parsed = float(raw)
        return parsed if parsed > 0 else _DEFAULT_SLOW_REQUEST_THRESHOLD_MS
    except ValueError:
        return _DEFAULT_SLOW_REQUEST_THRESHOLD_MS


_request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
_user_id_ctx: ContextVar[Optional[str]] = ContextVar("user_id", default=None)


def get_request_id() -> Optional[str]:
    """Return current request id or None when no request context exists."""
    return _request_id_ctx.get()


def get_context_user_id() -> Optional[str]:
    """Return current user id from context."""
    return _user_id_ctx.get()


def set_context_user_id(user_id: str) -> None:
    """Publish authenticated user id into request context."""
    _user_id_ctx.set(user_id)


class RequestContextFilter(logging.Filter):
    """Inject request-scoped ids into all log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_ctx.get() or "-"  # type: ignore[attr-defined]
        record.user_id = _user_id_ctx.get() or "-"  # type: ignore[attr-defined]
        return True


class RequestIDMiddleware:
    """ASGI middleware that manages request id and access logging."""

    def __init__(self, app: ASGIApp):
        self.app = app
        self.slow_request_threshold_ms = _load_slow_request_threshold_ms()

    @staticmethod
    def _normalize_request_id(raw_request_id: Optional[str]) -> str:
        """Accept only safe request id values; otherwise generate a UUID."""
        if raw_request_id and _SAFE_REQUEST_ID_PATTERN.fullmatch(raw_request_id):
            return raw_request_id
        return str(uuid.uuid4())

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = self._normalize_request_id(headers.get("x-request-id"))
        method = scope.get("method", "-")
        path = scope.get("path", "-")

        req_token = _request_id_ctx.set(request_id)
        user_token = _user_id_ctx.set(None)

        start = time.perf_counter()
        status_code = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                mutable_headers = MutableHeaders(scope=message)
                mutable_headers["X-Request-ID"] = request_id
                process_time_ms = (time.perf_counter() - start) * 1000
                mutable_headers["X-Process-Time"] = f"{process_time_ms:.2f}ms"
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            user_id = _user_id_ctx.get() or "-"
            if duration_ms >= self.slow_request_threshold_ms:
                logger.warning(
                    "slow_request %s %s %s %sms threshold=%sms user=%s",
                    method,
                    path,
                    status_code,
                    duration_ms,
                    self.slow_request_threshold_ms,
                    user_id,
                    extra={
                        "request_id": request_id,
                        "user_id": user_id,
                        "method": method,
                        "path": path,
                        "status_code": status_code,
                        "duration_ms": duration_ms,
                        "slow_request": True,
                        "slow_request_threshold_ms": self.slow_request_threshold_ms,
                    },
                )
            logger.info(
                "%s %s %s %sms user=%s",
                method,
                path,
                status_code,
                duration_ms,
                user_id,
                extra={
                    "request_id": request_id,
                    "user_id": user_id,
                    "method": method,
                    "path": path,
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                },
            )
            _request_id_ctx.reset(req_token)
            _user_id_ctx.reset(user_token)
