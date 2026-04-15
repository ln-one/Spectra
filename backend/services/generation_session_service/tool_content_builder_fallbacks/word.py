"""Word fallback content."""

from __future__ import annotations

from typing import Any

from services.generation_session_service.word_template_engine import (
    build_word_fallback_payload,
    resolve_word_document_variant,
)


def fallback_word_document_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    return build_word_fallback_payload(
        document_variant=resolve_word_document_variant(config.get("document_variant")),
        config=config,
        rag_snippets=rag_snippets,
    )
