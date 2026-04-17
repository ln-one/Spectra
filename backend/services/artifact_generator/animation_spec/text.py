"""Text normalization and title helpers for animation specs."""

from __future__ import annotations

import re
from typing import Any

from .constants import (
    _DEFAULT_SCENE_TRANSITION_ORDER,
    _GENERIC_ANIMATION_TITLE_EXACT,
    _GENERIC_ANIMATION_TITLE_PATTERNS,
    _REQUEST_PATTERN,
    _REQUEST_PREFIXES,
    _SCENE_TRANSITION_ALIASES,
    _SCENE_TRANSITIONS,
)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _sanitize_display_copy(value: Any) -> str:
    content = _clean_text(value)
    if not content:
        return ""
    if _REQUEST_PATTERN.search(content):
        return ""
    normalized = content
    for prefix in _REQUEST_PREFIXES:
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix) :].lstrip("：:，,。 ")
            break
    normalized = normalized.strip("：:，,。 ")
    if not normalized:
        return ""
    if _REQUEST_PATTERN.search(normalized):
        return ""
    return normalized


def _extract_animation_title_keywords(*values: Any) -> str:
    for raw_value in values:
        candidate = _sanitize_display_copy(raw_value)
        if not candidate:
            continue
        candidate = re.split(r"[，,。；;：:\n]+", candidate, maxsplit=1)[0].strip()
        candidate = candidate.strip("《》“”\"'[]()（）- ")
        for pattern in _GENERIC_ANIMATION_TITLE_PATTERNS:
            candidate = re.sub(pattern, "", candidate, flags=re.IGNORECASE).strip()
        candidate = candidate.strip("《》“”\"'[]()（）- ")
        if not candidate:
            continue
        lowered = candidate.lower()
        if lowered in _GENERIC_ANIMATION_TITLE_EXACT:
            continue
        return _clip_text(candidate, maximum=24)
    return ""


def derive_animation_title(content: dict[str, Any] | None) -> str:
    payload = dict(content or {})
    return _extract_animation_title_keywords(
        payload.get("topic"),
        payload.get("motion_brief"),
        payload.get("title"),
        payload.get("focus"),
        payload.get("summary"),
        payload.get("scene"),
    )


def _clamp_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(parsed, maximum))


def _split_sentences(text: str) -> list[str]:
    raw = [
        segment.strip() for segment in re.split(r"[。！？!?；;\n]+", text) if segment
    ]
    return [segment[:90] for segment in raw if segment]


def _split_key_points(text: str) -> list[str]:
    sentences = _split_sentences(text)
    if sentences:
        return sentences[:3]
    parts = [
        segment.strip()
        for segment in re.split(r"[,，/、]+", text)
        if segment and segment.strip()
    ]
    return [segment[:40] for segment in parts[:3]]


def _clip_text(text: str, *, maximum: int) -> str:
    content = _clean_text(text)
    if len(content) <= maximum:
        return content
    return content[: maximum - 1].rstrip() + "…"


def _normalize_transition(value: Any, *, index: int) -> str:
    candidate = _clean_text(value).lower()
    candidate = _SCENE_TRANSITION_ALIASES.get(candidate, candidate)
    if candidate in _SCENE_TRANSITIONS:
        return candidate
    return _DEFAULT_SCENE_TRANSITION_ORDER[
        (index - 1) % len(_DEFAULT_SCENE_TRANSITION_ORDER)
    ]


def _resolve_scene_budget(
    *,
    duration_seconds: int,
    visual_type: str,
    complexity: int,
) -> int:
    if duration_seconds <= 6:
        return 3
    if duration_seconds <= 10:
        if visual_type == "structure_breakdown":
            return 4 if complexity >= 5 else 3
        return 4 if complexity >= 4 else 3
    if visual_type == "structure_breakdown":
        return 5 if complexity >= 5 else 4
    return 5 if complexity >= 4 else 4


def _parse_scene_count_token(token: str) -> int | None:
    raw = _clean_text(token)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        pass
    chinese_map = {
        "一": 1,
        "二": 2,
        "两": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
        "十": 10,
    }
    if raw == "十":
        return 10
    if raw.startswith("十"):
        tail = chinese_map.get(raw[1:], 0)
        return 10 + tail
    if "十" in raw:
        left, _, right = raw.partition("十")
        left_num = chinese_map.get(left, 1)
        right_num = chinese_map.get(right, 0)
        return left_num * 10 + right_num
    return chinese_map.get(raw)


def _extract_scene_count_constraint(*texts: str) -> int | None:
    combined = " ".join(_clean_text(item) for item in texts if _clean_text(item))
    if not combined:
        return None
    patterns = (
        r"(?:至少|最少|不少于|不低于)\s*([0-9一二三四五六七八九十两]{1,3})\s*段",
        r"(?:分成|拆成|做成|共|一共)\s*([0-9一二三四五六七八九十两]{1,3})\s*段",
        r"([0-9一二三四五六七八九十两]{1,3})\s*段(?:动画|镜头|流程|展示)",
    )
    for pattern in patterns:
        matched = re.search(pattern, combined)
        if not matched:
            continue
        parsed = _parse_scene_count_token(matched.group(1))
        if parsed is not None:
            return _clamp_int(parsed, default=3, minimum=1, maximum=12)
    return None
