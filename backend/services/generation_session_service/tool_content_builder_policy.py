from __future__ import annotations

import os

FALLBACK_MODE_ENV = "STUDIO_TOOL_FALLBACK_MODE"
FALLBACK_MODE_STRICT = "strict"
FALLBACK_MODE_ALLOW = "allow"


def resolve_fallback_mode() -> str:
    raw = str(os.getenv(FALLBACK_MODE_ENV, FALLBACK_MODE_STRICT)).strip().lower()
    if raw in {FALLBACK_MODE_STRICT, FALLBACK_MODE_ALLOW}:
        return raw
    return FALLBACK_MODE_STRICT


def allow_fallback() -> bool:
    return resolve_fallback_mode() == FALLBACK_MODE_ALLOW


def should_attempt_ai_generation() -> bool:
    raw = os.getenv("STUDIO_TOOL_ENABLE_AI_GENERATION")
    if raw is None:
        return True
    return raw.strip().lower() not in {"0", "false", "no"}
