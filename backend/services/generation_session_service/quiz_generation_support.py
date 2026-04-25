from __future__ import annotations

import json
import logging
import os
from typing import Any

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from utils.exceptions import APIException, ErrorCode

from .quiz_normalizer import evaluate_quiz_payload_quality
from .tool_content_builder_ai import generate_card_json_payload_with_meta
from .tool_content_builder_support import raise_generation_error

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


def _env_positive_float(name: str, default: float | None = None) -> float | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def _requested_question_count(config: dict[str, Any]) -> int:
    raw = config.get("question_count", config.get("count", 5))
    try:
        value = int(raw)
        return max(1, value)
    except (TypeError, ValueError):
        return 5


def _resolve_question_type(config: dict[str, Any]) -> str:
    return str(config.get("question_type") or "single").strip().lower() or "single"


def _resolve_style_tags(config: dict[str, Any]) -> list[str]:
    raw = config.get("style_tags") if isinstance(config.get("style_tags"), list) else []
    return [str(tag).strip() for tag in raw if str(tag).strip()]


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


def _likely_truncated(tokens_used: int, max_tokens: int) -> bool:
    return bool(max_tokens > 0 and tokens_used >= int(max_tokens * 0.95))


def _augment_quiz_exception(
    exc: APIException,
    *,
    model_name: str | None,
    max_tokens: int,
    rag_snippet_count: int,
    timeout_seconds: float | None,
    quality_score: int | None = None,
    quality_metrics: dict[str, Any] | None = None,
) -> APIException:
    details = dict(exc.details or {})
    resolved_model = str(
        details.get("resolved_model")
        or details.get("requested_model")
        or model_name
        or ai_service.large_model
        or ""
    )
    details.setdefault("card_id", "interactive_quick_quiz")
    details["resolved_model"] = resolved_model or "unknown"
    details["max_tokens"] = max_tokens
    details["rag_snippet_count"] = rag_snippet_count
    if timeout_seconds is not None:
        details["timeout_seconds"] = timeout_seconds
    if quality_score is not None:
        details["quiz_quality_score"] = quality_score
    if quality_metrics is not None:
        details["quiz_quality_metrics"] = quality_metrics
    return APIException(
        status_code=exc.status_code,
        error_code=exc.error_code,
        message=exc.message,
        details=details,
        retryable=exc.retryable,
    )


def resolve_quiz_model() -> str | None:
    explicit = str(os.getenv("QUIZ_MODEL", "") or "").strip()
    if explicit:
        return explicit
    quality_model = str(os.getenv("QUALITY_MODEL", "") or "").strip()
    if quality_model:
        return quality_model
    return ai_service.large_model


def resolve_quiz_review_model() -> str | None:
    explicit = str(os.getenv("QUIZ_REVIEW_MODEL", "") or "").strip()
    if explicit:
        return explicit
    return resolve_quiz_model()


def resolve_quiz_max_tokens() -> int:
    return _env_positive_int("QUIZ_MAX_TOKENS", 3800)


def resolve_quiz_review_max_tokens() -> int:
    return _env_positive_int("QUIZ_REVIEW_MAX_TOKENS", 4200)


def resolve_quiz_timeout_seconds() -> float | None:
    return _env_positive_float("QUIZ_GENERATION_TIMEOUT_SECONDS", 480.0)


def resolve_quiz_review_timeout_seconds() -> float | None:
    return _env_positive_float("QUIZ_REVIEW_TIMEOUT_SECONDS", resolve_quiz_timeout_seconds())


def resolve_quiz_refine_timeout_seconds() -> float | None:
    return _env_positive_float("QUIZ_REFINE_TIMEOUT_SECONDS", 300.0)


