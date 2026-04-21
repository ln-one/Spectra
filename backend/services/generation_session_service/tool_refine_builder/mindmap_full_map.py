from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

from services.ai.model_router import ModelRouteTask
from services.generation_session_service.mindmap_generation_support import (
    build_mindmap_review_prompt,
    resolve_requested_mindmap_depth,
    resolve_mindmap_model,
)
from services.generation_session_service.mindmap_normalizer import (
    evaluate_mindmap_payload_quality,
)
from utils.exceptions import ErrorCode

from ..studio_card_payload_normalizers import normalize_generated_card_payload
from ..tool_content_builder_ai import generate_card_json_payload
from ..tool_content_builder_generation import _resolve_card_generation_max_tokens
from ..tool_content_builder_support import raise_generation_error, validate_card_payload
from .common import _load_rag_snippets

logger = logging.getLogger(__name__)
_CODE_LIKE_RE = re.compile(
    r"(?:function\s+\w+\(|const\s+\w+\s*=|return\s+\w+;|=>|</?[A-Za-z][^>]*>|"
    r"\bimport\s+.+\bfrom\b|\bexport\s+default\b|\bparent_id\b|\bchildren\b)",
    flags=re.IGNORECASE,
)
_NOISE_RE = re.compile(
    r"(?:\bjson\b|\bschema\b|\bchunk\b|\btoken\b|\bprompt\b|\bmarkdown\b|"
    r"\btypescript\b|\bjavascript\b|\breactflow\b|\bjsx\b|\btsx\b)",
    flags=re.IGNORECASE,
)
_PATH_LIKE_RE = re.compile(r"(?:/[\w./-]+|[A-Za-z]:\\[\w\\.-]+)")
_FILE_LIKE_RE = re.compile(r"\b[\w.-]+\.(?:ts|tsx|js|jsx|json|md|py|java|kt|sql)\b", re.IGNORECASE)


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def resolve_mindmap_refine_model() -> str | None:
    explicit_model = str(os.getenv("MINDMAP_REFINE_MODEL", "") or "").strip()
    if explicit_model:
        return explicit_model

    generation_model = resolve_mindmap_model()
    tier = str(os.getenv("MINDMAP_REFINE_MODEL_TIER", "") or "").strip().lower()
    if not tier:
        return generation_model

    explicit_quality_model = str(os.getenv("MINDMAP_QUALITY_MODEL", "") or "").strip()
    shared_quality_model = str(os.getenv("QUALITY_MODEL", "") or "").strip()
    if tier == "quality":
        return explicit_quality_model or shared_quality_model or generation_model
    if tier == "default":
        from services.ai import ai_service

        return generation_model or ai_service.default_model
    if tier == "small":
        from services.ai import ai_service

        return generation_model or ai_service.small_model
    return generation_model


def resolve_mindmap_refine_max_tokens() -> int:
    generation_floor = _resolve_card_generation_max_tokens("knowledge_mindmap")
    explicit_refine_limit = _env_positive_int("MINDMAP_REFINE_MAX_TOKENS", generation_floor)
    return max(generation_floor, explicit_refine_limit)


