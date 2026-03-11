"""
Legacy API guard.

Allows disabling legacy endpoints with an environment toggle.
"""

from __future__ import annotations

import os

from fastapi import HTTPException, status


def assert_legacy_enabled() -> None:
    """Raise if legacy APIs are disabled."""
    enabled = os.getenv("LEGACY_API_ENABLED", "true").strip().lower()
    if enabled in {"0", "false", "no", "off"}:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Legacy API has been removed. Please use session-first endpoints.",
        )
