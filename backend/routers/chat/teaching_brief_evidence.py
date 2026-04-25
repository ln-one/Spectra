from __future__ import annotations

import re
from typing import Any

_DURATION_RE = re.compile(r"(?P<value>\d{1,3})\s*分钟")
_LESSON_HOURS_RE = re.compile(r"(?P<value>\d{1,2})\s*个?\s*课时")
_PAGES_RE = re.compile(r"(?P<value>\d{1,3})\s*(?:页|p\b|pages?)", re.IGNORECASE)
_AUDIENCE_RE = re.compile(
    r"(?:面向|针对)\s*(?P<value>[^，。；;\n]{2,40})|给\s*(?P<give_value>[^，。；;\n]{2,40}(?:学生|老师|教师|学员|班|专业))"
)
_OBJECTIVE_RE = re.compile(
    r"(?:只需|只要|目标是|要求|达到)\s*[\"“]?(?P<value>理解原理|掌握原理|了解概念|会推导|会实现|能应用)[\"”]?"
)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _message_text(message: dict[str, Any]) -> str:
    role = _clean_text(message.get("role")).lower()
    content = _clean_text(message.get("content"))
    if role != "user" or not content:
        return ""
    return content


def _last_int_match(pattern: re.Pattern[str], text: str) -> int | None:
    matches = list(pattern.finditer(text))
    if not matches:
        return None
    try:
        return int(matches[-1].group("value"))
    except (TypeError, ValueError):
        return None


def _last_text_match(pattern: re.Pattern[str], text: str) -> str:
    matches = list(pattern.finditer(text))
    if not matches:
        return ""
    matched = matches[-1]
    return _clean_text(matched.groupdict().get("value") or matched.groupdict().get("give_value"))


def build_recent_requirement_evidence(
    *,
    history_payload: list[dict[str, Any]] | None,
    latest_user_message: str,
) -> dict[str, Any]:
    """Extract volatile requirement facts for prompt guidance only.

    This does not write the teaching brief. It prevents the main chat model from
    re-asking a field that the user has just answered while the async brief
    extractor is still catching up.
    """

    recent_texts = [
        text
        for text in (_message_text(message) for message in history_payload or [])
        if text
    ]
    latest_text = _clean_text(latest_user_message)
    if latest_text:
        recent_texts.append(latest_text)
    combined = "\n".join(recent_texts[-10:])
    if not combined:
        return {}

    evidence: dict[str, Any] = {}

    lesson_hours = _last_int_match(_LESSON_HOURS_RE, combined)
    if lesson_hours is not None:
        evidence["lesson_hours"] = lesson_hours
        evidence["duration_or_pages"] = f"{lesson_hours}课时"
    else:
        duration_minutes = _last_int_match(_DURATION_RE, combined)
        if duration_minutes is not None:
            evidence["duration_minutes"] = duration_minutes
            evidence["duration_or_pages"] = f"{duration_minutes}分钟"
        else:
            target_pages = _last_int_match(_PAGES_RE, combined)
            if target_pages is not None:
                evidence["target_pages"] = target_pages
                evidence["duration_or_pages"] = f"{target_pages}页"

    audience = _last_text_match(_AUDIENCE_RE, combined)
    if audience:
        evidence["audience"] = audience

    objective = _last_text_match(_OBJECTIVE_RE, combined)
    if objective:
        evidence["teaching_objectives"] = [objective]

    if re.search(r"(不讲|暂时不讲|不用|不做).{0,8}(代码|编程|实现)", combined):
        evidence["teaching_strategy"] = "不讲代码实现，侧重算法原理讲解"

    return evidence
