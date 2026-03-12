"""
Deprecated API helpers.

Adds consistent response headers and structured logging for deprecated endpoints.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import Request, Response

_DEFAULT_SUNSET = os.getenv("DEPRECATED_API_SUNSET", "2026-06-30")


def apply_deprecation_headers(
    response: Response,
    replacement: Optional[str] = None,
    sunset: Optional[str] = None,
) -> None:
    """Attach standard deprecation headers to a response."""
    sunset_value = sunset or _DEFAULT_SUNSET
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = sunset_value
    response.headers["X-API-Deprecated"] = "true"
    if replacement:
        response.headers["X-API-Replacement"] = replacement
    response.headers["Warning"] = (
        f'299 - "Deprecated API. '
        f'Use {replacement or "session-first endpoints"} before {sunset_value}."'
    )


def log_deprecated_call(
    logger,
    request: Request,
    user_id: Optional[str],
    replacement: Optional[str] = None,
) -> None:
    """Emit a structured log entry for deprecated endpoint usage."""
    logger.warning(
        "deprecated_endpoint_used",
        extra={
            "path": request.url.path,
            "method": request.method,
            "user_id": user_id,
            "replacement": replacement,
        },
    )
