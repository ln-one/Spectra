from __future__ import annotations

import json
from typing import Any

from utils.exceptions import ErrorCode

from .tool_content_builder_ai import generate_card_json_payload
from .tool_content_builder_support import (
    raise_generation_error,
    validate_simulator_turn_payload,
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
        current_content.get("turns")
        if isinstance(current_content.get("turns"), list)
        else []
    )
    normalized_turns: list[dict[str, Any]] = []
    for index, raw_turn in enumerate(existing_turns, start=1):
        if not isinstance(raw_turn, dict):
            continue
        normalized_turns.append(
            {
                "turn_anchor": str(
                    raw_turn.get("turn_anchor") or f"turn-{index}"
                ).strip()
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

    turn_anchor = (
        str(
            turn_result.get("turn_anchor") or f"turn-{len(normalized_turns) + 1}"
        ).strip()
        or f"turn-{len(normalized_turns) + 1}"
    )
    normalized_turn = {
        "turn_anchor": turn_anchor,
        "student_profile": str(turn_result.get("student_profile") or "").strip(),
        "student_question": str(turn_result.get("student_question") or "").strip(),
        "teacher_answer": str(
            turn_result.get("teacher_answer") or teacher_answer
        ).strip(),
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
        else (
            current_content.get("key_points")
            if isinstance(current_content.get("key_points"), list)
            else []
        )
    )
    normalized_updated_content = {
        **current_content,
        **updated_content,
        "kind": "classroom_qa_simulator",
        "schema_version": "classroom_qa_simulator.v2",
        "title": str(
            updated_content.get("title")
            or current_content.get("title")
            or "课堂问答模拟"
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


async def generate_simulator_turn_update(
    *,
    current_content: dict[str, Any],
    teacher_answer: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    payload, model_name = await generate_card_json_payload(
        prompt=_build_simulator_turn_prompt(
            current_content=current_content,
            teacher_answer=teacher_answer,
            config=config,
            rag_snippets=rag_snippets,
        ),
        card_id="classroom_qa_simulator",
        phase="generate_turn",
        rag_snippets=rag_snippets,
        max_tokens=18000,
    )
    normalized_updated_content, normalized_turn_result = (
        _normalize_simulator_turn_payload(
            payload,
            current_content,
            teacher_answer,
        )
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
