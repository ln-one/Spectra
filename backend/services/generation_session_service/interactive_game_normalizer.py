from __future__ import annotations

import copy
import re
from typing import Any

from .interactive_game_runtime import render_interactive_game_runtime

ALLOWED_INTERACTIVE_GAME_SUBTYPES = {
    "drag_classification",
    "sequence_sort",
    "relationship_link",
}

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SPACE_RE = re.compile(r"\s+")
_NOISE_RE = re.compile(
    r"(?:\bjson\b|\bschema\b|\bmarkdown\b|prompt residue|system note|chunk\s*\d+|renderer metadata)",
    flags=re.IGNORECASE,
)


def _normalize_text(value: Any) -> str:
    text = str(value or "")
    text = _CONTROL_RE.sub("", text).replace("\r", " ").replace("\n", " ")
    text = _NOISE_RE.sub(" ", text)
    text = _SPACE_RE.sub(" ", text).strip(" ：:，,；;、")
    return text


def _trim_text(value: Any, limit: int) -> str:
    text = _normalize_text(value)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip(" ，。；;:：、,.!?！？-") + "…"


def _normalize_string_list(value: Any, *, limit: int, max_items: int) -> list[str]:
    raw_items = value if isinstance(value, list) else [value]
    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        candidate = _trim_text(item, limit)
        if not candidate:
            continue
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(candidate)
        if len(normalized) >= max_items:
            break
    return normalized


def _coerce_positive_int(value: Any, fallback: int) -> int:
    try:
        candidate = int(value)
        return candidate if candidate > 0 else fallback
    except (TypeError, ValueError):
        return fallback


def _coerce_unit_float(value: Any, fallback: float) -> float:
    try:
        candidate = float(value)
        return candidate if candidate > 0 else fallback
    except (TypeError, ValueError):
        return fallback


def normalize_interactive_game_subtype(value: Any) -> str:
    raw = str(value or "").strip().lower()
    alias_map = {
        "drag": "drag_classification",
        "drag_sort": "drag_classification",
        "drag_and_drop": "drag_classification",
        "classification": "drag_classification",
        "sort": "sequence_sort",
        "timeline_sort": "sequence_sort",
        "sequence": "sequence_sort",
        "ordering": "sequence_sort",
        "link": "relationship_link",
        "match": "relationship_link",
        "concept_match": "relationship_link",
        "pairing": "relationship_link",
        "term_pairing": "relationship_link",
    }
    normalized = alias_map.get(raw, raw)
    if normalized in ALLOWED_INTERACTIVE_GAME_SUBTYPES:
        return normalized
    return "drag_classification"


def build_interactive_game_schema_hint(config: dict[str, Any] | None = None) -> str:
    subtype = normalize_interactive_game_subtype((config or {}).get("subtype"))
    subtype_spec = {
        "drag_classification": {
            "items": [{"id": "item-1", "label": "导体", "hint": "可传导电流"}],
            "zones": [{"id": "zone-1", "label": "导体"}],
            "correct_mapping": {"item-1": "zone-1"},
            "feedback_copy": {"correct": "归类正确。", "incorrect": "还有项目放错区域。"},
        },
        "sequence_sort": {
            "items": [{"id": "step-1", "label": "观察现象", "hint": "先看到实验变化"}],
            "correct_order": ["step-1"],
            "completion_copy": "流程顺序正确。",
        },
        "relationship_link": {
            "left_nodes": [{"id": "left-1", "label": "串联"}],
            "right_nodes": [{"id": "right-1", "label": "电流路径唯一"}],
            "correct_links": [{"left_id": "left-1", "right_id": "right-1"}],
            "feedback_copy": {"correct": "关系连线正确。", "incorrect": "还有关系需要调整。"},
        },
    }
    return str(
        {
            "schema_id": "interactive_game.v2",
            "subtype": subtype,
            "title": "互动游戏标题",
            "summary": "课堂小游戏简介",
            "subtitle": "一行玩法副标题",
            "teaching_goal": "希望学生通过操作掌握什么",
            "teacher_notes": ["教师组织建议 1"],
            "instructions": ["学生操作说明 1", "学生操作说明 2"],
            "spec": subtype_spec[subtype],
            "score_policy": {"max_score": 100, "timer_seconds": 90},
            "completion_rule": {
                "pass_threshold": 1.0,
                "success_copy": "完成提示",
                "failure_copy": "失败提示",
            },
        }
    ).replace("'", '"')


