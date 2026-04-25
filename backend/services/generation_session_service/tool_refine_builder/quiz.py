"""Quiz structured refine."""

from __future__ import annotations

import copy
import json
import logging
import os
import re
from typing import Any

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from utils.exceptions import APIException, ErrorCode

from ..quiz_generation_support import (
    resolve_quiz_refine_timeout_seconds,
)
from ..quiz_normalizer import evaluate_quiz_payload_quality
from ..studio_card_payload_normalizers import normalize_generated_card_payload
from ..tool_content_builder_support import validate_card_payload
from .common import _load_rag_snippets

logger = logging.getLogger(__name__)


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def _resolve_quiz_refine_model() -> str | None:
    explicit = str(os.getenv("QUIZ_REFINE_MODEL", "") or "").strip()
    if explicit:
        return explicit
    return ai_service.large_model


def _resolve_quiz_refine_max_tokens() -> int:
    return _env_positive_int("QUIZ_REFINE_MAX_TOKENS", 3400)


def _normalize_rag_snippet(text: str) -> str:
    candidate = str(text or "")
    candidate = re.sub(r"\s+", " ", candidate.replace("\r", " ").replace("\n", " ")).strip()
    candidate = re.sub(r"\[[^\]]+\]", " ", candidate)
    candidate = re.sub(r"\b[\w.\-]+\.(?:pdf|pptx?|docx?|md|txt)\b", " ", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bchunk\s*#?\s*\d+\b", " ", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bpage\s*#?\s*\d+\b", " ", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\s+", " ", candidate).strip(" -:;,.")
    return candidate


async def _load_refine_rag_snippets(
    *,
    project_id: str,
    query: str,
    rag_source_ids: list[str] | None,
) -> list[str]:
    raw_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=query,
        rag_source_ids=rag_source_ids,
    )
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw_snippet in raw_snippets:
        snippet = _normalize_rag_snippet(raw_snippet)
        if len(snippet) < 12:
            continue
        dedupe_key = re.sub(r"\s+", "", snippet.lower())[:160]
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        cleaned.append(snippet[:260])
    return cleaned[:4]


def _resolve_target_id(current_content: dict[str, Any], config: dict[str, Any]) -> str:
    selection_anchor = (
        config.get("selection_anchor")
        if isinstance(config.get("selection_anchor"), dict)
        else None
    )
    questions = [
        item for item in (current_content.get("questions") or []) if isinstance(item, dict)
    ]
    return str(
        (selection_anchor or {}).get("anchor_id")
        or config.get("current_question_id")
        or config.get("question_id")
        or (questions[0].get("id") if questions else "")
        or "q-1"
    )


_COUNT_CN_MAP = {
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10,
}


def _parse_explicit_requested_question_count(
    message: str,
    config: dict[str, Any],
    current_content: dict[str, Any],
) -> int | None:
    raw_message = str(message or "").strip()
    if raw_message:
        digit_match = re.search(r"(\d{1,3})\s*道题", raw_message)
        if digit_match:
            try:
                value = int(digit_match.group(1))
                if value > 0:
                    return value
            except ValueError:
                pass
        cn_match = re.search(r"([一二两三四五六七八九十]{1,3})\s*道题", raw_message)
        if cn_match:
            token = cn_match.group(1)
            if token == "十":
                return 10
            if token.startswith("十") and len(token) == 2:
                return 10 + _COUNT_CN_MAP.get(token[1], 0)
            if token.endswith("十") and len(token) == 2:
                return _COUNT_CN_MAP.get(token[0], 0) * 10
            if len(token) == 3 and token[1] == "十":
                return _COUNT_CN_MAP.get(token[0], 0) * 10 + _COUNT_CN_MAP.get(token[2], 0)
            return _COUNT_CN_MAP.get(token)

    for candidate in (
        config.get("question_count"),
        config.get("count"),
        current_content.get("question_count"),
    ):
        try:
            value = int(candidate)
            if value > 0:
                return value
        except (TypeError, ValueError):
            continue
    return None


