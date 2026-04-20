from __future__ import annotations

import re
from typing import Any, Optional
from uuid import uuid4

from services.generation_session_service.teaching_brief import (
    _normalize_list,
    _normalize_text,
    load_teaching_brief,
    now_iso,
)


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


def _extract_match(pattern: str, content: str) -> str:
    matched = re.search(pattern, content, re.IGNORECASE)
    if not matched:
        return ""
    return _normalize_text(matched.group(1))


def infer_teaching_brief_proposal(
    *,
    content: str,
    source_message_id: str,
) -> Optional[dict[str, Any]]:
    normalized = _normalize_text(content)
    if not normalized:
        return None

    proposed_changes: dict[str, Any] = {}
    page_match = re.search(r"(\d{1,2})\s*(?:页|p\b|pages?)", normalized, re.IGNORECASE)
    if page_match:
        proposed_changes["target_pages"] = int(page_match.group(1))

    duration_match = re.search(r"(\d{1,3})\s*分钟", normalized)
    if duration_match:
        proposed_changes["duration_minutes"] = int(duration_match.group(1))

    lesson_match = re.search(r"(\d{1,2})\s*课时", normalized)
    if lesson_match:
        proposed_changes["lesson_hours"] = int(lesson_match.group(1))

    audience = _extract_match(r"(?:面向|给|针对)\s*([^，。,\n]{2,30})", normalized)
    if audience:
        proposed_changes["audience"] = audience

    topic = _extract_match(r"(?:主题|课题|内容)[是为:]?\s*([^，。,\n]{2,40})", normalized)
    if topic:
        proposed_changes["topic"] = topic

    strategy = _extract_match(r"(?:教学策略|授课方式)[是为:]?\s*([^。,\n]{2,60})", normalized)
    if strategy:
        proposed_changes["teaching_strategy"] = strategy

    emphasis = _extract_match(r"(?:重点|突出)\s*[是为:]?\s*([^。,\n]{2,80})", normalized)
    if emphasis:
        proposed_changes["global_emphasis"] = _normalize_list(emphasis)

    difficulties = _extract_match(r"(?:难点|困难点)\s*[是为:]?\s*([^。,\n]{2,80})", normalized)
    if difficulties:
        proposed_changes["global_difficulties"] = _normalize_list(difficulties)

    knowledge_match = _extract_match(
        r"(?:知识点|内容包括|包括|涵盖)\s*[：: ]?\s*([^。]{4,120})", normalized
    )
    if knowledge_match:
        proposed_changes["knowledge_points"] = _normalize_list(knowledge_match)

    objective_match = _extract_match(r"(?:教学目标|目标)\s*[：: ]?\s*([^。]{4,120})", normalized)
    if objective_match:
        proposed_changes["teaching_objectives"] = _normalize_list(objective_match)

    style_match = _extract_match(r"(?:风格|版式|视觉风格)\s*[：: ]?\s*([^。,\n]{2,40})", normalized)
    if style_match:
        proposed_changes["style_profile"] = {"visual_tone": style_match}

    if not proposed_changes:
        return None

    return {
        "proposal_id": str(uuid4()),
        "source_message_id": source_message_id,
        "proposed_changes": proposed_changes,
        "reasoning_summary": "根据最新对话提取到新的教学需求候选字段。",
        "confidence": 0.62,
        "requires_user_confirmation": True,
        "created_at": now_iso(),
    }