def _normalize_named_items(
    items: Any,
    *,
    default_prefix: str,
    max_items: int,
) -> list[dict[str, str]]:
    if not isinstance(items, list):
        return []
    normalized: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    seen_labels: set[str] = set()
    for index, raw in enumerate(items, start=1):
        row = raw if isinstance(raw, dict) else {"label": raw}
        label = _trim_text(row.get("label") or row.get("title") or row.get("text"), 48)
        if not label:
            continue
        label_key = label.lower()
        if label_key in seen_labels:
            continue
        seen_labels.add(label_key)
        raw_id = str(row.get("id") or "").strip().lower()
        safe_id = re.sub(r"[^a-z0-9_-]+", "-", raw_id or f"{default_prefix}-{index}").strip("-")
        if not safe_id:
            safe_id = f"{default_prefix}-{index}"
        if safe_id in seen_ids:
            safe_id = f"{safe_id}-{index}"
        seen_ids.add(safe_id)
        payload = {"id": safe_id[:48], "label": label}
        hint = _trim_text(row.get("hint") or row.get("summary"), 72)
        if hint:
            payload["hint"] = hint
        normalized.append(payload)
        if len(normalized) >= max_items:
            break
    return normalized


def _normalize_drag_spec(spec: dict[str, Any]) -> dict[str, Any]:
    items = _normalize_named_items(spec.get("items"), default_prefix="item", max_items=10)
    zones = _normalize_named_items(spec.get("zones"), default_prefix="zone", max_items=6)
    zone_ids = {item["id"] for item in zones}
    correct_mapping_raw = spec.get("correct_mapping") if isinstance(spec.get("correct_mapping"), dict) else {}
    correct_mapping: dict[str, str] = {}
    for item in items:
        mapped_zone = str(correct_mapping_raw.get(item["id"]) or "").strip().lower()
        if mapped_zone in zone_ids:
            correct_mapping[item["id"]] = mapped_zone
            continue
        first_zone = zones[0]["id"] if zones else ""
        if first_zone:
            correct_mapping[item["id"]] = first_zone
    feedback_copy = spec.get("feedback_copy") if isinstance(spec.get("feedback_copy"), dict) else {}
    return {
        "items": items,
        "zones": zones,
        "correct_mapping": correct_mapping,
        "feedback_copy": {
            "correct": _trim_text(feedback_copy.get("correct"), 96) or "归类正确。",
            "incorrect": _trim_text(feedback_copy.get("incorrect"), 96) or "还有项目放错区域。",
        },
    }


def _normalize_sequence_spec(spec: dict[str, Any]) -> dict[str, Any]:
    items = _normalize_named_items(spec.get("items"), default_prefix="step", max_items=10)
    item_ids = {item["id"] for item in items}
    raw_order = spec.get("correct_order") if isinstance(spec.get("correct_order"), list) else []
    correct_order: list[str] = []
    for item_id in raw_order:
        normalized_id = str(item_id or "").strip().lower()
        if normalized_id in item_ids and normalized_id not in correct_order:
            correct_order.append(normalized_id)
    if len(correct_order) != len(items):
        remaining = [item["id"] for item in items if item["id"] not in correct_order]
        correct_order.extend(remaining)
    return {
        "items": items,
        "correct_order": correct_order,
        "completion_copy": _trim_text(spec.get("completion_copy"), 96) or "流程顺序正确。",
    }


def _normalize_relationship_spec(spec: dict[str, Any]) -> dict[str, Any]:
    left_nodes = _normalize_named_items(spec.get("left_nodes"), default_prefix="left", max_items=8)
    right_nodes = _normalize_named_items(spec.get("right_nodes"), default_prefix="right", max_items=8)
    left_ids = {item["id"] for item in left_nodes}
    right_ids = {item["id"] for item in right_nodes}
    correct_links_raw = spec.get("correct_links") if isinstance(spec.get("correct_links"), list) else []
    correct_links: list[dict[str, str]] = []
    seen_pairs: set[tuple[str, str]] = set()
    for raw in correct_links_raw:
        if not isinstance(raw, dict):
            continue
        left_id = str(raw.get("left_id") or "").strip().lower()
        right_id = str(raw.get("right_id") or "").strip().lower()
        if left_id not in left_ids or right_id not in right_ids:
            continue
        pair = (left_id, right_id)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        correct_links.append({"left_id": left_id, "right_id": right_id})
    if not correct_links and left_nodes and right_nodes:
        fallback_count = min(len(left_nodes), len(right_nodes))
        correct_links = [
            {"left_id": left_nodes[index]["id"], "right_id": right_nodes[index]["id"]}
            for index in range(fallback_count)
        ]
    feedback_copy = spec.get("feedback_copy") if isinstance(spec.get("feedback_copy"), dict) else {}
    return {
        "left_nodes": left_nodes,
        "right_nodes": right_nodes,
        "correct_links": correct_links,
        "feedback_copy": {
            "correct": _trim_text(feedback_copy.get("correct"), 96) or "关系连线正确。",
            "incorrect": _trim_text(feedback_copy.get("incorrect"), 96) or "还有关系需要调整。",
        },
    }