def resolve_mindmap_timeout_seconds() -> float | None:
    raw = str(os.getenv("MINDMAP_TIMEOUT_SECONDS", "") or "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
        return value if value > 0 else None
    except ValueError:
        return None


def resolve_mindmap_refine_timeout_seconds() -> float | None:
    raw = str(os.getenv("MINDMAP_REFINE_TIMEOUT_SECONDS", "") or "").strip()
    if not raw:
        return resolve_mindmap_timeout_seconds()
    try:
        value = float(raw)
        return value if value > 0 else resolve_mindmap_timeout_seconds()
    except ValueError:
        return resolve_mindmap_timeout_seconds()


def resolve_mindmap_refine_review_max_tokens() -> int:
    generation_review_floor = max(
        _resolve_card_generation_max_tokens("knowledge_mindmap"),
        _env_positive_int("MINDMAP_REVIEW_MAX_TOKENS", 5200),
    )
    explicit_refine_limit = _env_positive_int(
        "MINDMAP_REFINE_REVIEW_MAX_TOKENS",
        generation_review_floor,
    )
    return max(generation_review_floor, explicit_refine_limit)


def resolve_mindmap_review_timeout_seconds() -> float | None:
    raw = str(os.getenv("MINDMAP_REVIEW_TIMEOUT_SECONDS", "") or "").strip()
    if not raw:
        return resolve_mindmap_refine_timeout_seconds()
    try:
        value = float(raw)
        return value if value > 0 else resolve_mindmap_refine_timeout_seconds()
    except ValueError:
        return resolve_mindmap_refine_timeout_seconds()


def build_full_map_refine_config(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    next_config = dict(config)
    next_config.setdefault("title", current_content.get("title"))
    next_config.setdefault("topic", current_content.get("title"))
    if not str(next_config.get("output_requirements") or "").strip():
        next_config["output_requirements"] = message
    requested_depth = resolve_requested_mindmap_depth(next_config, message)
    if requested_depth:
        next_config["depth"] = requested_depth
    return next_config


def build_mindmap_refine_prompt(
    *,
    current_snapshot: dict[str, Any],
    message: str,
    rag_snippets: list[str],
    requested_depth: int | None = None,
) -> str:
    rag_block = json.dumps(rag_snippets, ensure_ascii=False) if rag_snippets else "[]"
    depth_requirement = (
        f"- The user explicitly requested at least {requested_depth} levels. The rewritten map must reach depth {requested_depth} or more unless the topic truly cannot support it.\n"
        if requested_depth and requested_depth > 0
        else ""
    )
    return (
        "You are revising an existing educational mind map.\n"
        "Return ONLY one JSON object. Do not include markdown fences or explanations.\n"
        "This is a full-map rewrite, not a local patch.\n"
        f"User refinement instruction: {message}\n"
        f"Current mind map snapshot: {json.dumps(current_snapshot, ensure_ascii=False)}\n"
        f"Optional evidence snippets: {rag_block}\n"
        "Rewrite requirements:\n"
        "- Rewrite from the current map structure first; use evidence only when it helps expand or clarify.\n"
        "- Keep the topic coherent with the current map unless the instruction explicitly changes scope.\n"
        "- Preserve or improve overall richness, branch balance, and teaching usefulness.\n"
        "- Do not collapse the map into a smaller or shallower tree.\n"
        f"{depth_requirement}"
        "- Clean out RAG residue, filenames, chunk markers, source traces, and quoted-fragment tone.\n"
        "- Titles must stay short and node-friendly.\n"
        "- Summaries must be synthesized, concise, and classroom-ready.\n"
        "- Return a JSON object with shape: {title, summary, nodes:[{id,parent_id,title,summary}]}\n"
        "- Do not return edges, metadata, renderer hints, or explanations.\n"
    )


def summarize_mindmap_for_rewrite(current_content: dict[str, Any]) -> dict[str, Any]:
    nodes = []
    raw_nodes = current_content.get("nodes") or []
    for raw_node in raw_nodes:
        if not isinstance(raw_node, dict):
            continue
        node = {
            "id": str(raw_node.get("id") or "").strip()[:48],
            "parent_id": raw_node.get("parent_id"),
            "title": str(raw_node.get("title") or "").strip()[:48],
        }
        summary = str(raw_node.get("summary") or "").strip()
        if summary:
            node["summary"] = summary[:120]
        nodes.append(node)
    return {
        "title": str(current_content.get("title") or "").strip()[:64],
        "summary": str(current_content.get("summary") or "").strip()[:180],
        "nodes": nodes,
    }


def _sanitize_refine_rag_text(text: str) -> str:
    candidate = re.sub(r"\s+", " ", str(text or "").replace("\r", " ").replace("\n", " ")).strip()
    candidate = _PATH_LIKE_RE.sub(" ", candidate)
    candidate = _FILE_LIKE_RE.sub(" ", candidate)
    candidate = re.sub(r"[`~|^]{2,}", " ", candidate)
    candidate = re.sub(r"\s+", " ", candidate).strip(" -:;,.")
    return candidate


def _is_bad_refine_rag_snippet(text: str) -> bool:
    if not text or len(text) < 16:
        return True
    if _CODE_LIKE_RE.search(text):
        return True
    if _NOISE_RE.search(text):
        return True
    symbol_count = sum(
        1
        for ch in text
        if not ch.isalnum() and not ("\u4e00" <= ch <= "\u9fff") and ch != " "
    )
    if symbol_count / max(len(text), 1) > 0.18:
        return True
    return False


async def load_refine_rag_snippets(
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
        sanitized = _sanitize_refine_rag_text(raw_snippet)
        if _is_bad_refine_rag_snippet(sanitized):
            continue
        compact = sanitized[:160]
        dedupe_key = re.sub(r"\s+", "", compact.lower())
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        cleaned.append(compact)
    return cleaned[:2]


def log_refine_phase(
    phase: str,
    *,
    started_at: float,
    model: str | None = None,
    max_tokens: int | None = None,
    timeout_seconds: float | None = None,
    prompt_chars: int | None = None,
    node_count: int | None = None,
    rag_snippet_count: int | None = None,
) -> None:
    logger.info(
        "knowledge_mindmap refine phase=%s elapsed_ms=%.2f model=%s max_tokens=%s timeout_seconds=%s prompt_chars=%s node_count=%s rag_snippet_count=%s",
        phase,
        (time.perf_counter() - started_at) * 1000.0,
        model or "-",
        max_tokens if max_tokens is not None else "-",
        timeout_seconds if timeout_seconds is not None else "-",
        prompt_chars if prompt_chars is not None else "-",
        node_count if node_count is not None else "-",
        rag_snippet_count if rag_snippet_count is not None else "-",
    )


def enforce_mindmap_refine_quality(
    *,
    payload: dict[str, Any],
    current_content: dict[str, Any],
    model_name: str | None,
    requested_depth: int | None = None,
) -> None:
    quality_threshold = _env_positive_int("MINDMAP_QUALITY_THRESHOLD", 70)
    score, issues, metrics = evaluate_mindmap_payload_quality(payload)
    current_score, current_issues, current_metrics = evaluate_mindmap_payload_quality(
        current_content
    )
    regression_issues: list[str] = []

    current_node_count = int(current_metrics.get("node_count") or 0)
    next_node_count = int(metrics.get("node_count") or 0)
    current_depth = int(current_metrics.get("max_depth") or 0)
    next_depth = int(metrics.get("max_depth") or 0)
    current_duplicates = int(current_metrics.get("duplicate_title_count") or 0)
    next_duplicates = int(metrics.get("duplicate_title_count") or 0)
    current_noise = int(current_metrics.get("noise_hits") or 0)
    next_noise = int(metrics.get("noise_hits") or 0)
    current_avg_title_length = int(current_metrics.get("avg_title_length") or 0)
    next_avg_title_length = int(metrics.get("avg_title_length") or 0)

    if current_node_count >= 12 and next_node_count < max(12, int(current_node_count * 0.75)):
        regression_issues.append("rewrite_shrank_nodes")
    if current_depth >= 4 and next_depth < max(4, current_depth - 1):
        regression_issues.append("rewrite_shrank_depth")
    if requested_depth and requested_depth > 0 and next_depth < requested_depth:
        regression_issues.append("requested_depth_not_met")
    if next_duplicates > current_duplicates + 1:
        regression_issues.append("rewrite_increased_duplicates")
    if next_noise > current_noise:
        regression_issues.append("rewrite_reintroduced_rag_noise")
    if next_avg_title_length > max(18, current_avg_title_length + 2):
        regression_issues.append("rewrite_titles_more_verbose")

    logger.info(
        "knowledge_mindmap refine quality metadata: model=%s score=%s threshold=%s requested_depth=%s issues=%s metrics=%s current_score=%s current_issues=%s current_metrics=%s regression_issues=%s",
        model_name,
        score,
        quality_threshold,
        requested_depth if requested_depth is not None else "-",
        ",".join(issues),
        metrics,
        current_score,
        ",".join(current_issues),
        current_metrics,
        ",".join(regression_issues),
    )

    if score < quality_threshold or regression_issues:
        failure_reasons = issues[:]
        failure_reasons.extend(regression_issues)
        raise_generation_error(
            status_code=422,
            error_code=ErrorCode.INVALID_INPUT,
            message="Refined mindmap payload failed quality score checks.",
            card_id="knowledge_mindmap",
            model=model_name,
            phase="quality_gate",
            failure_reason="mindmap_refine_quality_low:" + ",".join(failure_reasons[:8]),
            retryable=False,
            extra={
                "mindmap_quality_score": score,
                "mindmap_quality_threshold": quality_threshold,
                "mindmap_quality_metrics": metrics,
                "mindmap_quality_regressions": regression_issues,
                "current_mindmap_quality_metrics": current_metrics,
            },
        )


async def rewrite_full_mindmap(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    instruction = str(message or "").strip()
    if not instruction:
        from utils.exceptions import APIException

        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="mindmap chat refine requires a non-empty instruction",
        )

    started_at = time.perf_counter()
    current_snapshot = summarize_mindmap_for_rewrite(current_content)
    node_count = len(current_snapshot.get("nodes") or [])
    rag_snippets = await load_refine_rag_snippets(
        project_id=project_id,
        query=instruction,
        rag_source_ids=rag_source_ids,
    )
    log_refine_phase(
        "prepare_prompt",
        started_at=started_at,
        node_count=node_count,
        rag_snippet_count=len(rag_snippets),
    )
    refine_config = build_full_map_refine_config(
        current_content=current_content,
        message=instruction,
        config=config,
    )
    requested_depth = resolve_requested_mindmap_depth(refine_config, instruction)
    model = resolve_mindmap_refine_model()
    refine_timeout_seconds = resolve_mindmap_refine_timeout_seconds()
    refine_max_tokens = resolve_mindmap_refine_max_tokens()
    generation_prompt = build_mindmap_refine_prompt(
        current_snapshot=current_snapshot,
        message=instruction,
        rag_snippets=rag_snippets,
        requested_depth=requested_depth,
    )
    payload, model_name = await generate_card_json_payload(
        prompt=generation_prompt,
        card_id="knowledge_mindmap",
        phase="generate",
        rag_snippets=rag_snippets,
        max_tokens=refine_max_tokens,
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        model=model,
        timeout_seconds_override=refine_timeout_seconds,
    )
    log_refine_phase(
        "generate_rewrite",
        started_at=started_at,
        model=model_name,
        max_tokens=refine_max_tokens,
        timeout_seconds=refine_timeout_seconds,
        prompt_chars=len(generation_prompt),
        node_count=node_count,
        rag_snippet_count=len(rag_snippets),
    )

    reviewed_payload = payload
    if str(os.getenv("MINDMAP_REVIEW_ENABLED", "true") or "").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }:
        review_timeout_seconds = resolve_mindmap_review_timeout_seconds()
        review_max_tokens = resolve_mindmap_refine_review_max_tokens()
        review_prompt = build_mindmap_review_prompt(
            config=refine_config,
            draft_payload=payload,
            rag_snippets=rag_snippets,
            instruction=instruction,
        )
        reviewed_payload, reviewed_model_name = await generate_card_json_payload(
            prompt=review_prompt,
            card_id="knowledge_mindmap",
            phase="review",
            rag_snippets=rag_snippets,
            max_tokens=review_max_tokens,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            model=model,
            timeout_seconds_override=review_timeout_seconds,
        )
        model_name = reviewed_model_name or model_name
        log_refine_phase(
            "review_rewrite",
            started_at=started_at,
            model=model_name,
            max_tokens=review_max_tokens,
            timeout_seconds=review_timeout_seconds,
            prompt_chars=len(review_prompt),
            node_count=node_count,
            rag_snippet_count=len(rag_snippets),
        )

    normalized = normalize_generated_card_payload(
        card_id="knowledge_mindmap",
        payload=reviewed_payload,
        config=refine_config,
    )
    log_refine_phase(
        "normalize",
        started_at=started_at,
        model=model_name,
        node_count=len(normalized.get("nodes") or []),
        rag_snippet_count=len(rag_snippets),
    )
    validate_card_payload("knowledge_mindmap", normalized)
    enforce_mindmap_refine_quality(
        payload=normalized,
        current_content=current_content,
        model_name=model_name,
        requested_depth=requested_depth,
    )
    log_refine_phase(
        "quality_gate",
        started_at=started_at,
        model=model_name,
        node_count=len(normalized.get("nodes") or []),
        rag_snippet_count=len(rag_snippets),
    )
    normalized["kind"] = "mindmap"
    normalized["summary"] = str(
        normalized.get("summary") or current_content.get("summary") or instruction
    ).strip()
    log_refine_phase(
        "persist_artifact",
        started_at=started_at,
        model=model_name,
        node_count=len(normalized.get("nodes") or []),
        rag_snippet_count=len(rag_snippets),
    )
    return normalized
