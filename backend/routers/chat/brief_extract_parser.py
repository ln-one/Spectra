from __future__ import annotations

import json
import re
from typing import Any

from services.generation_session_service.teaching_brief import (
    ALLOWED_TEACHING_BRIEF_FIELDS,
)

_EXTRACT_BLOCK_RE = re.compile(
    r"```spectra_brief_extract\s*\n(?P<body>.*?)\n```",
    flags=re.DOTALL | re.IGNORECASE,
)
_SUMMARY_BLOCK_RE = re.compile(
    r"```spectra_brief_summary\s*\n(?P<body>.*?)\n```",
    flags=re.DOTALL | re.IGNORECASE,
)


def _strip_marker_blocks(content: str, pattern: re.Pattern[str]) -> str:
    stripped = pattern.sub("", content or "")
    stripped = re.sub(r"\n{3,}", "\n\n", stripped)
    return stripped.strip()


def parse_structured_brief_extract(content: str) -> dict[str, Any] | None:
    matched = _EXTRACT_BLOCK_RE.search(content or "")
    if not matched:
        return None

    body = str(matched.group("body") or "").strip()
    if not body:
        return None

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None

    raw_fields = parsed.get("fields") if isinstance(parsed.get("fields"), dict) else parsed
    fields = {
        key: value
        for key, value in dict(raw_fields).items()
        if key in ALLOWED_TEACHING_BRIEF_FIELDS
    }
    if not fields:
        return None

    confidence = parsed.get("confidence")
    try:
        confidence_value = float(confidence) if confidence is not None else 0.85
    except (TypeError, ValueError):
        confidence_value = 0.85

    return {
        "fields": fields,
        "confidence": max(0.0, min(confidence_value, 1.0)),
    }


def strip_brief_extract_block(content: str) -> str:
    return _strip_marker_blocks(content, _EXTRACT_BLOCK_RE)


def detect_brief_summary_block(content: str) -> bool:
    matched = _SUMMARY_BLOCK_RE.search(content or "")
    if not matched:
        return False

    body = str(matched.group("body") or "").strip()
    if not body:
        return True
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return True
    if not isinstance(parsed, dict):
        return True
    return bool(parsed.get("request_confirmation", True))


def strip_brief_summary_markers(content: str) -> str:
    return _strip_marker_blocks(content, _SUMMARY_BLOCK_RE)
