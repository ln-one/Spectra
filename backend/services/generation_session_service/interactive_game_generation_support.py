from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from utils.exceptions import APIException, ErrorCode

from .interactive_game_normalizer import normalize_interactive_game_subtype
from .tool_content_builder_ai import generate_card_json_payload_with_meta
from .tool_content_builder_support import raise_generation_error

logger = logging.getLogger(__name__)

_QUIZ_LIKE_RE = re.compile(
    r"(?:单选|多选|判断题|true\s*or\s*false|question\s*\d|选项\s*[abcd]|题目[:：])",
    flags=re.IGNORECASE,
)


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def _env_positive_float(name: str, default: float | None = None) -> float | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def resolve_interactive_game_model() -> str | None:
    explicit = str(os.getenv("INTERACTIVE_GAME_MODEL", "") or "").strip()
    if explicit:
        return explicit
    quality_model = str(os.getenv("QUALITY_MODEL", "") or "").strip()
    if quality_model:
        return quality_model
    return ai_service.large_model


def resolve_interactive_game_review_model() -> str | None:
    explicit = str(os.getenv("INTERACTIVE_GAME_REVIEW_MODEL", "") or "").strip()
    if explicit:
        return explicit
    return resolve_interactive_game_model()


def resolve_interactive_game_refine_model() -> str | None:
    explicit = str(os.getenv("INTERACTIVE_GAME_REFINE_MODEL", "") or "").strip()
    if explicit:
        return explicit
    return resolve_interactive_game_model()


def resolve_interactive_game_max_tokens() -> int:
    return _env_positive_int("INTERACTIVE_GAME_MAX_TOKENS", 3400)


def resolve_interactive_game_review_max_tokens() -> int:
    return _env_positive_int("INTERACTIVE_GAME_REVIEW_MAX_TOKENS", 3600)


def resolve_interactive_game_timeout_seconds() -> float | None:
    return _env_positive_float("INTERACTIVE_GAME_GENERATION_TIMEOUT_SECONDS", 420.0)


def resolve_interactive_game_review_timeout_seconds() -> float | None:
    return _env_positive_float(
        "INTERACTIVE_GAME_REVIEW_TIMEOUT_SECONDS",
        resolve_interactive_game_timeout_seconds(),
    )


def resolve_interactive_game_refine_timeout_seconds() -> float | None:
    return _env_positive_float("INTERACTIVE_GAME_REFINE_TIMEOUT_SECONDS", 300.0)


def _resolve_target_subtype(config: dict[str, Any]) -> str:
    return normalize_interactive_game_subtype(
        config.get("subtype") or config.get("mode") or config.get("game_pattern")
    )


def _build_generation_schema_hint(subtype: str) -> dict[str, Any]:
    examples = {
        "drag_classification": {
            "items": [{"id": "item-1", "label": "并联", "hint": "多个支路同时接入"}],
            "zones": [{"id": "zone-1", "label": "电路连接方式"}],
            "correct_mapping": {"item-1": "zone-1"},
            "feedback_copy": {"correct": "归类正确。", "incorrect": "还有项目需要调整。"},
        },
        "sequence_sort": {
            "items": [{"id": "step-1", "label": "提出假设", "hint": "先形成判断"}],
            "correct_order": ["step-1"],
            "completion_copy": "流程顺序正确。",
        },
        "relationship_link": {
            "left_nodes": [{"id": "left-1", "label": "串联"}],
            "right_nodes": [{"id": "right-1", "label": "电流路径唯一"}],
            "correct_links": [{"left_id": "left-1", "right_id": "right-1"}],
            "feedback_copy": {"correct": "连线正确。", "incorrect": "再检查一次关系对应。"},
        },
    }
    return {
        "subtype": subtype,
        "title": "互动游戏标题",
        "summary": "课堂小游戏简介",
        "subtitle": "一句玩法定位",
        "teaching_goal": "学生通过操作练习后要掌握什么",
        "teacher_notes": ["教师组织方式建议"],
        "instructions": ["操作说明 1", "操作说明 2"],
        "spec": examples[subtype],
        "score_policy": {"max_score": 100, "timer_seconds": 90},
        "completion_rule": {
            "pass_threshold": 1.0,
            "success_copy": "完成提示",
            "failure_copy": "失败提示",
        },
    }


