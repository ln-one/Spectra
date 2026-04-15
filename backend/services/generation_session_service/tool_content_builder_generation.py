from __future__ import annotations

import json
from typing import Any

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from services.generation_session_service.game_template_engine import (
    is_template_game_pattern,
    render_game_html,
    resolve_game_pattern,
    validate_game_data,
)
from services.generation_session_service.word_template_engine import (
    build_word_payload,
    resolve_word_document_variant,
)
from utils.exceptions import APIException, ErrorCode

from .tool_content_builder_support import (
    build_error_details,
    build_schema_hint,
    parse_ai_object_payload,
    raise_generation_error,
    validate_card_payload,
    validate_simulator_turn_payload,
)


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


def _build_simulator_turn_prompt(
    *,
    current_content: dict[str, Any],
    teacher_answer: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> str:
    return (
        "You are a classroom QA simulator generator.\n"
        "Return ONLY a JSON object with keys: turn_result, updated_content.\n"
        "Do not include markdown fences.\n"
        f"Current artifact content: {json.dumps(current_content, ensure_ascii=False)}\n"
        f"Teacher answer: {teacher_answer}\n"
        f"Config: {json.dumps(config, ensure_ascii=False)}\n"
        f"RAG snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "Constraints:\n"
        "- updated_content must be a complete artifact payload.\n"
        "- turn_result must include turn_anchor, student_profile, "
        "student_question, feedback.\n"
        "- Do not output empty strings for required fields.\n"
    )


async def _generate_json_payload(
    *,
    prompt: str,
    card_id: str,
    phase: str,
    rag_snippets: list[str],
    max_tokens: int,
) -> tuple[dict[str, Any], str]:
    try:
        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            has_rag_context=bool(rag_snippets),
            max_tokens=max_tokens,
        )
    except APIException as exc:
        details = dict(exc.details or {})
        model_name = str(
            details.get("resolved_model")
            or details.get("requested_model")
            or ai_service.large_model
            or ""
        )
        details.update(
            build_error_details(
                card_id=card_id,
                model=model_name,
                phase=phase,
                failure_reason=str(details.get("failure_type") or "upstream_error"),
                retryable=bool(exc.retryable),
            )
        )
        raise APIException(
            status_code=exc.status_code,
            error_code=exc.error_code,
            message=exc.message,
            details=details,
            retryable=exc.retryable,
        ) from exc
    except Exception as exc:
        raise_generation_error(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="AI generation failed with an unexpected runtime error.",
            card_id=card_id,
            model=ai_service.large_model,
            phase=phase,
            failure_reason="unexpected_runtime_error",
            retryable=True,
            extra={"raw_error": str(exc)[:300]},
        )

    model_name = str(response.get("model") or ai_service.large_model or "")
    return (
        parse_ai_object_payload(
            card_id=card_id,
            ai_raw=str(response.get("content") or ""),
            model=model_name,
            phase="parse" if phase == "generate" else "parse_turn",
        ),
        model_name,
    )


async def generate_structured_artifact_content(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> dict[str, Any]:
    payload, model_name = await _generate_json_payload(
        prompt=_build_structured_artifact_prompt(
            card_id=card_id,
            config=config,
            rag_snippets=rag_snippets,
            source_hint=source_hint,
        ),
        card_id=card_id,
        phase="generate",
        rag_snippets=rag_snippets,
        max_tokens=1600,
    )
    if card_id == "interactive_games":
        pattern = resolve_game_pattern(config)
        if is_template_game_pattern(pattern):
            game_data = (
                payload.get("game_data")
                if isinstance(payload.get("game_data"), dict)
                else payload
            )
            try:
                validate_game_data(pattern, game_data)
            except ValueError as exc:
                raise_generation_error(
                    status_code=400,
                    error_code=ErrorCode.INVALID_INPUT,
                    message="Interactive game data failed schema validation.",
                    card_id=card_id,
                    model=model_name,
                    phase="validate",
                    failure_reason=str(exc),
                    retryable=False,
                )
            payload = {
                "kind": "interactive_game",
                "title": str(
                    game_data.get("game_title") or config.get("topic") or "互动游戏"
                ).strip(),
                "summary": str(game_data.get("instruction") or "").strip(),
                "game_pattern": pattern,
                "game_data": game_data,
                "html": render_game_html(pattern, game_data),
            }
    elif card_id == "word_document":
        try:
            payload = build_word_payload(
                document_variant=resolve_word_document_variant(
                    payload.get("document_variant") or config.get("document_variant")
                ),
                payload=payload,
            )
        except ValueError as exc:
            raise_generation_error(
                status_code=400,
                error_code=ErrorCode.INVALID_INPUT,
                message="Word document payload failed schema validation.",
                card_id=card_id,
                model=model_name,
                phase="validate",
                failure_reason=f"field_{exc}",
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


async def generate_simulator_turn_update(
    *,
    current_content: dict[str, Any],
    teacher_answer: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    payload, model_name = await _generate_json_payload(
        prompt=_build_simulator_turn_prompt(
            current_content=current_content,
            teacher_answer=teacher_answer,
            config=config,
            rag_snippets=rag_snippets,
        ),
        card_id="classroom_qa_simulator",
        phase="generate_turn",
        rag_snippets=rag_snippets,
        max_tokens=1800,
    )
    try:
        validate_simulator_turn_payload(payload)
    except ValueError as exc:
        raise_generation_error(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="AI payload failed simulator turn schema validation.",
            card_id="classroom_qa_simulator",
            model=model_name,
            phase="validate_turn",
            failure_reason=str(exc),
            retryable=False,
        )
    return payload["updated_content"], payload["turn_result"]