def _build_compact_snapshot(
    current_content: dict[str, Any],
    *,
    focus_question_id: str | None,
    config: dict[str, Any],
    requested_question_count: int | None,
) -> dict[str, Any]:
    questions_snapshot = []
    for item in current_content.get("questions") or []:
        if not isinstance(item, dict):
            continue
        question_id = str(item.get("id") or "").strip()
        question_payload = {
            "id": question_id,
            "question": str(item.get("question") or "").strip()[:160],
            "options": [
                str(option).strip()[:80]
                for option in (item.get("options") or [])
                if str(option).strip()
            ][:6],
            "answer": item.get("answer"),
            "explanation": str(item.get("explanation") or "").strip()[:220],
        }
        questions_snapshot.append(question_payload)
    return {
        "title": str(current_content.get("title") or "").strip()[:64],
        "scope": str(current_content.get("scope") or "").strip()[:120],
        "question_count": len(questions_snapshot),
        "requested_question_count": requested_question_count,
        "difficulty": str(config.get("difficulty") or "").strip() or None,
        "question_type": str(config.get("question_type") or "").strip() or None,
        "style_tags": [
            str(tag).strip()
            for tag in (config.get("style_tags") or [])
            if str(tag).strip()
        ][:8],
        "focus_question_id": focus_question_id,
        "questions": questions_snapshot,
    }


