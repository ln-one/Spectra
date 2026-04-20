from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from services.ai.model_router import ModelRouteTask
from services.generation_session_service.word_template_engine import (
    build_word_markdown_prompt,
    build_word_markdown_reviewer_prompt,
    resolve_word_document_variant,
)
from utils.exceptions import ErrorCode

from .tool_content_builder_ai import (
    ai_service,
    generate_card_json_payload,
    generate_card_text_payload,
)
from .studio_card_payload_normalizers import normalize_generated_card_payload
from .tool_content_builder_support import (
    build_schema_hint,
    raise_generation_error,
    validate_card_payload,
)
from .word_document_normalizer import build_word_payload_from_markdown, sanitize_word_title

logger = logging.getLogger(__name__)


_CARD_GENERATION_MAX_TOKENS: dict[str, int] = {
    "speaker_notes": 4800,
    "word_document": 5000,
    "knowledge_mindmap": 1800,
    "interactive_quick_quiz": 1800,
    "interactive_games": 2200,
    "classroom_qa_simulator": 2400,
}


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
        return value if value > 0 else default
    except ValueError:
        return default


def _resolve_word_model() -> str | None:
    tier = str(os.getenv("WORD_LESSON_PLAN_MODEL_TIER", "quality") or "").strip().lower()
    explicit_quality_model = str(os.getenv("WORD_LESSON_PLAN_QUALITY_MODEL", "")).strip()
    shared_quality_model = str(os.getenv("QUALITY_MODEL", "")).strip()
    if tier == "quality":
        return explicit_quality_model or shared_quality_model or ai_service.large_model
    if tier == "default":
        return ai_service.default_model
    if tier == "small":
        return ai_service.small_model
    return ai_service.large_model


def _resolve_card_generation_max_tokens(card_id: str) -> int:
    if card_id == "word_document":
        return _env_positive_int("WORD_LESSON_PLAN_MAX_TOKENS", 5000)
    return _CARD_GENERATION_MAX_TOKENS.get(card_id, 1600)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


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


_NOISE_TOKEN_RE = re.compile(
    r"\b(?:standard|detail[_ -]?level|schema|json|markdown\s+fence)\b",
    flags=re.IGNORECASE,
)


def _evaluate_markdown_quality(markdown: str) -> tuple[int, list[str], dict[str, int]]:
    text = str(markdown or "").strip()
    issues: list[str] = []
    metrics = {
        "h1": len(re.findall(r"^#\s+", text, flags=re.MULTILINE)),
        "h2": len(re.findall(r"^##\s+", text, flags=re.MULTILINE)),
        "h3": len(re.findall(r"^###\s+", text, flags=re.MULTILINE)),
        "bullet_list": len(re.findall(r"^\s*[-*+]\s+\S", text, flags=re.MULTILINE)),
        "ordered_list": len(re.findall(r"^\s*\d+\.\s+\S", text, flags=re.MULTILINE)),
        "table_rows": len(re.findall(r"^\|.*\|$", text, flags=re.MULTILINE)),
        "char_count": len(text),
    }
    score = 100

    if metrics["h1"] < 1:
        issues.append("missing_h1")
        score -= 20
    if metrics["h2"] < 4:
        issues.append("insufficient_h2")
        score -= 18
    if metrics["h3"] < 2:
        issues.append("insufficient_h3")
        score -= 10
    if metrics["bullet_list"] < 2:
        issues.append("insufficient_bullet_list")
        score -= 10
    if metrics["ordered_list"] < 1:
        issues.append("insufficient_ordered_list")
        score -= 8
    if metrics["char_count"] < 900:
        issues.append("content_too_short")
        score -= 20
    if _NOISE_TOKEN_RE.search(text):
        issues.append("contains_prompt_noise_tokens")
        score -= 18
    if "教师活动" not in text or "学生活动" not in text:
        issues.append("missing_teaching_activity_roles")
        score -= 8
    if "产出" not in text and "证据" not in text:
        issues.append("missing_learning_output_signal")
        score -= 8

    score = max(0, min(100, score))
    return score, issues, metrics


