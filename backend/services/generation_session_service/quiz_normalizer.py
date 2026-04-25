from __future__ import annotations

import json
import re
from typing import Any

MAX_QUIZ_TITLE_LENGTH = 48
MAX_SCOPE_LENGTH = 120
MAX_QUESTION_LENGTH = 120
MAX_EXPLANATION_LENGTH = 220
MAX_OPTION_LENGTH = 72

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SPACE_RE = re.compile(r"\s+")
_SOURCE_PREFIX_RE = re.compile(r"^\s*\[来源:[^\]]+\]\s*", flags=re.IGNORECASE)
_NOISE_RE = re.compile(
    r"(?:\bjson\b|\bschema\b|\bchunk\b|\bmarkdown\b|资料显示|原文提到|来源[:：]|见第?\s*\d+\s*页)",
    flags=re.IGNORECASE,
)
_OPTION_KEY_RE = re.compile(r"^[A-F][\.\)、:：\s-]*", flags=re.IGNORECASE)
_GENERIC_EXPLANATION_RE = re.compile(
    r"(?:用于考查|考查学生|本题考查|帮助理解|巩固理解|答案正确|因为.*正确)",
    flags=re.IGNORECASE,
)
_WEAK_DISTRACTOR_RE = re.compile(
    r"(?:以上皆是|以上皆非|都对|都不对|a和c|a与c|b和d|b与d)",
    flags=re.IGNORECASE,
)


def _normalize_text(value: Any) -> str:
    text = str(value or "")
    text = _CONTROL_RE.sub("", text)
    text = text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    text = _SOURCE_PREFIX_RE.sub("", text)
    text = _NOISE_RE.sub("", text)
    text = _SPACE_RE.sub(" ", text).strip()
    text = text.lstrip("：:，,；;。、 ")
    return text


def _trim_text(text: str, limit: int) -> str:
    candidate = text.strip()
    if len(candidate) <= limit:
        return candidate
    return candidate[: limit - 1].rstrip(" ，。；：、,.;:!?！？-") + "…"


def sanitize_quiz_title(value: Any) -> str:
    return _trim_text(_normalize_text(value), MAX_QUIZ_TITLE_LENGTH)


def sanitize_quiz_scope(value: Any) -> str:
    return _trim_text(_normalize_text(value), MAX_SCOPE_LENGTH)


def _normalize_question_text(value: Any) -> str:
    text = _trim_text(_normalize_text(value), MAX_QUESTION_LENGTH)
    return text.strip(" -：:，,；;。、")


def _normalize_explanation_text(value: Any) -> str:
    normalized = _trim_text(_normalize_text(value), MAX_EXPLANATION_LENGTH)
    normalized = re.sub(r"^(?:答案[:：]\s*)", "", normalized, flags=re.IGNORECASE)
    return normalized


def _normalize_option_text(value: Any) -> str:
    text = value
    if isinstance(value, dict):
        text = value.get("text") or value.get("label") or value.get("content") or ""
    normalized = _trim_text(_normalize_text(text), MAX_OPTION_LENGTH)
    normalized = _OPTION_KEY_RE.sub("", normalized).strip()
    return normalized


def _stable_question_id(index: int, raw_id: Any = None) -> str:
    candidate = re.sub(r"[^\w\-]+", "-", str(raw_id or "").strip()).strip("-").lower()
    if candidate:
        return candidate[:48]
    return f"q-{index}"


def _normalize_single_answer(
    answer: Any,
    options: list[str],
) -> str | list[str] | None:
    if isinstance(answer, str):
        candidate = answer.strip()
        if not candidate:
            return None
        if re.fullmatch(r"[A-Fa-f]", candidate):
            option = options[ord(candidate.upper()) - 65] if options else ""
            return option or None
        return _normalize_option_text(candidate)
    if isinstance(answer, int):
        return options[answer] if 0 <= answer < len(options) else None
    if isinstance(answer, list):
        normalized: list[str] = []
        seen: set[str] = set()
        for item in answer:
            resolved = _normalize_single_answer(item, options)
            if isinstance(resolved, list):
                for sub_item in resolved:
                    if sub_item and sub_item not in seen:
                        normalized.append(sub_item)
                        seen.add(sub_item)
                continue
            if resolved and resolved not in seen:
                normalized.append(resolved)
                seen.add(resolved)
        return normalized or None
    return None