def build_quiz_generation_prompt(
    *,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> str:
    scope = str(config.get("scope") or config.get("question_focus") or "当前知识点").strip()
    question_count = _requested_question_count(config)
    difficulty = str(config.get("difficulty") or "medium").strip()
    question_type = _resolve_question_type(config)
    style_tags = _resolve_style_tags(config)
    style_line = "、".join(style_tags) if style_tags else "无特别风格标签"
    humorous = bool(
        config.get("humorous_distractors")
        or "加入幽默干扰项" in style_tags
    )
    schema_hint = {
        "title": "课堂小测标题",
        "scope": scope,
        "questions": [
            {
                "id": "q-1",
                "question": "题干短句，直接可课堂使用",
                "options": ["选项A", "选项B", "选项C", "选项D"],
                "answer": "选项A",
                "explanation": "用1到3句解释正确原因与常见误区。",
            }
        ],
    }
    mode_note = (
        "The requested question_type is not the v1 optimized path. Still return high-quality single-choice questions."
        if question_type != "single"
        else "Return high-quality single-choice questions."
    )
    prompt_lines = [
        "You are an expert classroom quiz designer.",
        "Return ONLY one JSON object. Do not include markdown fences or commentary.",
        f"Scope/topic: {scope}",
        f"Target question count: {question_count}",
        f"Difficulty: {difficulty}",
        f"Requested question_type: {question_type}",
        f"Style tags: {style_line}",
        f"Humorous distractors requested: {'yes' if humorous else 'no'}",
        f"Source artifact hint: {source_hint or 'none'}",
        f"Evidence snippets: {json.dumps(rag_snippets, ensure_ascii=False)}",
        "Generation requirements:",
        "- Produce exactly the requested number of questions unless the evidence is unusable.",
        "- Each question must cover a different sub-point, misconception, example, or application angle.",
        "- Every question must have exactly 4 non-empty, mutually distinct options.",
        "- The correct answer must match one option text exactly.",
        "- Every explanation must contain 1 to 3 concise sentences and mention why the correct option wins.",
        "- Keep question text concise and classroom-ready; avoid long paragraph stems.",
        "- Distractors must look plausible but be clearly weaker than the correct answer.",
        "- Do not use lazy distractor patterns such as '以上皆是', '以上皆非', or combined-answer shortcuts.",
        "- Remove filenames, page numbers, chunk markers, code fragments, and prompt/system residue.",
        f"- {mode_note}",
        f"Expected JSON shape example: {json.dumps(schema_hint, ensure_ascii=False)}",
    ]
    return "\n".join(prompt_lines) + "\n"


def summarize_quiz_review_payload(draft_payload: dict[str, Any]) -> dict[str, Any]:
    questions: list[dict[str, Any]] = []
    for item in draft_payload.get("questions") or []:
        if not isinstance(item, dict):
            continue
        questions.append(
            {
                "id": str(item.get("id") or "").strip()[:48],
                "question": str(item.get("question") or item.get("stem") or "").strip()[:140],
                "options": [
                    str(option).strip()[:60]
                    for option in (item.get("options") or [])
                    if str(option).strip()
                ][:4],
                "answer": item.get("answer"),
                "explanation": str(item.get("explanation") or "").strip()[:180],
            }
        )
    return {
        "title": str(draft_payload.get("title") or "").strip()[:64],
        "scope": str(draft_payload.get("scope") or "").strip()[:120],
        "question_count": len(questions),
        "questions": questions,
    }


def build_quiz_review_prompt(
    *,
    config: dict[str, Any],
    draft_payload: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> str:
    requested_question_count = _requested_question_count(config)
    snapshot = summarize_quiz_review_payload(draft_payload)
    score, issues, metrics = evaluate_quiz_payload_quality(
        draft_payload,
        requested_question_count=requested_question_count,
    )
    return (
        "You are the reviewer and rewriter for a classroom quiz artifact.\n"
        "Return ONLY one JSON object. Do not include markdown fences or commentary.\n"
        "This is a formal artifact rewrite, not a chat reply.\n"
        f"User config: {json.dumps(config, ensure_ascii=False)}\n"
        f"Source artifact hint: {source_hint or 'none'}\n"
        f"Evidence snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        f"Draft compact snapshot: {json.dumps(snapshot, ensure_ascii=False)}\n"
        f"Initial quality score: {score}\n"
        f"Initial quality issues: {json.dumps(issues, ensure_ascii=False)}\n"
        f"Initial quality metrics: {json.dumps(metrics, ensure_ascii=False)}\n"
        "Rewrite goals:\n"
        f"- Keep at least {requested_question_count} questions unless the draft is unusable.\n"
        "- Preserve question ids for surviving questions.\n"
        "- Rewrite weak distractors so each question has four plausible, distinct options.\n"
        "- Fix vague stems, overlong stems, and generic explanations.\n"
        "- Increase coverage breadth so the quiz spans multiple sub-points or misconceptions.\n"
        "- Remove source residue, filenames, chunk markers, page numbers, and prompt noise.\n"
        "- Keep titles short and product-friendly.\n"
        "- Keep the artifact canonical JSON with shape: {title, scope, questions:[{id,question,options,answer,explanation}]}\n"
    )


async def generate_quiz_reviewed_payload(
    *,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
    build_prompt: Any | None = None,
) -> tuple[dict[str, Any], str, dict[str, Any]]:
    del build_prompt
    question_type = _resolve_question_type(config)
    if question_type != "single":
        logger.info(
            "interactive_quick_quiz received non-single question_type=%s; using single-choice optimized generation path",
            question_type,
        )

    generation_model = resolve_quiz_model()
    generation_max_tokens = resolve_quiz_max_tokens()
    generation_timeout = resolve_quiz_timeout_seconds()
    review_model = resolve_quiz_review_model()
    review_max_tokens = resolve_quiz_review_max_tokens()
    review_timeout = resolve_quiz_review_timeout_seconds()
    rag_snippet_count = len(rag_snippets)

    try:
        draft_payload, model_name, generation_meta = await generate_card_json_payload_with_meta(
            prompt=build_quiz_generation_prompt(
                config=config,
                rag_snippets=rag_snippets,
                source_hint=source_hint,
            ),
            card_id="interactive_quick_quiz",
            phase="generate",
            rag_snippets=rag_snippets,
            max_tokens=generation_max_tokens,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            model=generation_model,
            timeout_seconds_override=generation_timeout,
        )
    except APIException as exc:
        raise _augment_quiz_exception(
            exc,
            model_name=generation_model,
            max_tokens=generation_max_tokens,
            rag_snippet_count=rag_snippet_count,
            timeout_seconds=generation_timeout,
        ) from exc

    draft_tokens_used = _extract_tokens_used(generation_meta)
    draft_quality_score, draft_quality_issues, draft_quality_metrics = evaluate_quiz_payload_quality(
        draft_payload,
        requested_question_count=_requested_question_count(config),
    )
    logger.info(
        "interactive_quick_quiz generation metadata: model=%s max_tokens=%s tokens_used=%s likely_truncated=%s timeout_seconds=%s rag_snippet_count=%s score=%s issues=%s metrics=%s",
        model_name,
        generation_max_tokens,
        draft_tokens_used,
        _likely_truncated(draft_tokens_used, generation_max_tokens),
        generation_timeout,
        rag_snippet_count,
        draft_quality_score,
        ",".join(draft_quality_issues),
        draft_quality_metrics,
    )

    try:
        reviewed_payload, review_model_name, review_meta = await generate_card_json_payload_with_meta(
            prompt=build_quiz_review_prompt(
                config=config,
                draft_payload=draft_payload,
                rag_snippets=rag_snippets,
                source_hint=source_hint,
            ),
            card_id="interactive_quick_quiz",
            phase="review",
            rag_snippets=rag_snippets,
            max_tokens=review_max_tokens,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            model=review_model,
            timeout_seconds_override=review_timeout,
        )
    except APIException as exc:
        raise _augment_quiz_exception(
            exc,
            model_name=review_model or model_name,
            max_tokens=review_max_tokens,
            rag_snippet_count=rag_snippet_count,
            timeout_seconds=review_timeout,
            quality_score=draft_quality_score,
            quality_metrics=draft_quality_metrics,
        ) from exc

    reviewed_tokens_used = _extract_tokens_used(review_meta)
    reviewed_quality_score, reviewed_quality_issues, reviewed_quality_metrics = (
        evaluate_quiz_payload_quality(
            reviewed_payload,
            requested_question_count=_requested_question_count(config),
        )
    )
    resolved_model = review_model_name or model_name
    logger.info(
        "interactive_quick_quiz review metadata: model=%s max_tokens=%s tokens_used=%s likely_truncated=%s timeout_seconds=%s rag_snippet_count=%s score=%s issues=%s metrics=%s",
        resolved_model,
        review_max_tokens,
        reviewed_tokens_used,
        _likely_truncated(reviewed_tokens_used, review_max_tokens),
        review_timeout,
        rag_snippet_count,
        reviewed_quality_score,
        ",".join(reviewed_quality_issues),
        reviewed_quality_metrics,
    )
    trace = {
        "resolved_model": resolved_model,
        "generation_model": model_name,
        "generation_max_tokens": generation_max_tokens,
        "generation_tokens_used": draft_tokens_used,
        "generation_likely_truncated": _likely_truncated(
            draft_tokens_used, generation_max_tokens
        ),
        "generation_timeout_seconds": generation_timeout,
        "review_model": review_model_name or resolved_model,
        "review_max_tokens": review_max_tokens,
        "review_tokens_used": reviewed_tokens_used,
        "review_likely_truncated": _likely_truncated(
            reviewed_tokens_used, review_max_tokens
        ),
        "review_timeout_seconds": review_timeout,
        "rag_snippet_count": rag_snippet_count,
        "draft_quality_score": draft_quality_score,
        "draft_quality_metrics": draft_quality_metrics,
        "review_quality_score": reviewed_quality_score,
        "review_quality_metrics": reviewed_quality_metrics,
        "question_type_requested": question_type,
    }
    return reviewed_payload, resolved_model, trace


def enforce_quiz_quality_gate(
    *,
    payload: dict[str, Any],
    config: dict[str, Any],
    model_name: str | None,
    generation_trace: dict[str, Any] | None = None,
) -> None:
    requested_question_count = config.get("question_count", config.get("count"))
    try:
        requested_value = int(requested_question_count) if requested_question_count is not None else None
    except (TypeError, ValueError):
        requested_value = None
    threshold = _env_positive_int("QUIZ_QUALITY_THRESHOLD", 74)
    score, issues, metrics = evaluate_quiz_payload_quality(
        payload,
        requested_question_count=requested_value,
    )
    logger.info(
        "interactive_quick_quiz quality metadata: model=%s score=%s threshold=%s issues=%s metrics=%s trace=%s",
        model_name,
        score,
        threshold,
        ",".join(issues),
        metrics,
        generation_trace or {},
    )
    if score >= threshold:
        return
    extra = {
        "quiz_quality_score": score,
        "quiz_quality_threshold": threshold,
        "quiz_quality_metrics": metrics,
    }
    if generation_trace:
        extra.update(
            {
                "resolved_model": generation_trace.get("resolved_model"),
                "max_tokens": generation_trace.get("review_max_tokens")
                or generation_trace.get("generation_max_tokens"),
                "rag_snippet_count": generation_trace.get("rag_snippet_count", 0),
            }
        )
    raise_generation_error(
        status_code=422,
        error_code=ErrorCode.INVALID_INPUT,
        message="Generated quiz payload failed quality score checks.",
        card_id="interactive_quick_quiz",
        model=model_name,
        phase="quality_gate",
        failure_reason="quiz_quality_low:" + ",".join(issues[:6]),
        retryable=False,
        extra=extra,
    )