def _build_answer_key(subtype: str, spec: dict[str, Any]) -> dict[str, Any]:
    if subtype == "drag_classification":
        return {
            "subtype": subtype,
            "correct_mapping": copy.deepcopy(spec.get("correct_mapping") or {}),
        }
    if subtype == "sequence_sort":
        return {
            "subtype": subtype,
            "correct_order": list(spec.get("correct_order") or []),
        }
    return {
        "subtype": subtype,
        "correct_links": copy.deepcopy(spec.get("correct_links") or []),
    }


def normalize_interactive_game_v2_payload(
    payload: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = dict(config or {})
    subtype = normalize_interactive_game_subtype(
        payload.get("subtype") or cfg.get("subtype") or cfg.get("mode") or cfg.get("game_pattern")
    )
    raw_spec = payload.get("spec") if isinstance(payload.get("spec"), dict) else {}
    if subtype == "drag_classification":
        spec = _normalize_drag_spec(raw_spec)
    elif subtype == "sequence_sort":
        spec = _normalize_sequence_spec(raw_spec)
    else:
        spec = _normalize_relationship_spec(raw_spec)

    instructions = _normalize_string_list(
        payload.get("instructions")
        or [cfg.get("interaction_brief"), cfg.get("classroom_constraints")],
        limit=96,
        max_items=4,
    )
    teacher_notes = _normalize_string_list(
        payload.get("teacher_notes") or cfg.get("classroom_constraints"),
        limit=120,
        max_items=4,
    )
    title = _trim_text(
        payload.get("title") or cfg.get("topic") or "互动游戏",
        48,
    ) or "互动游戏"
    summary = _trim_text(
        payload.get("summary") or cfg.get("interaction_brief") or cfg.get("teaching_goal"),
        120,
    ) or "课堂操作型互动小游戏。"
    subtitle = _trim_text(payload.get("subtitle") or cfg.get("topic"), 72)
    teaching_goal = _trim_text(
        payload.get("teaching_goal") or cfg.get("teaching_goal") or cfg.get("topic"),
        140,
    ) or "通过操作互动强化课堂知识点。"
    score_policy_raw = payload.get("score_policy") if isinstance(payload.get("score_policy"), dict) else {}
    completion_rule_raw = payload.get("completion_rule") if isinstance(payload.get("completion_rule"), dict) else {}
    score_policy = {
        "max_score": _coerce_positive_int(score_policy_raw.get("max_score"), 100),
        "show_progress": bool(score_policy_raw.get("show_progress", True)),
    }
    timer_seconds = score_policy_raw.get("timer_seconds")
    resolved_timer_seconds = _coerce_positive_int(timer_seconds, 0)
    if resolved_timer_seconds > 0:
        score_policy["timer_seconds"] = resolved_timer_seconds
    completion_rule = {
        "pass_threshold": _coerce_unit_float(completion_rule_raw.get("pass_threshold"), 1.0),
        "allow_retry": bool(completion_rule_raw.get("allow_retry", True)),
        "success_copy": _trim_text(completion_rule_raw.get("success_copy"), 96) or "完成得很漂亮。",
        "failure_copy": _trim_text(completion_rule_raw.get("failure_copy"), 96) or "再调整一下，你就快完成了。",
    }
    answer_key = _build_answer_key(subtype, spec)
    normalized = {
        "kind": "interactive_game",
        "schema_id": "interactive_game.v2",
        "subtype": subtype,
        "title": title,
        "summary": summary,
        "subtitle": subtitle,
        "teaching_goal": teaching_goal,
        "teacher_notes": teacher_notes,
        "instructions": instructions,
        "spec": spec,
        "score_policy": score_policy,
        "completion_rule": completion_rule,
        "answer_key": answer_key,
    }
    normalized["runtime"] = render_interactive_game_runtime(normalized)
    return normalized
