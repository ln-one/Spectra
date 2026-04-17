"""Public animation spec normalization entrypoint."""

from __future__ import annotations

from typing import Any

from .default_scenes import _default_scenes
from .scenes import _enforce_scene_progression, _normalize_scene
from .semantics import (
    _build_semantic_objects,
    _enrich_scene_semantics,
    infer_layout_type,
    infer_subject_family,
    infer_visual_type,
)
from .text import (
    _clamp_int,
    _clean_text,
    _sanitize_display_copy,
    derive_animation_title,
)
from .theme import _resolve_style_pack, _resolve_theme


def normalize_animation_spec(content: dict[str, Any]) -> dict[str, Any]:
    title = derive_animation_title(content) or "教学动画"
    topic = _sanitize_display_copy(_clean_text(content.get("topic"))) or title
    summary = _sanitize_display_copy(
        _clean_text(content.get("summary")) or _clean_text(content.get("scene"))
    )
    focus = _sanitize_display_copy(
        _clean_text(content.get("focus")) or _clean_text(content.get("motion_brief"))
    )
    duration_seconds = _clamp_int(
        content.get("duration_seconds"), default=6, minimum=3, maximum=20
    )
    rhythm = _clean_text(content.get("rhythm")).lower() or "balanced"
    if rhythm not in {"slow", "balanced", "fast"}:
        rhythm = "balanced"

    visual_type = infer_visual_type(content)
    subject_family = infer_subject_family(content, visual_type)
    layout_type = infer_layout_type(subject_family, visual_type)
    style_pack = _resolve_style_pack(content.get("style_pack"))
    raw_scenes = content.get("scenes")
    normalized_scenes = [
        _normalize_scene(
            scene,
            index=index,
            title=title,
            focus=focus,
            visual_type=visual_type,
        )
        for index, scene in enumerate(raw_scenes or [], start=1)
    ]
    if not normalized_scenes:
        normalized_scenes = [
            _normalize_scene(
                scene,
                index=index,
                title=title,
                focus=focus,
                visual_type=visual_type,
            )
            for index, scene in enumerate(
                _default_scenes(
                    title=title,
                    summary=summary,
                    focus=focus,
                    visual_type=visual_type,
                    duration_seconds=duration_seconds,
                ),
                start=1,
            )
        ]
    normalized_scenes = _enforce_scene_progression(normalized_scenes)
    semantic_objects = _build_semantic_objects(
        title=title,
        summary=summary,
        focus=focus,
        subject_family=subject_family,
        visual_type=visual_type,
        scenes=normalized_scenes,
    )
    normalized_scenes = _enrich_scene_semantics(
        normalized_scenes,
        subject_family=subject_family,
        layout_type=layout_type,
        semantic_objects=semantic_objects,
    )

    teaching_goal = (
        _sanitize_display_copy(_clean_text(content.get("teaching_goal")))
        or focus
        or summary
        or f"帮助学生理解 {topic} 的关键知识点。"
    )

    spec = {
        "title": title,
        "topic": topic,
        "summary": summary,
        "teaching_goal": teaching_goal,
        "focus": focus,
        "visual_type": visual_type,
        "subject_family": subject_family,
        "layout_type": layout_type,
        "style_pack": style_pack,
        "duration_seconds": duration_seconds,
        "rhythm": rhythm,
        "theme": _resolve_theme(style_pack, content.get("theme")),
        "scenes": normalized_scenes,
        "objects": [item["label"] for item in semantic_objects],
        "object_details": semantic_objects,
    }
    return spec
