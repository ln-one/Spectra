"""Interactive game structured/chat refine."""

from __future__ import annotations

import copy
import json
from typing import Any

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from utils.exceptions import APIException, ErrorCode

from ..interactive_game_generation_support import (
    enforce_interactive_game_quality_gate,
    resolve_interactive_game_refine_model,
    resolve_interactive_game_refine_timeout_seconds,
)
from ..interactive_game_normalizer import normalize_interactive_game_v2_payload
from ..tool_content_builder_support import validate_card_payload
from .common import _load_rag_snippets


def _normalize_rag_snippet(text: str) -> str:
    return " ".join(str(text or "").replace("\r", " ").replace("\n", " ").split())[:200]


async def _load_refine_rag_snippets(
    *,
    project_id: str,
    query: str,
    rag_source_ids: list[str] | None,
) -> list[str]:
    raw = await _load_rag_snippets(
        project_id=project_id,
        query=query,
        rag_source_ids=rag_source_ids,
    )
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in raw:
        snippet = _normalize_rag_snippet(item)
        if len(snippet) < 8:
            continue
        key = snippet.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(snippet)
    return cleaned[:2]


def _build_compact_snapshot(current_content: dict[str, Any]) -> dict[str, Any]:
    spec = current_content.get("spec") if isinstance(current_content.get("spec"), dict) else {}
    return {
        "schema_id": current_content.get("schema_id"),
        "subtype": current_content.get("subtype"),
        "title": current_content.get("title"),
        "summary": current_content.get("summary"),
        "subtitle": current_content.get("subtitle"),
        "teaching_goal": current_content.get("teaching_goal"),
        "teacher_notes": current_content.get("teacher_notes") or [],
        "instructions": current_content.get("instructions") or [],
        "score_policy": current_content.get("score_policy") or {},
        "completion_rule": current_content.get("completion_rule") or {},
        "spec": spec,
    }


async def _rewrite_full_game(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    compact_snapshot = _build_compact_snapshot(current_content)
    rag_snippets = await _load_refine_rag_snippets(
        project_id=project_id,
        query=message
        or str(current_content.get("title") or current_content.get("teaching_goal") or "互动游戏微调"),
        rag_source_ids=rag_source_ids,
    )
    prompt = (
        "You are rewriting an existing classroom interactive game artifact.\n"
        "Return ONLY one JSON object. Do not include markdown fences or commentary.\n"
        "This is a full artifact rewrite, not a chat reply.\n"
        f"Current compact snapshot: {json.dumps(compact_snapshot, ensure_ascii=False)}\n"
        f"User refinement instruction: {message}\n"
        f"Optional evidence snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "Rewrite requirements:\n"
        "- Keep the same subtype unless the instruction explicitly requests a different allowed subtype.\n"
        "- Stay inside operational classroom mini-game semantics; never drift into quiz questions or static explanation pages.\n"
        "- Improve pacing, feedback, classroom fit, instructions, and teacher notes as requested.\n"
        "- Return the full artifact structure with keys: subtype,title,summary,subtitle,teaching_goal,teacher_notes,instructions,spec,score_policy,completion_rule.\n"
    )
    result = await ai_service.generate(
        prompt=prompt,
        model=resolve_interactive_game_refine_model(),
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        has_rag_context=bool(rag_snippets),
        max_tokens=2600,
        response_format={"type": "json_object"},
        timeout_seconds_override=resolve_interactive_game_refine_timeout_seconds(),
    )
    raw_payload = str(result.get("content") or "").strip()
    if not raw_payload:
        raise APIException(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="互动游戏微调返回为空，请重试。",
        )
    parsed = json.loads(raw_payload)
    if not isinstance(parsed, dict):
        raise APIException(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="互动游戏微调未返回合法对象。",
        )
    normalized = normalize_interactive_game_v2_payload(parsed, current_content | config)
    validate_card_payload("interactive_games", normalized)
    enforce_interactive_game_quality_gate(
        payload=normalized,
        model_name=str(result.get("model") or "") or resolve_interactive_game_refine_model(),
        generation_trace=None,
    )
    return normalized


def _apply_local_structured_update(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
) -> dict[str, Any] | None:
    operation = str(config.get("operation") or "").strip().lower()
    if not operation:
        return None
    updated = copy.deepcopy(current_content)
    if operation == "update_title":
        updated["title"] = config.get("title") or message
    elif operation == "update_teaching_goal":
        updated["teaching_goal"] = config.get("teaching_goal") or message
    elif operation == "update_instructions":
        updated["instructions"] = config.get("instructions") or [message]
    elif operation == "update_teacher_notes":
        updated["teacher_notes"] = config.get("teacher_notes") or [message]
    elif operation == "update_feedback_copy":
        spec = dict(updated.get("spec") or {})
        feedback_copy = dict(spec.get("feedback_copy") or {})
        feedback_copy["correct"] = config.get("correct_feedback") or feedback_copy.get("correct")
        feedback_copy["incorrect"] = config.get("incorrect_feedback") or message or feedback_copy.get("incorrect")
        spec["feedback_copy"] = feedback_copy
        updated["spec"] = spec
    elif operation == "update_completion_rule":
        completion_rule = dict(updated.get("completion_rule") or {})
        completion_rule.update(config.get("completion_rule") or {})
        if message and not completion_rule.get("success_copy"):
            completion_rule["success_copy"] = message
        updated["completion_rule"] = completion_rule
    elif operation == "update_score_policy":
        score_policy = dict(updated.get("score_policy") or {})
        score_policy.update(config.get("score_policy") or {})
        updated["score_policy"] = score_policy
    elif operation == "adjust_difficulty":
        difficulty = str(config.get("difficulty_shift") or "").strip().lower()
        instructions = list(updated.get("instructions") or [])
        if difficulty == "simpler":
            instructions.append("减少干扰项，让学生先完成基础配对。")
            updated["summary"] = f"{updated.get('summary') or ''} 版本更适合先做基础掌握。".strip()
        elif difficulty == "harder":
            instructions.append("提高干扰度，要求学生在更短时间内完成。")
            score_policy = dict(updated.get("score_policy") or {})
            score_policy["timer_seconds"] = int(score_policy.get("timer_seconds") or 90)
            score_policy["timer_seconds"] = max(30, score_policy["timer_seconds"] - 15)
            updated["score_policy"] = score_policy
            updated["summary"] = f"{updated.get('summary') or ''} 已调整为更有挑战的课堂节奏。".strip()
        updated["instructions"] = instructions
    else:
        return None
    return normalize_interactive_game_v2_payload(updated, updated)


async def refine_interactive_game_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    locally_updated = _apply_local_structured_update(
        current_content=current_content,
        message=message,
        config=config,
    )
    if locally_updated is not None:
        validate_card_payload("interactive_games", locally_updated)
        enforce_interactive_game_quality_gate(
            payload=locally_updated,
            model_name=None,
            generation_trace=None,
        )
        return locally_updated

    return await _rewrite_full_game(
        current_content=current_content,
        message=message,
        config=config,
        project_id=project_id,
        rag_source_ids=rag_source_ids,
    )