async def _review_word_markdown(
    *,
    topic: str,
    markdown: str,
    rag_snippets: list[str],
    model: str | None,
) -> tuple[str, str | None]:
    if not _env_bool("WORD_MARKDOWN_REVIEW_ENABLED", True):
        return markdown, None
    review_max_tokens = _env_positive_int("WORD_MARKDOWN_REVIEW_MAX_TOKENS", 3200)
    reviewed_markdown, reviewed_model, _meta = await generate_card_text_payload(
        prompt=build_word_markdown_reviewer_prompt(topic=topic, markdown=markdown),
        card_id="word_document",
        phase="review_markdown",
        rag_snippets=rag_snippets,
        max_tokens=review_max_tokens,
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        model=model,
    )
    return reviewed_markdown, reviewed_model


async def _generate_word_document_markdown_first_payload(
    *,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> dict[str, Any]:
    variant = resolve_word_document_variant(str(config.get("document_variant") or ""))
    if variant != "layered_lesson_plan":
        payload, _model_name = await generate_card_json_payload(
            prompt=_build_structured_artifact_prompt(
                card_id="word_document",
                config=config,
                rag_snippets=rag_snippets,
                source_hint=source_hint,
            ),
            card_id="word_document",
            phase="generate",
            rag_snippets=rag_snippets,
            max_tokens=_resolve_card_generation_max_tokens("word_document"),
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            model=_resolve_word_model(),
        )
        return payload

    raw_markdown, model_name, generation_meta = await generate_card_text_payload(
        prompt=build_word_markdown_prompt(
            document_variant=variant,
            config=config,
            rag_snippets=rag_snippets,
            source_hint=source_hint,
        ),
        card_id="word_document",
        phase="generate_markdown",
        rag_snippets=rag_snippets,
        max_tokens=_resolve_card_generation_max_tokens("word_document"),
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        model=_resolve_word_model(),
    )
    topic = str(config.get("topic") or config.get("title") or "教学教案").strip()
    reviewed_markdown, reviewed_model_name = await _review_word_markdown(
        topic=topic,
        markdown=raw_markdown,
        rag_snippets=rag_snippets,
        model=_resolve_word_model(),
    )
    quality_threshold = _env_positive_int("WORD_MARKDOWN_QUALITY_THRESHOLD", 70)
    score, issues, metrics = _evaluate_markdown_quality(reviewed_markdown)
    quality_ok = score >= quality_threshold
    tokens_used = int(generation_meta.get("tokens_used") or 0)
    max_tokens = _resolve_card_generation_max_tokens("word_document")
    logger.info(
        "word_document quality metadata: model=%s review_model=%s tokens_used=%s "
        "max_tokens=%s likely_truncated=%s score=%s threshold=%s issues=%s metrics=%s",
        model_name,
        reviewed_model_name or "disabled",
        tokens_used,
        max_tokens,
        tokens_used >= int(max_tokens * 0.95),
        score,
        quality_threshold,
        ",".join(issues),
        metrics,
    )
    if not quality_ok:
        raise_generation_error(
            status_code=422,
            error_code=ErrorCode.INVALID_INPUT,
            message="Generated lesson-plan markdown failed quality score checks.",
            card_id="word_document",
            model=reviewed_model_name or model_name,
            phase="quality_gate",
            failure_reason="markdown_quality_low:" + ",".join(issues[:6]),
            retryable=False,
            extra={
                "markdown_quality_score": score,
                "markdown_quality_threshold": quality_threshold,
            },
        )
    try:
        payload = build_word_payload_from_markdown(
            markdown=reviewed_markdown,
            config=config,
        )
        payload["title"] = sanitize_word_title(payload.get("title") or "") or payload["title"]
        return payload
    except ValueError as exc:
        raise_generation_error(
            status_code=422,
            error_code=ErrorCode.INVALID_INPUT,
            message="Generated lesson-plan markdown cannot be mapped to document payload.",
            card_id="word_document",
            model=model_name,
            phase="markdown_map",
            failure_reason=str(exc),
            retryable=False,
        )


async def generate_structured_artifact_content(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> dict[str, Any]:
    if card_id == "word_document":
        payload = await _generate_word_document_markdown_first_payload(
            config=config,
            rag_snippets=rag_snippets,
            source_hint=source_hint,
        )
        model_name = _resolve_word_model() or ai_service.large_model
    else:
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
