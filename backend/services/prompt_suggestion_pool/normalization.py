from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from schemas.rag import PromptSuggestionStatus, PromptSuggestionSurface


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    return None


def extract_json_object(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty model response")
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("model response is not a JSON object")
    return parsed


def normalize_text(value: Any, max_chars: int) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*\[来源[^\]]*\]\s*$", "", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rstrip()
    return text


def looks_like_ppt_prompt(text: str) -> bool:
    if not re.search(r"(PPT|课件|幻灯片)", text, flags=re.IGNORECASE):
        return False
    if not re.search(r"(\d+\s*页|页数|内容量|简洁|均衡|详细|完整)", text):
        return False
    return bool(
        re.search(
            r"(视觉|风格|配色|图解|插画|学术|简约|现代|信息图|清爽|手绘|科技|留白)",
            text,
        )
    )


def normalize_suggestions(
    payload: dict[str, Any],
    *,
    surface: PromptSuggestionSurface,
    max_suggestion_chars: int,
    limit: int,
) -> tuple[list[str], str | None]:
    raw_suggestions = payload.get("suggestions")
    if not isinstance(raw_suggestions, list):
        raw_suggestions = []

    suggestions: list[str] = []
    seen: set[str] = set()
    for item in raw_suggestions:
        text = normalize_text(item, max_suggestion_chars)
        if not text or text in seen:
            continue
        if surface == PromptSuggestionSurface.PPT_GENERATION_CONFIG:
            if not looks_like_ppt_prompt(text):
                continue
        seen.add(text)
        suggestions.append(text)
        if len(suggestions) >= limit:
            break

    summary = normalize_text(payload.get("summary"), 80)
    return suggestions, summary or None


def decode_suggestions(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if str(item).strip()]


def cache_status(record: Any) -> PromptSuggestionStatus:
    raw = str(getattr(record, "status", "") or "")
    try:
        return PromptSuggestionStatus(raw)
    except ValueError:
        return PromptSuggestionStatus.FAILED


def paginate_suggestions(
    suggestions: list[str],
    *,
    cursor: int,
    limit: int,
) -> tuple[list[str], int | None]:
    pool_size = len(suggestions)
    if pool_size == 0:
        return [], None
    start = cursor % pool_size
    end = start + limit
    if end <= pool_size:
        batch = suggestions[start:end]
    else:
        batch = suggestions[start:] + suggestions[: end - pool_size]
    next_cursor = (start + limit) % pool_size if pool_size > limit else None
    return batch, next_cursor
