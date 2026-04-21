from __future__ import annotations

import os
import re
from typing import Any

from services.generation_session_service.teaching_brief import (
    compute_teaching_brief_readiness,
    normalize_teaching_brief,
    parse_session_options,
)

BRIEF_EXTRACTION_TURN_COUNT_KEY = "_brief_extraction_turn_count"

_MISSING_FIELD_LABELS = {
    "topic": "主题",
    "audience": "受众",
    "knowledge_points": "知识点",
    "duration_or_pages": "课时或页数",
}

_GENERATION_INTENT_PATTERNS = [
    r"(生成|开始|启动|创建|做一套|出一套).{0,12}(ppt|课件|幻灯片)",
    r"(ppt|课件|幻灯片).{0,12}(生成|开始|启动|创建)",
]


def _env_positive_int(name: str, default: int) -> int:
    raw = str(os.getenv(name, "") or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def resolve_brief_extraction_interval() -> int:
    return max(1, min(_env_positive_int("BRIEF_EXTRACTION_INTERVAL", 3), 20))


def detect_generation_intent(content: str) -> bool:
    normalized = str(content or "").strip().lower()
    if not normalized:
        return False
    return any(re.search(pattern, normalized, re.IGNORECASE) for pattern in _GENERATION_INTENT_PATTERNS)


def build_generation_intent_payload(
    *,
    content: str,
    brief_raw: Any,
) -> dict[str, Any]:
    brief = normalize_teaching_brief(brief_raw)
    readiness = dict(brief.get("readiness") or compute_teaching_brief_readiness(brief))
    generation_intent = detect_generation_intent(content)
    generation_ready = bool(readiness.get("can_generate")) and str(brief.get("status") or "") == "confirmed"
    blocked_reason = ""
    if generation_intent and not generation_ready:
        missing_fields = list(readiness.get("missing_fields") or [])
        if missing_fields:
            blocked_reason = "教学需求单尚不完整：缺少" + "、".join(
                _MISSING_FIELD_LABELS.get(field, field) for field in missing_fields
            )
        elif str(brief.get("status") or "") != "confirmed":
            blocked_reason = "请先确认教学需求单"
        else:
            blocked_reason = "教学需求单尚未满足生成条件"
    return {
        "generation_intent": generation_intent,
        "generation_ready": generation_ready,
        "generation_blocked_reason": blocked_reason,
    }


def _estimate_missing_fields_after_message(
    *,
    brief_raw: Any,
    content: str,
) -> list[str]:
    brief = normalize_teaching_brief(brief_raw)
    missing_fields = list((brief.get("readiness") or {}).get("missing_fields") or [])
    normalized = str(content or "").strip()
    if not normalized or not missing_fields:
        return missing_fields

    remaining = set(missing_fields)
    if "topic" in remaining and re.search(
        r"(主题|课题|内容)[是为:]?\s*[^，。,\n]{2,40}|(讲|关于)\s*[^，。,\n]{2,40}",
        normalized,
        re.IGNORECASE,
    ):
        remaining.discard("topic")
    if "audience" in remaining and re.search(
        r"(?:面向|给|针对)\s*[^，。,\n]{2,30}",
        normalized,
        re.IGNORECASE,
    ):
        remaining.discard("audience")
    if "knowledge_points" in remaining and re.search(
        r"(知识点|内容包括|包括|涵盖|讲(?:解)?的内容)",
        normalized,
        re.IGNORECASE,
    ):
        remaining.discard("knowledge_points")
    if "duration_or_pages" in remaining and re.search(
        r"(\d{1,3}\s*分钟)|(\d{1,2}\s*课时)|(\d{1,2}\s*(?:页|p\b|pages?))",
        normalized,
        re.IGNORECASE,
    ):
        remaining.discard("duration_or_pages")
    return [field for field in missing_fields if field in remaining]


def plan_brief_extraction(
    *,
    options_raw: Any,
    brief_raw: Any,
    latest_user_message: str,
) -> dict[str, Any]:
    options = parse_session_options(options_raw)
    try:
        previous_turn_count = int(options.get(BRIEF_EXTRACTION_TURN_COUNT_KEY) or 0)
    except (TypeError, ValueError):
        previous_turn_count = 0
    next_turn_count = previous_turn_count + 1

    brief = normalize_teaching_brief(brief_raw)
    current_missing_fields = list((brief.get("readiness") or {}).get("missing_fields") or [])
    estimated_missing_fields = _estimate_missing_fields_after_message(
        brief_raw=brief,
        content=latest_user_message,
    )
    immediate_trigger = (
        len(current_missing_fields) >= 3 and len(estimated_missing_fields) <= 1
    )
    interval_trigger = next_turn_count >= resolve_brief_extraction_interval()
    should_run = immediate_trigger or interval_trigger
    options[BRIEF_EXTRACTION_TURN_COUNT_KEY] = 0 if should_run else next_turn_count

    return {
        "should_run": should_run,
        "immediate_trigger": immediate_trigger,
        "interval_trigger": interval_trigger,
        "pending_turn_count": options[BRIEF_EXTRACTION_TURN_COUNT_KEY],
        "next_options": options,
    }
