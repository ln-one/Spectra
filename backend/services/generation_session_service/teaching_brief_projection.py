from __future__ import annotations

from typing import Any

from services.generation_session_service.teaching_brief import (
    TEACHING_BRIEF_KEY,
    normalize_teaching_brief,
    parse_session_options,
)
from services.generation_session_service.teaching_brief_prompting import (
    build_brief_prompt_hint,
)


def extract_brief_fields_from_options(options_raw: Any) -> dict[str, Any]:
    options = parse_session_options(options_raw)
    brief = normalize_teaching_brief(options.get(TEACHING_BRIEF_KEY))
    result: dict[str, Any] = {}
    if brief.get("topic"):
        result["topic"] = brief["topic"]
    if brief.get("audience"):
        result["audience"] = brief["audience"]
    if brief.get("target_pages"):
        result["target_pages"] = brief["target_pages"]
    if brief.get("duration_minutes"):
        result["target_duration_minutes"] = brief["duration_minutes"]
    elif brief.get("lesson_hours"):
        result["lesson_hours"] = brief["lesson_hours"]
    if brief.get("teaching_strategy"):
        result["teaching_strategy"] = brief["teaching_strategy"]
    return result
