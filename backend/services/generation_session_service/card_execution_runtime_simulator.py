from __future__ import annotations

from schemas.studio_cards import StudioCardTurnResult


def normalize_simulator_turn_result(
    *,
    turn_result: dict | None,
    teacher_answer: str,
    config: dict | None,
) -> StudioCardTurnResult:
    normalized_turn_result = dict(turn_result or {})
    runtime_config = config or {}

    if not normalized_turn_result.get("student_profile"):
        normalized_turn_result["student_profile"] = str(
            normalized_turn_result.get("student_intent")
            or runtime_config.get("profile")
            or "detail_oriented"
        )
    if not normalized_turn_result.get("feedback"):
        normalized_turn_result["feedback"] = str(
            normalized_turn_result.get("assistant_feedback")
            or normalized_turn_result.get("analysis")
            or "建议继续追问边界条件与关键步骤。"
        )
    if not normalized_turn_result.get("teacher_answer"):
        normalized_turn_result["teacher_answer"] = teacher_answer
    if "score" not in normalized_turn_result:
        raw_score = normalized_turn_result.get("quality_score")
        try:
            normalized_turn_result["score"] = int(raw_score)
        except (TypeError, ValueError):
            normalized_turn_result["score"] = 80

    return StudioCardTurnResult(**normalized_turn_result)