async def _rewrite_full_quiz(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    focus_question_id = _resolve_target_id(current_content, config)
    requested_question_count = _parse_explicit_requested_question_count(
        message,
        config,
        current_content,
    )
    compact_snapshot = _build_compact_snapshot(
        current_content,
        focus_question_id=focus_question_id,
        config=config,
        requested_question_count=requested_question_count,
    )
    rag_snippets = await _load_refine_rag_snippets(
        project_id=project_id,
        query=message or str(current_content.get("scope") or current_content.get("title") or "随堂小测改写"),
        rag_source_ids=rag_source_ids,
    )
    exact_count_requirement = (
        f"- The user explicitly requested {requested_question_count} questions. Return exactly {requested_question_count} questions unless the source is unusable.\n"
        if requested_question_count
        else ""
    )
    prompt = (
        "You are rewriting an existing classroom quiz artifact.\n"
        "Return ONLY one JSON object. Do not include markdown fences or commentary.\n"
        "This is a full artifact rewrite, not a chat reply.\n"
        f"User refinement instruction: {message}\n"
        f"Compact quiz snapshot: {json.dumps(compact_snapshot, ensure_ascii=False)}\n"
        f"Optional evidence snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "Rewrite requirements:\n"
        "- Rewrite from the current quiz first; evidence snippets are supporting signals, not the main structure.\n"
        "- Keep or improve total question count; do not obviously shrink the quiz.\n"
        f"{exact_count_requirement}"
        "- Preserve or improve topic coverage, distractor quality, and explanation completeness.\n"
        "- Keep question ids stable when rewriting existing questions whenever possible.\n"
        "- If the instruction focuses on one current question, strengthen that question first but still return the full quiz artifact.\n"
        "- Every question should feel classroom-ready, concise, and immediately usable.\n"
        "- Explanations should be teaching-ready and specific, not generic filler.\n"
        "- Remove prompt noise, source traces, filenames, chunk markers, page markers, and renderer/runtime metadata.\n"
        "- Never return a chat reply, prose explanation, or partial patch.\n"
        "- Return a JSON object with shape: {title, scope, questions:[{id,question,options,answer,explanation}]}\n"
    )
    result = await ai_service.generate(
        prompt=prompt,
        model=_resolve_quiz_refine_model(),
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        has_rag_context=bool(rag_snippets),
        max_tokens=_resolve_quiz_refine_max_tokens(),
        response_format={"type": "json_object"},
        timeout_seconds_override=resolve_quiz_refine_timeout_seconds(),
    )
    raw_payload = str(result.get("content") or "").strip()
    if not raw_payload:
        raise APIException(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="Quiz 微调返回为空，请重试。",
        )
    parsed = json.loads(raw_payload)
    if not isinstance(parsed, dict):
        raise APIException(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="Quiz 微调未返回合法对象。",
        )
    normalized = normalize_generated_card_payload(
        card_id="interactive_quick_quiz",
        payload=parsed,
        config={
            **current_content,
            **config,
            **(
                {"question_count": requested_question_count}
                if requested_question_count
                else {}
            ),
        },
    )
    validate_card_payload("interactive_quick_quiz", normalized)
    baseline_count = len(
        [item for item in (current_content.get("questions") or []) if isinstance(item, dict)]
    )
    score, issues, metrics = evaluate_quiz_payload_quality(
        normalized,
        requested_question_count=requested_question_count,
        baseline_question_count=baseline_count,
    )
    threshold = _env_positive_int("QUIZ_REFINE_QUALITY_THRESHOLD", 68)
    logger.info(
        "interactive_quick_quiz refine quality metadata: score=%s threshold=%s issues=%s metrics=%s",
        score,
        threshold,
        ",".join(issues),
        metrics,
    )
    if score < threshold:
        raise APIException(
            status_code=422,
            error_code=ErrorCode.INVALID_INPUT,
            message="Quiz 微调结果出现明显退化，请调整指令后重试。",
            details={
                "quiz_quality_score": score,
                "quiz_quality_threshold": threshold,
                "quiz_quality_issues": issues,
                "quiz_quality_metrics": metrics,
            },
        )
    return normalized


def _resolve_target_question(
    questions: list[dict[str, Any]],
    target_id: str,
) -> dict[str, Any] | None:
    for question in questions:
        if str(question.get("id") or "") == target_id:
            return question
    return None


async def refine_quiz_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    if str(config.get("chat_refine_scope") or "").strip() == "full_quiz":
        return await _rewrite_full_quiz(
            current_content=current_content,
            message=message,
            config=config,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )

    updated = copy.deepcopy(current_content)
    questions = [
        dict(question)
        for question in (updated.get("questions") or [])
        if isinstance(question, dict)
    ]
    if not questions:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前小测没有可精修题目，请刷新后重试。",
        )

    target_id = _resolve_target_id(updated, config)
    target_question = _resolve_target_question(questions, target_id)
    if target_question is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前题目已过期，请刷新后重试。",
        )
    operation = str(config.get("operation") or "rewrite").strip() or "rewrite"
    if operation == "direct_edit_question":
        edited_question = (
            config.get("edited_question")
            if isinstance(config.get("edited_question"), dict)
            else None
        )
        if not edited_question:
            raise APIException(
                status_code=422,
                error_code=ErrorCode.INVALID_INPUT,
                message="当前题编辑内容无效，请刷新后重试。",
            )
        target_question["id"] = str(
            edited_question.get("id") or target_question.get("id") or target_id
        ).strip() or target_id
        target_question["question"] = str(edited_question.get("question") or "").strip()
        target_question["options"] = [
            str(option).strip()
            for option in (edited_question.get("options") or [])
            if str(option).strip()
        ]
        target_question["answer"] = edited_question.get("answer")
        target_question["explanation"] = str(
            edited_question.get("explanation") or ""
        ).strip()
    else:
        rag_snippets = await _load_refine_rag_snippets(
            project_id=project_id,
            query=message or str(updated.get("scope") or updated.get("title") or "题目改写"),
            rag_source_ids=rag_source_ids,
        )

        if operation == "regenerate_explanation":
            target_question["explanation"] = (
                rag_snippets[0] if rag_snippets else "已根据当前要求补充解析。"
            )
        elif operation == "replace_distractors":
            target_question["options"] = [
                "概念定义",
                "典型误区",
                "迁移应用",
                "边界条件",
            ]
            target_question["answer"] = "概念定义"
            target_question["explanation"] = (
                rag_snippets[0] if rag_snippets else "已替换干扰项并保留正确指向。"
            )
        elif operation == "adjust_difficulty":
            target_question["question"] = str(message or target_question.get("question") or "").strip()
            target_question["explanation"] = (
                rag_snippets[0] if rag_snippets else "已按新难度要求重写当前题。"
            )
        else:
            target_question["question"] = str(
                message or f"请围绕 {updated.get('scope') or '当前知识点'} 重新出题"
            ).strip()
            target_question["options"] = [
                "概念定义",
                "典型误区",
                "迁移应用",
                "边界条件",
            ]
            target_question["answer"] = "概念定义"
            target_question["explanation"] = (
                rag_snippets[0] if rag_snippets else "已根据 refine 指令重写题目与解析。"
            )

    updated["kind"] = "quiz"
    updated["questions"] = questions
    updated["question_count"] = len(questions)
    return normalize_generated_card_payload(
        card_id="interactive_quick_quiz",
        payload=updated,
        config=config,
    )
