"""Word payload normalization."""

from __future__ import annotations

import copy
from typing import Any

from .common import (
    WORD_LAYOUT_VERSION,
    _require_dict,
    _require_non_empty_str,
    resolve_word_document_variant,
)
from .html import render_word_doc_source_html, render_word_preview_html
from .markdown import build_word_markdown
from .sections import build_word_sections
from .validation import validate_word_layout_payload


def _build_lesson_plan_structure(
    *,
    title: str,
    summary: str,
    layout_payload: dict[str, Any],
    sections: list[dict[str, str]],
) -> dict[str, Any]:
    objectives = layout_payload.get("learning_objectives")
    lesson_flow = layout_payload.get("lesson_flow")
    learning_objectives: list[str] = []
    if isinstance(objectives, dict):
        for key in ("a_level", "b_level", "c_level"):
            raw_items = objectives.get(key)
            if isinstance(raw_items, list):
                learning_objectives.extend(
                    [str(item).strip() for item in raw_items if str(item).strip()]
                )

    learning_process = []
    if isinstance(lesson_flow, list):
        for index, item in enumerate(lesson_flow, start=1):
            if not isinstance(item, dict):
                continue
            learning_process.append(
                {
                    "id": f"step-{index}",
                    "phase": str(item.get("phase") or f"步骤 {index}").strip()
                    or f"步骤 {index}",
                    "duration": str(item.get("duration") or "").strip() or None,
                    "teacher_actions": [
                        str(action).strip()
                        for action in (item.get("teacher_actions") or [])
                        if str(action).strip()
                    ],
                    "student_actions": [
                        str(action).strip()
                        for action in (item.get("student_actions") or [])
                        if str(action).strip()
                    ],
                    "outputs": [
                        str(output).strip()
                        for output in (item.get("outputs") or [])
                        if str(output).strip()
                    ],
                }
            )

    if not learning_process:
        learning_process = [
            {
                "id": f"step-{index}",
                "phase": section.get("title") or f"步骤 {index}",
                "summary": section.get("content") or "",
            }
            for index, section in enumerate(sections, start=1)
        ]

    return {
        "topic": title,
        "learning_objectives": learning_objectives,
        "evaluation_tasks": [
            str(item).strip()
            for item in (layout_payload.get("assessment_methods") or [])
            if str(item).strip()
        ],
        "learning_process": learning_process,
        "practice_and_check": [
            str(item).strip()
            for item in (layout_payload.get("homework") or [])
            if str(item).strip()
        ],
        "reflection": summary,
    }


def build_word_payload(
    *,
    document_variant: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    variant = resolve_word_document_variant(document_variant)
    title = _require_non_empty_str(payload.get("title"), "title")
    summary = _require_non_empty_str(payload.get("summary"), "summary")
    layout_payload = copy.deepcopy(
        _require_dict(payload.get("layout_payload"), "layout_payload")
    )
    validate_word_layout_payload(variant, layout_payload)
    normalized = {
        "kind": "teaching_document",
        "legacy_kind": "word_document",
        "schema_id": "lesson_plan_v1",
        "schema_version": 1,
        "preset": "lesson_plan",
        "layout_version": WORD_LAYOUT_VERSION,
        "title": title,
        "summary": summary,
        "document_variant": variant,
        "layout_payload": layout_payload,
    }
    normalized["sections"] = build_word_sections(variant, normalized)
    normalized["lesson_plan"] = _build_lesson_plan_structure(
        title=title,
        summary=summary,
        layout_payload=layout_payload,
        sections=normalized["sections"],
    )
    normalized["lesson_plan_markdown"] = build_word_markdown(variant, normalized)
    normalized["preview_html"] = render_word_preview_html(variant, normalized)
    normalized["doc_source_html"] = render_word_doc_source_html(variant, normalized)
    return normalized