def build_interactive_game_generation_prompt(
    *,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> str:
    topic = str(config.get("topic") or "当前知识主题").strip()
    teaching_goal = str(config.get("teaching_goal") or topic).strip()
    interaction_brief = str(config.get("interaction_brief") or "").strip()
    classroom_constraints = str(config.get("classroom_constraints") or "").strip()
    subtype = _resolve_target_subtype(config)
    schema_hint = _build_generation_schema_hint(subtype)
    prompt_lines = [
        "You are designing a classroom mini-game artifact for teachers.",
        "Return ONLY one JSON object. Do not include markdown fences or commentary.",
        "This card must be an operational classroom mini-game, not a quiz or worksheet.",
        "Allowed subtypes: drag_classification, sequence_sort, relationship_link.",
        f"Locked target subtype: {subtype}",
        f"Topic: {topic}",
        f"Teaching goal: {teaching_goal}",
        f"Interaction brief: {interaction_brief or 'none'}",
        f"Classroom constraints: {classroom_constraints or 'none'}",
        f"Optional source artifact hint: {source_hint or 'none'}",
        f"Evidence snippets: {json.dumps(rag_snippets, ensure_ascii=False)}",
        "Requirements:",
        "- Do not generate any multiple-choice, judgment, blank-filling, or quiz-run content.",
        "- Produce a concrete interactive structure that students can operate directly.",
        "- Keep title and summary concise; do not leak filenames, chunk markers, templates, or system residue.",
        "- teacher_notes should help the teacher organize the activity in class.",
        "- instructions should be short imperative steps shown to students.",
        "- spec must match the locked subtype exactly.",
        "- The result should feel like a score-based classroom challenge with optional timer, not a narrative game.",
        f"Expected JSON shape example: {json.dumps(schema_hint, ensure_ascii=False)}",
    ]
    return "\n".join(prompt_lines) + "\n"


def _build_review_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "subtype": payload.get("subtype"),
        "title": str(payload.get("title") or "").strip()[:72],
        "summary": str(payload.get("summary") or "").strip()[:180],
        "teaching_goal": str(payload.get("teaching_goal") or "").strip()[:180],
        "instructions": payload.get("instructions") or [],
        "spec": payload.get("spec") or {},
        "score_policy": payload.get("score_policy") or {},
        "completion_rule": payload.get("completion_rule") or {},
    }


