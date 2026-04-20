from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

TEACHING_BRIEF_KEY = "teaching_brief"
TEACHING_BRIEF_PROPOSALS_KEY = "teaching_brief_proposals"

_MISSING_TOPIC = "topic"
_MISSING_AUDIENCE = "audience"
_MISSING_KNOWLEDGE_POINTS = "knowledge_points"
_MISSING_TIME_OR_PAGES = "duration_or_pages"


def parse_session_options(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def merge_session_options(
    *,
    existing_raw: Any,
    incoming: Optional[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    existing = parse_session_options(existing_raw)
    next_options = dict(incoming or {})
    for key in (TEACHING_BRIEF_KEY, TEACHING_BRIEF_PROPOSALS_KEY):
        if key not in next_options and key in existing:
            next_options[key] = deepcopy(existing[key])
    return next_options or None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_int(value: Any) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _normalize_list(value: Any) -> list[str]:
    if isinstance(value, str):
        items = re.split(r"[\n,，;；]+", value)
    elif isinstance(value, list):
        items = value
    else:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = _normalize_text(item)
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized


def _normalize_knowledge_points(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        if isinstance(value, str):
            value = _normalize_list(value)
        else:
            return []
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(value, start=1):
        if isinstance(item, dict):
            title = _normalize_text(item.get("title"))
            if not title:
                continue
            normalized.append(
                {
                    "id": _normalize_text(item.get("id")) or f"kp-{index}",
                    "title": title,
                    "sequence": _normalize_int(item.get("sequence")) or index,
                    "importance": (
                        "core"
                        if _normalize_text(item.get("importance")).lower() == "core"
                        else "normal"
                    ),
                    "difficulty": (
                        _normalize_text(item.get("difficulty")).lower()
                        if _normalize_text(item.get("difficulty")).lower()
                        in {"high", "normal", "low"}
                        else "normal"
                    ),
                    "teaching_method": _normalize_text(item.get("teaching_method")),
                    "notes": _normalize_text(item.get("notes")),
                }
            )
            continue
        title = _normalize_text(item)
        if not title:
            continue
        normalized.append(
            {
                "id": f"kp-{index}",
                "title": title,
                "sequence": index,
                "importance": "normal",
                "difficulty": "normal",
                "teaching_method": "",
                "notes": "",
            }
        )
    return normalized


def _normalize_style_profile(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {
            "template_family": _normalize_text(value.get("template_family")),
            "visual_tone": _normalize_text(value.get("visual_tone")),
            "notes": _normalize_text(value.get("notes")),
        }
    if isinstance(value, str):
        return {
            "template_family": "",
            "visual_tone": _normalize_text(value),
            "notes": "",
        }
    return {"template_family": "", "visual_tone": "", "notes": ""}


def compute_teaching_brief_readiness(brief: dict[str, Any]) -> dict[str, Any]:
    missing_fields: list[str] = []
    if not _normalize_text(brief.get("topic")):
        missing_fields.append(_MISSING_TOPIC)
    if not _normalize_text(brief.get("audience")):
        missing_fields.append(_MISSING_AUDIENCE)
    if not brief.get("knowledge_points"):
        missing_fields.append(_MISSING_KNOWLEDGE_POINTS)

    duration_minutes = _normalize_int(brief.get("duration_minutes"))
    lesson_hours = _normalize_int(brief.get("lesson_hours"))
    target_pages = _normalize_int(brief.get("target_pages"))
    if duration_minutes is None and lesson_hours is None and target_pages is None:
        missing_fields.append(_MISSING_TIME_OR_PAGES)

    return {
        "missing_fields": missing_fields,
        "can_generate": len(missing_fields) == 0,
    }


def normalize_teaching_brief(raw: Any) -> dict[str, Any]:
    incoming = raw if isinstance(raw, dict) else {}
    brief = {
        "status": _normalize_text(incoming.get("status")) or "draft",
        "version": _normalize_int(incoming.get("version")) or 1,
        "last_confirmed_at": incoming.get("last_confirmed_at"),
        "topic": _normalize_text(incoming.get("topic")),
        "audience": _normalize_text(incoming.get("audience")),
        "duration_minutes": _normalize_int(incoming.get("duration_minutes")),
        "lesson_hours": _normalize_int(incoming.get("lesson_hours")),
        "target_pages": _normalize_int(incoming.get("target_pages")),
        "teaching_objectives": _normalize_list(incoming.get("teaching_objectives")),
        "knowledge_points": _normalize_knowledge_points(
            incoming.get("knowledge_points")
        ),
        "global_emphasis": _normalize_list(incoming.get("global_emphasis")),
        "global_difficulties": _normalize_list(incoming.get("global_difficulties")),
        "teaching_strategy": _normalize_text(incoming.get("teaching_strategy")),
        "style_profile": _normalize_style_profile(incoming.get("style_profile")),
    }
    brief["readiness"] = compute_teaching_brief_readiness(brief)
    return brief


def load_teaching_brief(options_raw: Any) -> dict[str, Any]:
    options = parse_session_options(options_raw)
    return normalize_teaching_brief(options.get(TEACHING_BRIEF_KEY))


def load_teaching_brief_proposals(options_raw: Any) -> list[dict[str, Any]]:
    options = parse_session_options(options_raw)
    proposals = options.get(TEACHING_BRIEF_PROPOSALS_KEY)
    if not isinstance(proposals, list):
        return []
    normalized: list[dict[str, Any]] = []
    for item in proposals:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "proposal_id": _normalize_text(item.get("proposal_id"))
                or str(uuid4()),
                "source_message_id": _normalize_text(item.get("source_message_id")),
                "proposed_changes": dict(item.get("proposed_changes") or {}),
                "reasoning_summary": _normalize_text(item.get("reasoning_summary")),
                "confidence": float(item.get("confidence") or 0),
                "requires_user_confirmation": bool(
                    item.get("requires_user_confirmation", True)
                ),
                "created_at": item.get("created_at") or now_iso(),
            }
        )
    return normalized


def _apply_patch_list(existing: list[str], incoming: Any) -> list[str]:
    if incoming is None:
        return existing
    next_list = _normalize_list(incoming)
    return next_list if next_list else existing


def patch_teaching_brief(
    brief_raw: Any,
    patch: Optional[dict[str, Any]],
    *,
    next_status: Optional[str] = None,
) -> dict[str, Any]:
    brief = normalize_teaching_brief(brief_raw)
    patch = patch or {}

    if "topic" in patch:
        brief["topic"] = _normalize_text(patch.get("topic"))
    if "audience" in patch:
        brief["audience"] = _normalize_text(patch.get("audience"))
    if "duration_minutes" in patch:
        brief["duration_minutes"] = _normalize_int(patch.get("duration_minutes"))
    if "lesson_hours" in patch:
        brief["lesson_hours"] = _normalize_int(patch.get("lesson_hours"))
    if "target_pages" in patch:
        brief["target_pages"] = _normalize_int(patch.get("target_pages"))
    if "teaching_objectives" in patch:
        brief["teaching_objectives"] = _normalize_list(patch.get("teaching_objectives"))
    if "knowledge_points" in patch:
        brief["knowledge_points"] = _normalize_knowledge_points(
            patch.get("knowledge_points")
        )
    if "global_emphasis" in patch:
        brief["global_emphasis"] = _normalize_list(patch.get("global_emphasis"))
    if "global_difficulties" in patch:
        brief["global_difficulties"] = _normalize_list(
            patch.get("global_difficulties")
        )
    if "teaching_strategy" in patch:
        brief["teaching_strategy"] = _normalize_text(patch.get("teaching_strategy"))
    if "style_profile" in patch:
        brief["style_profile"] = _normalize_style_profile(patch.get("style_profile"))

    brief["version"] = int(brief.get("version") or 1) + 1
    if next_status:
        brief["status"] = next_status
    elif brief.get("status") == "confirmed":
        brief["status"] = "stale"
    else:
        brief["status"] = "review_pending"
    brief["readiness"] = compute_teaching_brief_readiness(brief)
    return brief


def store_teaching_brief(
    options_raw: Any,
    *,
    brief: dict[str, Any],
    proposals: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    options = parse_session_options(options_raw)
    options[TEACHING_BRIEF_KEY] = normalize_teaching_brief(brief)
    if proposals is not None:
        options[TEACHING_BRIEF_PROPOSALS_KEY] = proposals
    return options


def confirm_teaching_brief(brief_raw: Any) -> dict[str, Any]:
    brief = normalize_teaching_brief(brief_raw)
    brief["version"] = int(brief.get("version") or 1) + 1
    brief["status"] = "confirmed"
    brief["last_confirmed_at"] = now_iso()
    brief["readiness"] = compute_teaching_brief_readiness(brief)
    return brief


def apply_proposal_to_brief(
    brief_raw: Any,
    proposal: dict[str, Any],
) -> dict[str, Any]:
    proposed_changes = dict(proposal.get("proposed_changes") or {})
    return patch_teaching_brief(brief_raw, proposed_changes, next_status="review_pending")


def build_brief_prompt_hint(brief_raw: Any) -> str:
    brief = normalize_teaching_brief(brief_raw)
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


def proposal_conflicts_with_confirmed_brief(
    brief_raw: Any,
    proposal: dict[str, Any],
) -> bool:
    brief = normalize_teaching_brief(brief_raw)
    if brief.get("status") != "confirmed":
        return False
    proposed_changes = dict(proposal.get("proposed_changes") or {})
    for key, value in proposed_changes.items():
        current = brief.get(key)
        if key == "knowledge_points":
            proposed_titles = [
                item.get("title")
                for item in _normalize_knowledge_points(value)
                if item.get("title")
            ]
            current_titles = [
                item.get("title")
                for item in brief.get("knowledge_points") or []
                if isinstance(item, dict) and item.get("title")
            ]
            if proposed_titles and current_titles and proposed_titles != current_titles:
                return True
            continue
        normalized_current = current
        if isinstance(current, list):
            normalized_current = _normalize_list(current)
        if isinstance(value, list):
            value = _normalize_list(value)
        if normalized_current not in (None, "", []) and normalized_current != value:
            return True
    return False


def remove_proposal_by_id(
    proposals: list[dict[str, Any]],
    proposal_id: str,
) -> tuple[list[dict[str, Any]], Optional[dict[str, Any]]]:
    normalized_id = _normalize_text(proposal_id)
    kept: list[dict[str, Any]] = []
    removed: Optional[dict[str, Any]] = None
    for proposal in proposals:
        current_id = _normalize_text(proposal.get("proposal_id"))
        if removed is None and current_id == normalized_id:
            removed = proposal
            continue
        kept.append(proposal)
    return kept, removed
