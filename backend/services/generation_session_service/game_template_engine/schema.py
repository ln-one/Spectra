"""Game template schemas, prompts, and validation."""

from __future__ import annotations

import json
from typing import Any

TEMPLATE_GAME_PATTERNS: tuple[str, ...] = (
    "timeline_sort",
    "concept_match",
    "quiz_challenge",
    "fill_in_blank",
)


def resolve_game_pattern(config: dict[str, Any] | None) -> str:
    cfg = dict(config or {})
    raw = str(cfg.get("mode") or cfg.get("game_pattern") or "freeform").strip().lower()
    return raw or "freeform"


def is_template_game_pattern(pattern: str) -> bool:
    return pattern in TEMPLATE_GAME_PATTERNS


def build_game_schema_hint(pattern: str) -> str:
    schema_hints = {
        "timeline_sort": (
            '{"game_title":"","instruction":"",'
            '"events":[{"id":"evt-1","label":"","year":"","hint":""}],'
            '"correct_order":["evt-1"],'
            '"success_message":"","retry_message":""}'
        ),
        "concept_match": (
            '{"game_title":"","instruction":"",'
            '"pairs":[{"id":"pair-1","concept":"","definition":""}],'
            '"success_message":"","retry_message":""}'
        ),
        "quiz_challenge": (
            '{"game_title":"","instruction":"","total_lives":3,'
            '"levels":[{"id":"level-1","question":"","options":["A","B","C","D"],'
            '"correct_index":0,"explanation":""}],'
            '"victory_message":"","game_over_message":""}'
        ),
        "fill_in_blank": (
            '{"game_title":"","instruction":"",'
            '"paragraphs":[{"id":"para-1","segments":[{"type":"text","content":""},'
            '{"type":"blank","blank_id":"b1","answer":"","hint":""}]}],'
            '"success_message":"","retry_message":""}'
        ),
    }
    if pattern not in schema_hints:
        raise ValueError(f"unsupported_game_pattern:{pattern}")
    return schema_hints[pattern]


def build_game_prompt(
    *,
    pattern: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> str:
    if not is_template_game_pattern(pattern):
        raise ValueError(f"unsupported_game_pattern:{pattern}")
    topic = str(config.get("topic") or "课堂主题").strip()
    creative_brief = str(config.get("creative_brief") or "").strip()
    schema_hint = build_game_schema_hint(pattern)
    return (
        "You generate ONLY structured JSON data for a classroom interactive game.\n"
        "Do not output markdown fences. Do not output HTML/CSS/JS.\n"
        f"game_pattern: {pattern}\n"
        f"topic: {topic}\n"
        f"creative_brief: {creative_brief or 'none'}\n"
        f"rag_snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "Requirements:\n"
        "- Keep all labels and instructions in Chinese.\n"
        "- Use concrete, teachable content.\n"
        "- Avoid placeholders and empty arrays.\n"
        "- Keep item counts practical for one slide game interaction.\n"
        f"Return shape example: {schema_hint}\n"
    )


def _require_non_empty_str(payload: dict[str, Any], key: str) -> None:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"field_{key}_empty")


def _require_non_empty_list(payload: dict[str, Any], key: str) -> None:
    value = payload.get(key)
    if not isinstance(value, list) or not value:
        raise ValueError(f"field_{key}_empty")


def validate_game_data(pattern: str, data: dict[str, Any]) -> None:
    if not isinstance(data, dict):
        raise ValueError("payload_not_object")
    if not is_template_game_pattern(pattern):
        raise ValueError(f"unsupported_game_pattern:{pattern}")

    _require_non_empty_str(data, "game_title")
    _require_non_empty_str(data, "instruction")

    if pattern == "timeline_sort":
        _require_non_empty_list(data, "events")
        _require_non_empty_list(data, "correct_order")
        _require_non_empty_str(data, "success_message")
        _require_non_empty_str(data, "retry_message")
        event_ids: list[str] = []
        for item in data["events"]:
            if not isinstance(item, dict):
                raise ValueError("field_events_item_invalid")
            for key in ("id", "label", "year"):
                value = item.get(key)
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"field_events_{key}_empty")
            event_ids.append(str(item["id"]).strip())
        for event_id in data["correct_order"]:
            if not isinstance(event_id, str) or not event_id.strip():
                raise ValueError("field_correct_order_item_empty")
            if event_id not in event_ids:
                raise ValueError("field_correct_order_unknown_id")
    elif pattern == "concept_match":
        _require_non_empty_list(data, "pairs")
        _require_non_empty_str(data, "success_message")
        _require_non_empty_str(data, "retry_message")
        for item in data["pairs"]:
            if not isinstance(item, dict):
                raise ValueError("field_pairs_item_invalid")
            for key in ("id", "concept", "definition"):
                value = item.get(key)
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"field_pairs_{key}_empty")
    elif pattern == "quiz_challenge":
        _require_non_empty_list(data, "levels")
        _require_non_empty_str(data, "victory_message")
        _require_non_empty_str(data, "game_over_message")
        lives = data.get("total_lives")
        if not isinstance(lives, int) or lives <= 0:
            raise ValueError("field_total_lives_invalid")
        for item in data["levels"]:
            if not isinstance(item, dict):
                raise ValueError("field_levels_item_invalid")
            for key in ("id", "question", "explanation"):
                value = item.get(key)
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"field_levels_{key}_empty")
            options = item.get("options")
            if not isinstance(options, list) or len(options) < 2:
                raise ValueError("field_levels_options_invalid")
            if not all(isinstance(opt, str) and opt.strip() for opt in options):
                raise ValueError("field_levels_options_item_empty")
            correct_index = item.get("correct_index")
            if not isinstance(correct_index, int):
                raise ValueError("field_levels_correct_index_invalid")
            if correct_index < 0 or correct_index >= len(options):
                raise ValueError("field_levels_correct_index_out_of_range")
    elif pattern == "fill_in_blank":
        _require_non_empty_list(data, "paragraphs")
        _require_non_empty_str(data, "success_message")
        _require_non_empty_str(data, "retry_message")
        for item in data["paragraphs"]:
            if not isinstance(item, dict):
                raise ValueError("field_paragraphs_item_invalid")
            paragraph_id = item.get("id")
            if not isinstance(paragraph_id, str) or not paragraph_id.strip():
                raise ValueError("field_paragraphs_id_empty")
            segments = item.get("segments")
            if not isinstance(segments, list) or not segments:
                raise ValueError("field_paragraphs_segments_empty")
            has_blank = False
            for segment in segments:
                if not isinstance(segment, dict):
                    raise ValueError("field_segments_item_invalid")
                segment_type = str(segment.get("type") or "").strip()
                if segment_type == "text":
                    content = segment.get("content")
                    if not isinstance(content, str) or not content:
                        raise ValueError("field_segments_text_empty")
                    continue
                if segment_type == "blank":
                    has_blank = True
                    blank_id = segment.get("blank_id")
                    answer = segment.get("answer")
                    if not isinstance(blank_id, str) or not blank_id.strip():
                        raise ValueError("field_segments_blank_id_empty")
                    if not isinstance(answer, str) or not answer.strip():
                        raise ValueError("field_segments_answer_empty")
                    continue
                raise ValueError("field_segments_type_invalid")
            if not has_blank:
                raise ValueError("field_paragraphs_blank_missing")
