from __future__ import annotations

import json
from typing import Any

from utils.exceptions import ErrorCode

from .tool_content_builder_ai import ai_service, generate_card_json_payload
from .studio_card_payload_normalizers import normalize_generated_card_payload
from .tool_content_builder_support import (
    build_schema_hint,
    raise_generation_error,
    validate_card_payload,
)


_CARD_GENERATION_MAX_TOKENS: dict[str, int] = {
    "speaker_notes": 4800,
    "word_document": 2200,
    "knowledge_mindmap": 1800,
    "interactive_quick_quiz": 1800,
    "interactive_games": 2200,
    "classroom_qa_simulator": 2400,
}


def _resolve_card_generation_max_tokens(card_id: str) -> int:
    return _CARD_GENERATION_MAX_TOKENS.get(card_id, 1600)


def _build_structured_artifact_prompt(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> str:
    schema_hint = build_schema_hint(card_id, config)
    if not schema_hint:
        raise_generation_error(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="Unsupported studio card for structured generation.",
            card_id=card_id,
            model=None,
            phase="preflight",
            failure_reason="unsupported_card",
            retryable=False,
        )
    return (
        "You are a teaching tool content generator.\n"
        "Return ONLY a JSON object. Do not include markdown fences.\n"
        f"Card type: {card_id}\n"
        f"Config: {json.dumps(config, ensure_ascii=False)}\n"
        f"Source artifact hint: {source_hint or 'none'}\n"
        f"RAG snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "Requirements:\n"
        "- Output must be directly usable for artifact persistence.\n"
        "- Avoid placeholders, empty strings, and empty arrays.\n"
        "- Keep semantics educational and concrete.\n"
        f"Expected JSON shape example: {schema_hint}\n"
    )
async def generate_structured_artifact_content(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> dict[str, Any]:
    payload, model_name = await generate_card_json_payload(
        prompt=_build_structured_artifact_prompt(
            card_id=card_id,
            config=config,
            rag_snippets=rag_snippets,
            source_hint=source_hint,
        ),
        card_id=card_id,
        phase="generate",
        rag_snippets=rag_snippets,
        max_tokens=_resolve_card_generation_max_tokens(card_id),
    )
    try:
        payload = normalize_generated_card_payload(
            card_id=card_id,
            payload=payload,
            config=config,
        )
    except ValueError as exc:
        failure_reason = str(exc)
        if card_id == "word_document" and not failure_reason.startswith("field_"):
            failure_reason = f"field_{failure_reason}"
        error_message = {
            "interactive_games": "Interactive game payload failed legacy compatibility validation.",
            "word_document": "Word document payload failed legacy adapter validation.",
            "speaker_notes": "Speaker notes payload failed adapter validation.",
        }.get(card_id, "Studio card payload failed normalizer validation.")
        raise_generation_error(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message=error_message,
            card_id=card_id,
            model=model_name,
            phase="validate",
            failure_reason=failure_reason,
            retryable=False,
        )
    try:
        validate_card_payload(card_id, payload)
    except ValueError as exc:
        raise_generation_error(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="AI payload failed studio card schema validation.",
            card_id=card_id,
            model=model_name,
            phase="validate",
            failure_reason=str(exc),
            retryable=False,
        )
    return payload
