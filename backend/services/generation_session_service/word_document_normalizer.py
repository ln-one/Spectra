from __future__ import annotations

from typing import Any

from services.generation_session_service.word_template_engine import (
    build_word_payload,
    build_word_schema_hint,
    resolve_word_document_variant,
)
from .word_document_content import markdown_to_document_content


def resolve_word_document_schema_hint(config: dict[str, Any] | None = None) -> str:
    return build_word_schema_hint(
        resolve_word_document_variant((config or {}).get("document_variant"))
    )


def normalize_word_document_payload(
    payload: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    variant = resolve_word_document_variant(
        payload.get("document_variant") or (config or {}).get("document_variant")
    )
    normalized = build_word_payload(document_variant=variant, payload=payload)
    normalized["document_content"] = markdown_to_document_content(
        str(normalized.get("lesson_plan_markdown") or "")
    )
    return normalized