def normalize_interactive_quick_quiz_payload(
    payload: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = dict(config or {})
    raw_questions = payload.get("questions")
    if not isinstance(raw_questions, list):
        raw_questions = []

    normalized_questions: list[dict[str, Any]] = []
    seen_questions: set[str] = set()
    requested_count = cfg.get("question_count", cfg.get("count"))
    question_type = str(cfg.get("question_type") or "single").strip().lower()
    try:
        requested_count_value = int(requested_count) if requested_count is not None else None
    except (TypeError, ValueError):
        requested_count_value = None

    for index, item in enumerate(raw_questions, start=1):
        if not isinstance(item, dict):
            continue
        question_text = _normalize_question_text(item.get("question") or item.get("stem"))
        if not question_text:
            continue
        question_key = re.sub(r"\s+", "", question_text.lower())
        if question_key in seen_questions:
            continue
        seen_questions.add(question_key)

        raw_options = item.get("options")
        if not isinstance(raw_options, list):
            raw_options = []
        options: list[str] = []
        seen_options: set[str] = set()
        for raw_option in raw_options:
            option = _normalize_option_text(raw_option)
            if not option:
                continue
            option_key = option.lower()
            if option_key in seen_options:
                continue
            seen_options.add(option_key)
            options.append(option)

        answer = _normalize_single_answer(item.get("answer"), options)
        if question_type == "single" and len(options) > 4:
            options = options[:4]
        answer = _normalize_single_answer(item.get("answer"), options)
        explanation = _normalize_explanation_text(item.get("explanation"))
        normalized_question = {
            "id": _stable_question_id(index, item.get("id")),
            "question": question_text,
            "options": options,
            "answer": answer,
            "explanation": explanation,
        }
        normalized_questions.append(normalized_question)
        if requested_count_value and len(normalized_questions) >= requested_count_value:
            break

    scope = sanitize_quiz_scope(
        payload.get("scope") or cfg.get("scope") or cfg.get("question_focus")
    )
    title = sanitize_quiz_title(
        payload.get("title") or cfg.get("title") or scope or "随堂小测"
    )

    normalized = {
        "kind": "quiz",
        "title": title or "随堂小测",
        "question_count": len(normalized_questions),
        "questions": normalized_questions,
    }
    if scope:
        normalized["scope"] = scope
    return normalized


def evaluate_quiz_payload_quality(
    payload: dict[str, Any],
    *,
    requested_question_count: int | None = None,
    baseline_question_count: int | None = None,
) -> tuple[int, list[str], dict[str, int | float]]:
    questions = [
        item
        for item in (payload.get("questions") or [])
        if isinstance(item, dict)
    ]
    title = str(payload.get("title") or "").strip()
    scope = str(payload.get("scope") or "").strip()
    duplicates = 0
    long_questions = 0
    rag_residue = 0
    empty_options = 0
    empty_explanations = 0
    answer_not_in_options = 0
    insufficient_option_count = 0
    duplicate_or_near_duplicate_options = 0
    generic_explanations = 0
    weak_distractors = 0
    seen: set[str] = set()
    question_signatures: list[str] = []

    for question in questions:
        prompt = str(question.get("question") or "").strip()
        normalized_prompt = re.sub(r"\s+", "", prompt.lower())
        if normalized_prompt in seen:
            duplicates += 1
        elif normalized_prompt:
            seen.add(normalized_prompt)
            question_signatures.append(normalized_prompt[:24])
        if len(prompt) > 72:
            long_questions += 1
        if _NOISE_RE.search(prompt):
            rag_residue += 1
        options = question.get("options")
        if not isinstance(options, list) or not [item for item in options if str(item).strip()]:
            empty_options += 1
            options = []
        else:
            normalized_options = [str(item).strip() for item in options if str(item).strip()]
            if len(normalized_options) < 4:
                insufficient_option_count += 1
            seen_option_keys: set[str] = set()
            for option in normalized_options:
                option_key = re.sub(r"\s+", "", option.lower())
                if option_key in seen_option_keys:
                    duplicate_or_near_duplicate_options += 1
                    continue
                seen_option_keys.add(option_key)
                if any(
                    option_key != other and (option_key in other or other in option_key)
                    for other in seen_option_keys
                ):
                    duplicate_or_near_duplicate_options += 1
                if _WEAK_DISTRACTOR_RE.search(option):
                    weak_distractors += 1
            answer = question.get("answer")
            if isinstance(answer, str) and answer.strip():
                answer_text = answer.strip()
                if answer_text not in normalized_options:
                    answer_not_in_options += 1
            elif answer not in (None, ""):
                answer_not_in_options += 1
        explanation = str(question.get("explanation") or "").strip()
        if not explanation:
            empty_explanations += 1
        if _NOISE_RE.search(explanation):
            rag_residue += 1
        if explanation and (len(explanation) < 10 or _GENERIC_EXPLANATION_RE.search(explanation)):
            generic_explanations += 1

    score = 100
    issues: list[str] = []
    question_count = len(questions)
    coverage_too_narrow = bool(
        (
            question_count >= 4
            and len(set(question_signatures)) <= max(2, question_count // 2)
        )
        or (scope and question_count >= 4 and len(set(question_signatures)) <= 2)
    )

    if question_count == 0:
        issues.append("no_questions")
        score -= 60
    if requested_question_count and question_count < max(1, requested_question_count - 1):
        issues.append("question_count_shrunk")
        score -= 18
    if baseline_question_count and question_count < max(1, baseline_question_count - 1):
        issues.append("question_count_regressed")
        score -= 18
    if duplicates > 0:
        issues.append("duplicate_questions")
        score -= min(duplicates * 8, 24)
    if empty_options > 0:
        issues.append("empty_options")
        score -= min(empty_options * 12, 24)
    if answer_not_in_options > 0:
        issues.append("answer_not_in_options")
        score -= min(answer_not_in_options * 14, 28)
    if insufficient_option_count > 0:
        issues.append("insufficient_option_count")
        score -= min(insufficient_option_count * 10, 24)
    if duplicate_or_near_duplicate_options > 0:
        issues.append("duplicate_or_near_duplicate_options")
        score -= min(duplicate_or_near_duplicate_options * 6, 18)
    if rag_residue > 0:
        issues.append("rag_residue")
        score -= min(rag_residue * 10, 20)
    if long_questions > max(1, question_count // 2):
        issues.append("question_too_long")
        score -= 10
    if title and len(title) > 28:
        issues.append("title_too_long")
        score -= 8
    if question_count > 0 and empty_explanations == question_count:
        issues.append("all_explanations_empty")
        score -= 6
    if generic_explanations > max(1, question_count // 2):
        issues.append("generic_explanation")
        score -= 8
    if coverage_too_narrow:
        issues.append("coverage_too_narrow")
        score -= 6
    if weak_distractors > 0:
        issues.append("weak_distractor_pattern")
        score -= min(weak_distractors * 4, 12)

    metrics: dict[str, int | float] = {
        "question_count": question_count,
        "duplicate_questions": duplicates,
        "empty_options": empty_options,
        "empty_explanations": empty_explanations,
        "answer_not_in_options": answer_not_in_options,
        "insufficient_option_count": insufficient_option_count,
        "duplicate_or_near_duplicate_options": duplicate_or_near_duplicate_options,
        "generic_explanations": generic_explanations,
        "coverage_too_narrow": int(coverage_too_narrow),
        "weak_distractor_pattern": weak_distractors,
        "rag_residue_hits": rag_residue,
        "long_questions": long_questions,
    }
    if requested_question_count is not None:
        metrics["requested_question_count"] = requested_question_count
    if baseline_question_count is not None:
        metrics["baseline_question_count"] = baseline_question_count
    return max(0, min(100, score)), issues, metrics


def build_quiz_schema_hint(_config: dict[str, Any] | None = None) -> str:
    return json.dumps(
        {
            "title": "课堂小测标题",
            "scope": "考查主题或知识点范围",
            "questions": [
                {
                    "id": "q-1",
                    "question": "题干，保持短句，避免系统痕迹",
                    "options": ["选项A", "选项B", "选项C", "选项D"],
                    "answer": "选项A",
                    "explanation": "用一句到两句解释为什么正确。",
                }
            ],
        },
        ensure_ascii=False,
    )
