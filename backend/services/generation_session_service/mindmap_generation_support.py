from __future__ import annotations

import json
import os
import re
from typing import Any

from services.ai.model_router import ModelRouteTask
from services.generation_session_service.mindmap_normalizer import (
    evaluate_mindmap_payload_quality,
)

from .tool_content_builder_ai import ai_service, generate_card_json_payload
from .tool_content_builder_support import build_schema_hint


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
        return value if value > 0 else default
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


_MINDMAP_DEPTH_PATTERN = re.compile(
    r"(?:(?P<arabic>\d+)|(?P<chinese>[一二三四五六七八九十两]))\s*(?:层|级)",
    flags=re.IGNORECASE,
)
_CHINESE_DEPTH_MAP = {
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


def resolve_requested_mindmap_depth(
    config: dict[str, Any] | None,
    instruction: str | None = None,
) -> int | None:
    if isinstance(config, dict):
        raw_depth = config.get("depth")
        if raw_depth not in (None, ""):
            try:
                value = int(str(raw_depth).strip())
                if value > 0:
                    return value
            except ValueError:
                pass

    text = str(instruction or "").strip()
    if not text:
        return None
    match = _MINDMAP_DEPTH_PATTERN.search(text)
    if not match:
        return None
    arabic = match.group("arabic")
    if arabic:
        try:
            value = int(arabic)
            return value if value > 0 else None
        except ValueError:
            return None
    chinese = match.group("chinese")
    return _CHINESE_DEPTH_MAP.get(chinese or "")


def resolve_mindmap_model() -> str | None:
    tier = str(os.getenv("MINDMAP_GENERATION_MODEL_TIER", "quality") or "").strip().lower()
    explicit_quality_model = str(os.getenv("MINDMAP_QUALITY_MODEL", "")).strip()
    shared_quality_model = str(os.getenv("QUALITY_MODEL", "")).strip()
    if tier == "quality":
        return explicit_quality_model or shared_quality_model or ai_service.large_model
    if tier == "default":
        return ai_service.default_model
    if tier == "small":
        return ai_service.small_model
    return ai_service.large_model


def resolve_mindmap_timeout_seconds() -> float | None:
    raw = str(os.getenv("MINDMAP_TIMEOUT_SECONDS", "") or "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
        return value if value > 0 else None
    except ValueError:
        return None


def resolve_mindmap_review_timeout_seconds() -> float | None:
    raw = str(os.getenv("MINDMAP_REVIEW_TIMEOUT_SECONDS", "") or "").strip()
    if not raw:
        return resolve_mindmap_timeout_seconds()
    try:
        value = float(raw)
        return value if value > 0 else resolve_mindmap_timeout_seconds()
    except ValueError:
        return resolve_mindmap_timeout_seconds()


def _build_flat_mindmap_schema_hint() -> str:
    return json.dumps(
        {
            "title": "主题名称，聚焦一个核心问题",
            "summary": "整张导图的归纳性说明，不带来源痕迹。",
            "nodes": [
                {
                    "id": "root",
                    "parent_id": None,
                    "title": "核心主题",
                    "summary": "根主题只表达一个问题。",
                },
                {
                    "id": "branch-1",
                    "parent_id": "root",
                    "title": "一级分支短词",
                    "summary": "一级分支使用分类或关系视角。",
                },
                {
                    "id": "branch-1-child-1",
                    "parent_id": "branch-1",
                    "title": "二级分支短词",
                    "summary": "摘要必须是归纳表达，不得照抄 RAG。",
                },
            ],
        },
        ensure_ascii=False,
    )


def _summarize_review_payload(draft_payload: dict[str, Any]) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    for raw_node in (draft_payload.get("nodes") or []):
        if not isinstance(raw_node, dict):
            continue
        compact = {
            "id": str(raw_node.get("id") or "").strip()[:48],
            "parent_id": raw_node.get("parent_id"),
            "title": str(raw_node.get("title") or "").strip()[:36],
        }
        summary = str(raw_node.get("summary") or "").strip()
        if summary:
            compact["summary"] = summary[:80]
        nodes.append(compact)
    return {
        "title": str(draft_payload.get("title") or "").strip()[:64],
        "summary": str(draft_payload.get("summary") or "").strip()[:120],
        "nodes": nodes,
    }


def build_mindmap_generation_prompt(
    *,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> str:
    schema_hint = _build_flat_mindmap_schema_hint()
    topic = str(
        config.get("output_requirements")
        or config.get("topic")
        or config.get("title")
        or "当前主题"
    ).strip()
    focus = str(config.get("focus") or "").strip()
    audience = str(config.get("target_audience") or "").strip()
    requested_depth = resolve_requested_mindmap_depth(config)
    prompt_lines = [
        "You are designing a polished educational knowledge mind map.",
        "Return ONLY one JSON object. Do not include markdown fences or explanations.",
        "Your job is not to copy snippets. Your job is to synthesize them into a large, visual, teachable mind map.",
        f"Topic request: {topic}",
    ]
    if audience:
        prompt_lines.append(f"Audience: {audience}")
    if focus:
        prompt_lines.append(f"Focus: {focus}")
    if requested_depth not in (None, ""):
        prompt_lines.append(f"Requested depth target: {requested_depth}")
    prompt_lines.extend(
        [
            f"Source artifact hint: {source_hint or 'none'}",
            f"RAG evidence snippets: {json.dumps(rag_snippets, ensure_ascii=False)}",
            "Mind-map requirements:",
            "- Build around one clear central question or topic.",
            "- Prefer a visually rich map with multiple levels, not a shallow 3-layer summary.",
            "- Target 4 to 7 primary branches with meaningful variety.",
            "- Expand deeper where helpful so the tree feels complete, but avoid long one-child chains.",
            "- Organize branches using mind-map-friendly structures such as concept, mechanism, comparison, misconception, application, example, strategy, relation, or process.",
            "- Titles must be short words or short phrases, suitable for node labels.",
            "- Summaries must be clean synthesized explanations, not source fragments.",
            "- Do not mention files, pages, chunks, sources, prompt instructions, or retrieval.",
            "- Do not write phrases like '资料里提到', '来源', '见第X页', or filename references.",
            "- Remove repetition and merge overlapping branches.",
            "- Return a flat nodes array. Do not rely on nested children arrays as the primary structure.",
            f"Expected JSON shape example: {schema_hint}",
        ]
    )
    return "\n".join(prompt_lines) + "\n"


def build_mindmap_review_prompt(
    *,
    config: dict[str, Any],
    draft_payload: dict[str, Any],
    rag_snippets: list[str],
    instruction: str | None = None,
) -> str:
    topic = str(
        config.get("output_requirements")
        or config.get("topic")
        or config.get("title")
        or "当前主题"
    ).strip()
    del config
    schema_hint = _build_flat_mindmap_schema_hint()
    draft_snapshot = _summarize_review_payload(draft_payload)
    _score, _issues, metrics = evaluate_mindmap_payload_quality(draft_payload)
    min_node_count = max(12, int(metrics.get("node_count") or 0))
    min_primary_branches = max(4, int(metrics.get("primary_branch_count") or 0))
    requested_depth = resolve_requested_mindmap_depth(config, instruction)
    min_depth = max(4, int(metrics.get("max_depth") or 0), int(requested_depth or 0))
    depth_requirement_line = (
        f"- The user explicitly asked for at least {requested_depth} levels, so the final map must reach depth {requested_depth} or more.\n"
        if requested_depth and requested_depth > 0
        else ""
    )
    return (
        "You are the reviewer and rewriter for a knowledge mind map draft.\n"
        "Return ONLY one cleaned JSON object using the same schema.\n"
        f"Topic request: {topic}\n"
        f"User refinement instruction: {instruction or topic}\n"
        f"Reference evidence snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        f"Draft compact snapshot: {json.dumps(draft_snapshot, ensure_ascii=False)}\n"
        "Review goals:\n"
        "- Shorten verbose node titles into crisp labels.\n"
        "- Rewrite summaries to be clean, synthesized, and classroom-ready.\n"
        "- Remove all RAG residue, file names, page numbers, chunk markers, and quoted-fragment tone.\n"
        "- Merge duplicate or near-duplicate branches.\n"
        "- Expand branches that are too thin so the map feels substantial and balanced.\n"
        "- Keep the root focused on a single topic.\n"
        f"- Keep at least {min_node_count} nodes unless the user explicitly asked to simplify.\n"
        f"- Keep at least {min_primary_branches} primary branches unless the user explicitly asked to simplify.\n"
        f"- Keep depth at least {min_depth} unless the user explicitly asked to simplify.\n"
        f"{depth_requirement_line}"
        "- Do not collapse the map into a one-node summary.\n"
        "- Preserve the overall structural richness of the draft.\n"
        "- Return a flat nodes array. Do not rely on nested children arrays as the primary structure.\n"
        "- Preserve structured JSON output only.\n"
        f"Expected JSON shape example: {schema_hint}\n"
    )


async def generate_mindmap_reviewed_payload(
    *,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
    resolve_card_generation_max_tokens,
) -> tuple[dict[str, Any], str | None]:
    model = resolve_mindmap_model()
    payload, model_name = await generate_card_json_payload(
        prompt=build_mindmap_generation_prompt(
            config=config,
            rag_snippets=rag_snippets,
            source_hint=source_hint,
        ),
        card_id="knowledge_mindmap",
        phase="generate",
        rag_snippets=rag_snippets,
        max_tokens=resolve_card_generation_max_tokens("knowledge_mindmap"),
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        model=model,
        timeout_seconds_override=resolve_mindmap_timeout_seconds(),
    )
    if not _env_bool("MINDMAP_REVIEW_ENABLED", True):
        return payload, model_name

    reviewed_payload, reviewed_model_name = await generate_card_json_payload(
        prompt=build_mindmap_review_prompt(
            config=config,
            draft_payload=payload,
            rag_snippets=rag_snippets,
        ),
        card_id="knowledge_mindmap",
        phase="review",
        rag_snippets=rag_snippets,
        max_tokens=_env_positive_int(
            "MINDMAP_REVIEW_MAX_TOKENS",
            resolve_card_generation_max_tokens("knowledge_mindmap"),
        ),
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        model=model,
        timeout_seconds_override=resolve_mindmap_review_timeout_seconds(),
    )
    return reviewed_payload, reviewed_model_name or model_name
