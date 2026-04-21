from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional, TypedDict
from uuid import uuid4

TEACHING_BRIEF_KEY = "teaching_brief"
TEACHING_BRIEF_PROPOSALS_KEY = "teaching_brief_proposals"
ALLOWED_TEACHING_BRIEF_FIELDS = {
    "topic",
    "audience",
    "duration_minutes",
    "lesson_hours",
    "target_pages",
    "teaching_objectives",
    "knowledge_points",
    "global_emphasis",
    "global_difficulties",
    "teaching_strategy",
    "style_profile",
}

_MISSING_TOPIC = "topic"
_MISSING_AUDIENCE = "audience"
_MISSING_KNOWLEDGE_POINTS = "knowledge_points"
_MISSING_TIME_OR_PAGES = "duration_or_pages"


class TeachingBriefPromptContext(TypedDict):
    can_generate: bool
    missing_fields: list[str]
    brief: dict[str, Any]


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
        "status": "live",
        "version": _normalize_int(incoming.get("version")) or 1,
        "last_reviewed_at": incoming.get("last_reviewed_at")
        or incoming.get("last_confirmed_at"),
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


def build_teaching_brief_prompt_context(
    options_raw: Any,
) -> TeachingBriefPromptContext:
    brief = load_teaching_brief(options_raw)
    readiness = dict(brief.get("readiness") or {})
    return {
        "can_generate": bool(readiness.get("can_generate")),
        "missing_fields": list(readiness.get("missing_fields") or []),
        "brief": brief,
    }


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
    del next_status
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
    brief["status"] = "live"
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
    brief["status"] = "live"
    brief["last_reviewed_at"] = now_iso()
    brief["readiness"] = compute_teaching_brief_readiness(brief)
    return brief


def apply_proposal_to_brief(
    brief_raw: Any,
    proposal: dict[str, Any],
) -> dict[str, Any]:
    proposed_changes = dict(proposal.get("proposed_changes") or {})
    return patch_teaching_brief(brief_raw, proposed_changes)


def _normalize_field_value(field_name: str, value: Any) -> Any:
    if field_name in {"topic", "audience", "teaching_strategy"}:
        return _normalize_text(value)
    if field_name in {"duration_minutes", "lesson_hours", "target_pages"}:
        return _normalize_int(value)
    if field_name in {
        "teaching_objectives",
        "global_emphasis",
        "global_difficulties",
    }:
        return _normalize_list(value)
    if field_name == "knowledge_points":
        return _normalize_knowledge_points(value)
    if field_name == "style_profile":
        return _normalize_style_profile(value)
    return value


def _filter_changed_proposed_changes(
    brief_raw: Any,
    proposed_changes: dict[str, Any],
) -> dict[str, Any]:
    brief = normalize_teaching_brief(brief_raw)
    changed: dict[str, Any] = {}
    for field_name, value in proposed_changes.items():
        if field_name not in ALLOWED_TEACHING_BRIEF_FIELDS:
            continue
        if _normalize_field_value(field_name, brief.get(field_name)) == _normalize_field_value(
            field_name, value
        ):
            continue
        changed[field_name] = value
    return changed


def _normalize_brief_proposal(
    proposal: dict[str, Any],
    proposed_changes: dict[str, Any],
) -> dict[str, Any]:
    confidence = proposal.get("confidence", 0.85)
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = 0.85
    return {
        "proposal_id": _normalize_text(proposal.get("proposal_id")) or str(uuid4()),
        "source_message_id": _normalize_text(proposal.get("source_message_id")),
        "proposed_changes": proposed_changes,
        "reasoning_summary": _normalize_text(proposal.get("reasoning_summary"))
        or "根据最新对话提取到新的教学需求候选字段。",
        "confidence": max(0.0, min(confidence_value, 1.0)),
        "requires_user_confirmation": bool(
            proposal.get("requires_user_confirmation", True)
        ),
        "created_at": proposal.get("created_at") or now_iso(),
    }


def auto_apply_ai_proposal(
    brief_raw: Any,
    proposal: dict[str, Any],
    *,
    proposals_raw: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    proposed_changes = _filter_changed_proposed_changes(
        brief_raw,
        dict(proposal.get("proposed_changes") or {}),
    )
    current_brief = normalize_teaching_brief(brief_raw)
    current_proposals = (
        load_teaching_brief_proposals({TEACHING_BRIEF_PROPOSALS_KEY: proposals_raw})
        if proposals_raw is not None
        else []
    )
    if not proposed_changes:
        return {
            "brief": current_brief,
            "applied_fields": [],
            "proposals": current_proposals,
            "queued_proposal": None,
            "status": "live",
        }

    normalized_proposal = _normalize_brief_proposal(proposal, proposed_changes)
    if normalized_proposal.get("requires_user_confirmation"):
        return {
            "brief": current_brief,
            "applied_fields": [],
            "proposals": [*current_proposals, normalized_proposal],
            "queued_proposal": normalized_proposal,
            "status": "live",
        }

    next_brief = patch_teaching_brief(current_brief, proposed_changes)
    return {
        "brief": next_brief,
        "applied_fields": list(proposed_changes.keys()),
        "proposals": current_proposals,
        "queued_proposal": None,
        "status": next_brief.get("status"),
    }
