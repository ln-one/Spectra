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
from .tool_content_builder_payloads import (
    normalize_demonstration_animation_payload,
    normalize_speaker_notes_payload,
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


def _normalize_simulator_turn_payload(
    payload: dict[str, Any],
    current_content: dict[str, Any],
    teacher_answer: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    updated_content = (
        dict(payload.get("updated_content"))
        if isinstance(payload.get("updated_content"), dict)
        else {}
    )
    turn_result = (
        dict(payload.get("turn_result"))
        if isinstance(payload.get("turn_result"), dict)
        else {}
    )
    existing_turns = (
        current_content.get("turns") if isinstance(current_content.get("turns"), list) else []
    )
    normalized_turns: list[dict[str, Any]] = []
    for index, raw_turn in enumerate(existing_turns, start=1):
        if not isinstance(raw_turn, dict):
            continue
        normalized_turns.append(
            {
                "turn_anchor": str(raw_turn.get("turn_anchor") or f"turn-{index}").strip()
                or f"turn-{index}",
                "student_profile": str(
                    raw_turn.get("student_profile") or raw_turn.get("student") or ""
                ).strip(),
                "student_question": str(
                    raw_turn.get("student_question") or raw_turn.get("question") or ""
                ).strip(),
                "teacher_answer": str(raw_turn.get("teacher_answer") or "").strip(),
                "teacher_hint": str(raw_turn.get("teacher_hint") or "").strip(),
                "feedback": str(raw_turn.get("feedback") or "").strip(),
                "score": raw_turn.get("score"),
                "next_focus": str(raw_turn.get("next_focus") or "").strip(),
            }
        )

    turn_anchor = str(
        turn_result.get("turn_anchor") or f"turn-{len(normalized_turns) + 1}"
    ).strip() or f"turn-{len(normalized_turns) + 1}"
    normalized_turn = {
        "turn_anchor": turn_anchor,
        "student_profile": str(turn_result.get("student_profile") or "").strip(),
        "student_question": str(turn_result.get("student_question") or "").strip(),
        "teacher_answer": str(turn_result.get("teacher_answer") or teacher_answer).strip(),
        "teacher_hint": str(turn_result.get("teacher_hint") or "").strip(),
        "feedback": str(
            turn_result.get("feedback") or turn_result.get("analysis") or ""
        ).strip(),
        "score": turn_result.get("score") or turn_result.get("quality_score"),
        "next_focus": str(turn_result.get("next_focus") or "").strip(),
    }
    normalized_turns.append(normalized_turn)

    summary = str(
        updated_content.get("summary") or current_content.get("summary") or ""
    ).strip()
    key_points = (
        updated_content.get("key_points")
        if isinstance(updated_content.get("key_points"), list)
        else current_content.get("key_points")
        if isinstance(current_content.get("key_points"), list)
        else []
    )
    normalized_updated_content = {
        **current_content,
        **updated_content,
        "kind": "classroom_qa_simulator",
        "schema_version": "classroom_qa_simulator.v2",
        "title": str(
            updated_content.get("title") or current_content.get("title") or "课堂问答模拟"
        ).strip()
        or "课堂问答模拟",
        "summary": summary or "已更新课堂问答模拟最新轮次。",
        "key_points": [
            str(point).strip()
            for point in key_points
            if isinstance(point, str) and str(point).strip()
        ],
        "question_focus": str(
            updated_content.get("question_focus")
            or normalized_turn["next_focus"]
            or current_content.get("question_focus")
            or ""
        ).strip(),
        "turns": normalized_turns,
    }
    normalized_turn_result = {
        **turn_result,
        **normalized_turn,
    }
    return normalized_updated_content, normalized_turn_result


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
    elif card_id == "speaker_notes":
        payload = normalize_speaker_notes_payload(payload, config)
    elif card_id == "demonstration_animations":
        payload = await normalize_demonstration_animation_payload(payload, config)
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
    normalized_updated_content, normalized_turn_result = _normalize_simulator_turn_payload(
        payload,
        current_content,
        teacher_answer,
    )
    try:
        validate_simulator_turn_payload(
            {
                "updated_content": normalized_updated_content,
                "turn_result": normalized_turn_result,
            }
        )
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
    return normalized_updated_content, normalized_turn_result
