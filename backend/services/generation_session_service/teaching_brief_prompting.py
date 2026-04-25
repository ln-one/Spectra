from __future__ import annotations

import re
from typing import Any

from services.generation_session_service.teaching_brief import (
    _normalize_text,
    load_teaching_brief,
)

_CONFIRMATION_PATTERNS = [
    r"这些信息是否准确",
    r"以上(?:信息|需求).{0,12}(?:是否准确|是否正确)",
    r"如果没问题.{0,24}(?:需求单|教学需求).{0,12}(?:已确认|标记为已确认)",
    r"请确认(?:一下)?(?:这些|以上)?(?:信息|需求)",
]


def build_brief_prompt_hint(brief_raw: Any) -> str:
    brief = load_teaching_brief(brief_raw)
    lines: list[str] = []
    if brief.get("topic"):
        lines.append(f"教学主题：{brief['topic']}")
    if brief.get("audience"):
        lines.append(f"目标受众：{brief['audience']}")
    if brief.get("duration_minutes"):
        lines.append(f"目标时长：{brief['duration_minutes']} 分钟")
    elif brief.get("lesson_hours"):
        lines.append(f"课时：{brief['lesson_hours']} 课时")
    if brief.get("target_pages"):
        lines.append(f"目标页数：{brief['target_pages']} 页")
    if brief.get("teaching_objectives"):
        lines.append("教学目标：" + "；".join(brief["teaching_objectives"][:3]))
    if brief.get("knowledge_points"):
        lines.append(
            "知识点：" + "；".join(item["title"] for item in brief["knowledge_points"][:5])
        )
    if brief.get("global_emphasis"):
        lines.append("重点：" + "；".join(brief["global_emphasis"][:3]))
    if brief.get("global_difficulties"):
        lines.append("难点：" + "；".join(brief["global_difficulties"][:3]))
    if brief.get("teaching_strategy"):
        lines.append(f"教学策略：{brief['teaching_strategy']}")
    style_profile = brief.get("style_profile") or {}
    visual_tone = _normalize_text(style_profile.get("visual_tone"))
    if visual_tone:
        lines.append(f"风格偏好：{visual_tone}")
    return "\n".join(lines)


def detect_brief_confirmation_request(content: str) -> bool:
    normalized = _normalize_text(content)
    if not normalized:
        return False
    return any(re.search(pattern, normalized) for pattern in _CONFIRMATION_PATTERNS)
