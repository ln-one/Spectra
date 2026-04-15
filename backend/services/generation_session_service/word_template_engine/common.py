"""Shared Word template constants and small helpers."""

from __future__ import annotations

import html
from typing import Any

WORD_LAYOUT_VERSION = "v1"

WORD_DOCUMENT_VARIANTS = {
    "layered_lesson_plan",
    "student_handout",
    "post_class_quiz",
    "lab_guide",
}

_QUIZ_SECTION_TYPES = {
    "single_choice",
    "fill_blank",
    "short_answer",
    "application",
}


def resolve_word_document_variant(value: str | None) -> str:
    normalized = str(value or "layered_lesson_plan").strip()
    if normalized in WORD_DOCUMENT_VARIANTS:
        return normalized
    return "layered_lesson_plan"


def _require_non_empty_str(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name}_empty")
    return text


def _require_list(value: Any, field_name: str) -> list[Any]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"{field_name}_empty")
    return value


def _require_string_list(value: Any, field_name: str) -> list[str]:
    items = _require_list(value, field_name)
    normalized = [str(item).strip() for item in items if str(item or "").strip()]
    if not normalized:
        raise ValueError(f"{field_name}_empty")
    return normalized


def _require_dict(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or not value:
        raise ValueError(f"{field_name}_empty")
    return value


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item or "").strip()]


def _html_list(items: list[str]) -> str:
    return "".join(f"<li>{html.escape(item)}</li>" for item in items)


def _html_card(title: str, body: str, extra_class: str = "") -> str:
    class_name = "card"
    if extra_class:
        class_name = f"{class_name} {extra_class}"
    return (
        f'<section class="{class_name}">'
        f"<h3>{html.escape(title)}</h3>"
        f"{body}"
        "</section>"
    )
