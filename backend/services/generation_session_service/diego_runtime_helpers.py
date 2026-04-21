from __future__ import annotations

import json
from typing import Any, Optional

from services.generation_session_service.teaching_brief import load_teaching_brief
from services.generation_session_service.teaching_brief_projection import (
    extract_brief_fields_from_options,
)

_DIEGO_BINDING_KEY = "diego"


def parse_options(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def normalize_mode(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"template", "classic"}:
        return "template"
    if normalized in {"scratch", "free", "smart"}:
        return "scratch"
    return "scratch"


def normalize_style_preset(value: Any) -> str:
    normalized = str(value or "").strip()
    return normalized or "auto"


def normalize_visual_policy(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"media_required", "basic_graphics_only"}:
        return normalized
    return "auto"


def normalize_rag_source_ids(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        source_id = str(item or "").strip()
        if not source_id or source_id in seen:
            continue
        seen.add(source_id)
        normalized.append(source_id)
    return normalized


_DIEGO_PAGE_TYPES = {"cover", "toc", "section", "content", "summary"}
_DIEGO_LAYOUTS_BY_PAGE_TYPE: dict[str, set[str]] = {
    "cover": {"cover-asymmetric", "cover-center"},
    "toc": {"toc-list", "toc-grid", "toc-sidebar", "toc-cards"},
    "section": {"section-center", "section-accent-block", "section-split"},
    "content": {
        "content-two-column",
        "content-icon-rows",
        "content-comparison",
        "content-timeline",
        "content-stat-callout",
        "content-showcase",
    },
    "summary": {
        "summary-takeaways",
        "summary-cta",
        "summary-thankyou",
        "summary-split",
    },
}


def normalize_page_type(value: Any, fallback: str = "content") -> str:
    normalized = str(value or "").strip().lower()
    if normalized in _DIEGO_PAGE_TYPES:
        return normalized
    return fallback if fallback in _DIEGO_PAGE_TYPES else "content"


def normalize_layout_hint(value: Any, page_type: str) -> str | None:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return None
    allowed = _DIEGO_LAYOUTS_BY_PAGE_TYPE.get(page_type) or set()
    if normalized in allowed:
        return normalized
    return None


def _normalize_prompt_list(value: Any, *, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
        if len(normalized) >= limit:
            break
    return normalized


def _normalize_prompt_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_prompt_count(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _build_teaching_brief_prompt_suffix(options: dict[str, Any]) -> str:
    brief = load_teaching_brief(options)
    clauses: list[str] = []

    audience = _normalize_prompt_text(brief.get("audience"))
    if audience:
        clauses.append(f"面向{audience}")

    lesson_hours = _normalize_prompt_count(brief.get("lesson_hours"))
    duration_minutes = _normalize_prompt_count(brief.get("duration_minutes"))
    target_pages = _normalize_prompt_count(brief.get("target_pages"))
    if lesson_hours is not None:
        clauses.append(f"课时约{lesson_hours}课时")
    elif duration_minutes is not None:
        clauses.append(f"时长约{duration_minutes}分钟")
    if target_pages is not None:
        clauses.append(f"建议输出{target_pages}页左右")

    objectives = _normalize_prompt_list(
        brief.get("teaching_objectives"),
        limit=3,
    )
    if objectives:
        clauses.append(f"教学目标突出{'、'.join(objectives)}")

    knowledge_points = [
        str(item.get("title") or "").strip()
        for item in (brief.get("knowledge_points") or [])[:6]
        if isinstance(item, dict) and str(item.get("title") or "").strip()
    ]
    if knowledge_points:
        clauses.append(f"覆盖知识点：{'、'.join(knowledge_points)}")

    emphasis = _normalize_prompt_list(brief.get("global_emphasis"), limit=3)
    if emphasis:
        clauses.append(f"重点强调{'、'.join(emphasis)}")

    difficulties = _normalize_prompt_list(brief.get("global_difficulties"), limit=3)
    if difficulties:
        clauses.append(f"难点关注{'、'.join(difficulties)}")

    teaching_strategy = _normalize_prompt_text(brief.get("teaching_strategy"))
    if teaching_strategy:
        clauses.append(f"教学组织上采用{teaching_strategy}")

    style_profile = brief.get("style_profile") or {}
    visual_tone = _normalize_prompt_text(style_profile.get("visual_tone"))
    style_notes = _normalize_prompt_text(style_profile.get("notes"))
    if visual_tone:
        clauses.append(f"视觉风格偏向{visual_tone}")
    if style_notes:
        clauses.append(style_notes)

    suffix = "；".join(clauses).strip("； ")
    if not suffix:
        return ""
    if len(suffix) > 320:
        suffix = suffix[:317].rstrip("；，, ") + "..."
    return suffix


def resolve_topic_from_options(options: dict[str, Any]) -> str:
    explicit = str(options.get("topic") or "").strip()
    if not explicit:
        brief_topic = str(load_teaching_brief(options).get("topic") or "").strip()
        if brief_topic:
            explicit = brief_topic

    if not explicit:
        # Backward compatibility for older sessions that persisted `prompt`.
        explicit = str(options.get("prompt") or "").strip()

    base_prompt = explicit or "课程主题"
    brief_suffix = _build_teaching_brief_prompt_suffix(options)
    if not brief_suffix:
        return base_prompt
    if brief_suffix in base_prompt:
        return base_prompt
    combined = f"{base_prompt}；{brief_suffix}".strip("； ")
    if len(combined) > 500:
        return combined[:497].rstrip("；，, ") + "..."
    return combined


def resolve_target_slide_count(options: dict[str, Any]) -> int:
    brief_fields = extract_brief_fields_from_options(options)
    raw = (
        options.get("pages")
        if options.get("pages") is not None
        else (
            options.get("target_slide_count")
            if options.get("target_slide_count") is not None
            else (
                options.get("page_count")
                if options.get("page_count") is not None
                else brief_fields.get("target_pages")
            )
        )
    )
    try:
        parsed_pages = int(raw)
    except (TypeError, ValueError):
        parsed_pages = 12
    return min(max(parsed_pages, 1), 50)


def build_diego_create_payload(
    *,
    options: dict[str, Any],
    diego_project_id: str,
) -> dict[str, Any]:
    mode = normalize_mode(options.get("generation_mode"))
    target_slide_count = resolve_target_slide_count(options)

    payload: dict[str, Any] = {
        "topic": resolve_topic_from_options(options),
        "project_id": diego_project_id,
        "rag_source_ids": normalize_rag_source_ids(options.get("rag_source_ids")),
        "style_preset": normalize_style_preset(options.get("style_preset")),
        "target_slide_count": target_slide_count,
        "generation_mode": mode,
        "visual_policy": normalize_visual_policy(options.get("visual_policy")),
    }
    if mode == "template":
        template_id = str(options.get("template_id") or "").strip()
        if template_id:
            payload["template_id"] = template_id
    return payload


def build_diego_binding(
    *,
    diego_project_id: str,
    diego_run_id: str,
    diego_trace_id: str,
    run,
    mode: str,
    style_preset: str,
    visual_policy: str,
    template_id: Optional[str],
) -> dict[str, Any]:
    return {
        "provider": "diego",
        "enabled": True,
        "diego_project_id": diego_project_id,
        "diego_run_id": diego_run_id,
        "diego_trace_id": diego_trace_id,
        "spectra_run_id": getattr(run, "id", None),
        "generation_mode": mode,
        "style_preset": style_preset,
        "visual_policy": visual_policy,
        "template_id": template_id,
    }


def get_diego_binding_from_options(options: dict[str, Any]) -> dict[str, Any] | None:
    binding = options.get(_DIEGO_BINDING_KEY)
    if not isinstance(binding, dict):
        return None
    if str(binding.get("provider") or "").strip().lower() != "diego":
        return None
    if not bool(binding.get("enabled")):
        return None
    diego_run_id = str(binding.get("diego_run_id") or "").strip()
    if not diego_run_id:
        return None
    return dict(binding)


def get_session_diego_binding(session) -> dict[str, Any] | None:
    options = parse_options(getattr(session, "options", None))
    return get_diego_binding_from_options(options)


def convert_diego_outline_to_spectra(diego_outline: dict[str, Any]) -> dict[str, Any]:
    version_raw = diego_outline.get("version")
    try:
        version = int(version_raw)
    except (TypeError, ValueError):
        version = 1
    if version < 1:
        version = 1

    nodes_raw = diego_outline.get("nodes")
    nodes: list[dict[str, Any]] = []
    if isinstance(nodes_raw, list):
        for index, node in enumerate(nodes_raw, start=1):
            if not isinstance(node, dict):
                continue
            bullets_raw = node.get("bullets")
            key_points = []
            if isinstance(bullets_raw, list):
                key_points = [
                    str(item).strip() for item in bullets_raw if str(item or "").strip()
                ]
            if not key_points:
                key_points = ["核心要点讲解"]
            page_type = normalize_page_type(node.get("page_type"))
            layout_hint = normalize_layout_hint(node.get("layout_hint"), page_type)
            nodes.append(
                {
                    "id": str(node.get("id") or f"diego-outline-{index}"),
                    "order": index,
                    "title": str(node.get("title") or f"第 {index} 页").strip(),
                    "key_points": key_points,
                    "estimated_minutes": None,
                    "page_type": page_type,
                    "layout_hint": layout_hint,
                }
            )

    return {
        "version": version,
        "nodes": nodes,
        "summary": str(diego_outline.get("summary") or "").strip() or None,
    }


def convert_spectra_outline_to_diego(outline: dict[str, Any]) -> dict[str, Any]:
    nodes_raw = outline.get("nodes")
    converted_nodes: list[dict[str, Any]] = []
    if isinstance(nodes_raw, list):
        for node in nodes_raw:
            if not isinstance(node, dict):
                continue
            key_points_raw = node.get("key_points")
            bullets = []
            if isinstance(key_points_raw, list):
                bullets = [
                    str(item).strip()
                    for item in key_points_raw
                    if str(item or "").strip()
                ]
            page_type = normalize_page_type(node.get("page_type"))
            layout_hint = normalize_layout_hint(node.get("layout_hint"), page_type)
            converted_nodes.append(
                {
                    "title": str(node.get("title") or "教学内容").strip(),
                    "bullets": bullets,
                    "page_type": page_type,
                    "layout_hint": layout_hint,
                }
            )

    version_raw = outline.get("version")
    try:
        version = int(version_raw)
    except (TypeError, ValueError):
        version = 1
    if version < 1:
        version = 1

    return {
        "version": version,
        "nodes": converted_nodes,
        "summary": str(outline.get("summary") or "").strip(),
    }
