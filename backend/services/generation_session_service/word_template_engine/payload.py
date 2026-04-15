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
        "kind": "word_document",
        "layout_version": WORD_LAYOUT_VERSION,
        "title": title,
        "summary": summary,
        "document_variant": variant,
        "layout_payload": layout_payload,
    }
    normalized["sections"] = build_word_sections(variant, normalized)
    normalized["lesson_plan_markdown"] = build_word_markdown(variant, normalized)
    normalized["preview_html"] = render_word_preview_html(variant, normalized)
    normalized["doc_source_html"] = render_word_doc_source_html(variant, normalized)
    return normalized