def build_interactive_game_review_prompt(
    *,
    config: dict[str, Any],
    draft_payload: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> str:
    subtype = _resolve_target_subtype(config)
    prompt_lines = [
        "You are reviewing and rewriting a classroom interactive game artifact.",
        "Return ONLY one JSON object. Do not include markdown fences or commentary.",
        "This is a full artifact rewrite, not a chat reply.",
        f"Locked target subtype: {subtype}",
        f"Draft snapshot: {json.dumps(_build_review_snapshot(draft_payload), ensure_ascii=False)}",
        f"Optional source artifact hint: {source_hint or 'none'}",
        f"Evidence snippets: {json.dumps(rag_snippets, ensure_ascii=False)}",
        "Review goals:",
        "- Keep the artifact clearly inside classroom interactive mini-game semantics.",
        "- Remove anything that looks like quiz questions, options, or pure display-only HTML.",
        "- Strengthen instructions, teacher notes, and score/completion semantics where they are weak.",
        "- Keep the same subtype unless the draft violates the locked subtype.",
        f"Return the same JSON shape as: {json.dumps(_build_generation_schema_hint(subtype), ensure_ascii=False)}",
    ]
    return "\n".join(prompt_lines) + "\n"


def _extract_tokens_used(meta: dict[str, Any] | None) -> int:
    payload = meta or {}
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    for candidate in (
        payload.get("tokens_used"),
        usage.get("total_tokens"),
        usage.get("output_tokens"),
    ):
        try:
            value = int(candidate)
            if value > 0:
                return value
        except (TypeError, ValueError):
            continue
    return 0


async def generate_interactive_game_reviewed_payload(
    *,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> tuple[dict[str, Any], str, dict[str, Any]]:
    generation_payload, generation_model, generation_meta = (
        await generate_card_json_payload_with_meta(
            prompt=build_interactive_game_generation_prompt(
                config=config,
                rag_snippets=rag_snippets,
                source_hint=source_hint,
            ),
            card_id="interactive_games",
            phase="generate",
            rag_snippets=rag_snippets,
            max_tokens=resolve_interactive_game_max_tokens(),
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            model=resolve_interactive_game_model(),
            timeout_seconds_override=resolve_interactive_game_timeout_seconds(),
        )
    )
    review_payload, review_model, review_meta = await generate_card_json_payload_with_meta(
        prompt=build_interactive_game_review_prompt(
            config=config,
            draft_payload=generation_payload,
            rag_snippets=rag_snippets,
            source_hint=source_hint,
        ),
        card_id="interactive_games",
        phase="review",
        rag_snippets=rag_snippets,
        max_tokens=resolve_interactive_game_review_max_tokens(),
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        model=resolve_interactive_game_review_model(),
        timeout_seconds_override=resolve_interactive_game_review_timeout_seconds(),
    )
    trace = {
        "generation_model": generation_model,
        "review_model": review_model,
        "generation_tokens_used": _extract_tokens_used(generation_meta),
        "review_tokens_used": _extract_tokens_used(review_meta),
        "generation_max_tokens": resolve_interactive_game_max_tokens(),
        "review_max_tokens": resolve_interactive_game_review_max_tokens(),
        "rag_snippet_count": len(rag_snippets),
    }
    return review_payload, review_model, trace


def evaluate_interactive_game_payload_quality(
    payload: dict[str, Any],
) -> tuple[int, list[str], dict[str, int | float]]:
    issues: list[str] = []
    subtype = str(payload.get("subtype") or "").strip()
    title = str(payload.get("title") or "").strip()
    summary = str(payload.get("summary") or "").strip()
    teaching_goal = str(payload.get("teaching_goal") or "").strip()
    instructions = payload.get("instructions") if isinstance(payload.get("instructions"), list) else []
    runtime = payload.get("runtime") if isinstance(payload.get("runtime"), dict) else {}
    html = str(runtime.get("html") or "").strip()
    spec = payload.get("spec") if isinstance(payload.get("spec"), dict) else {}
    metrics = {
        "instruction_count": len(instructions),
        "html_length": len(html),
        "title_length": len(title),
        "teacher_notes_count": len(payload.get("teacher_notes") or []),
        "spec_size": len(spec),
    }
    score = 100

    if subtype not in {"drag_classification", "sequence_sort", "relationship_link"}:
        issues.append("invalid_subtype")
        score -= 40
    if len(title) < 2:
        issues.append("title_too_short")
        score -= 20
    if not summary:
        issues.append("missing_summary")
        score -= 12
    if not teaching_goal:
        issues.append("missing_teaching_goal")
        score -= 12
    if len(instructions) < 2:
        issues.append("insufficient_instructions")
        score -= 12
    if not html or "window.__SPECTRA_INTERACTIVE_GAME__" not in html:
        issues.append("missing_controlled_runtime")
        score -= 28
    if _QUIZ_LIKE_RE.search(" ".join([title, summary, teaching_goal, json.dumps(spec, ensure_ascii=False)])):
        issues.append("quiz_like_output")
        score -= 30
    if subtype == "drag_classification":
        if not isinstance(spec.get("items"), list) or len(spec.get("items") or []) < 3:
            issues.append("drag_items_too_few")
            score -= 14
        if not isinstance(spec.get("zones"), list) or len(spec.get("zones") or []) < 2:
            issues.append("drag_zones_too_few")
            score -= 14
        if not isinstance(spec.get("correct_mapping"), dict) or not spec.get("correct_mapping"):
            issues.append("missing_correct_mapping")
            score -= 16
    elif subtype == "sequence_sort":
        if not isinstance(spec.get("items"), list) or len(spec.get("items") or []) < 4:
            issues.append("sequence_items_too_few")
            score -= 16
        if not isinstance(spec.get("correct_order"), list) or not spec.get("correct_order"):
            issues.append("missing_correct_order")
            score -= 16
    elif subtype == "relationship_link":
        if not isinstance(spec.get("left_nodes"), list) or len(spec.get("left_nodes") or []) < 3:
            issues.append("left_nodes_too_few")
            score -= 14
        if not isinstance(spec.get("right_nodes"), list) or len(spec.get("right_nodes") or []) < 3:
            issues.append("right_nodes_too_few")
            score -= 14
        if not isinstance(spec.get("correct_links"), list) or not spec.get("correct_links"):
            issues.append("missing_correct_links")
            score -= 16
    score = max(0, min(100, score))
    return score, issues, metrics


def enforce_interactive_game_quality_gate(
    *,
    payload: dict[str, Any],
    model_name: str | None,
    generation_trace: dict[str, Any] | None = None,
) -> None:
    score, issues, metrics = evaluate_interactive_game_payload_quality(payload)
    threshold = _env_positive_int("INTERACTIVE_GAME_QUALITY_THRESHOLD", 70)
    logger.info(
        "interactive_games quality metadata: model=%s score=%s threshold=%s issues=%s metrics=%s trace=%s",
        model_name,
        score,
        threshold,
        ",".join(issues),
        metrics,
        generation_trace or {},
    )
    if score >= threshold:
        return
    details = {
        "interactive_game_quality_score": score,
        "interactive_game_quality_threshold": threshold,
        "interactive_game_quality_issues": issues,
        "interactive_game_quality_metrics": metrics,
    }
    if generation_trace:
        details.update(generation_trace)
    raise APIException(
        status_code=422,
        error_code=ErrorCode.INVALID_INPUT,
        message="Interactive game payload failed quality checks.",
        details=details,
    )


def raise_interactive_game_error(
    *,
    message: str,
    phase: str,
    failure_reason: str,
    model_name: str | None,
) -> None:
    raise_generation_error(
        status_code=400,
        error_code=ErrorCode.INVALID_INPUT,
        message=message,
        card_id="interactive_games",
        model=model_name,
        phase=phase,
        failure_reason=failure_reason,
        retryable=False,
    )
