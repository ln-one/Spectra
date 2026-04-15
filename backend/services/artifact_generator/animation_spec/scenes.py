"""Scene normalization and progression semantics."""

from __future__ import annotations

from typing import Any

from .constants import _SHOT_TYPES
from .semantics import _enrich_scene_semantics
from .text import (
    _clean_text,
    _clip_text,
    _normalize_transition,
    _sanitize_display_copy,
    _split_key_points,
)
from .theme import _resolve_scene_camera


def _normalize_scene(
    raw_scene: Any,
    *,
    index: int,
    title: str,
    focus: str,
    visual_type: str,
) -> dict[str, Any]:
    if not isinstance(raw_scene, dict):
        shot_type = "intro" if index == 1 else "focus"
        return {
            "id": f"scene-{index}",
            "title": f"镜头 {index}",
            "description": _clean_text(raw_scene) or f"{title} 的第 {index} 个镜头",
            "emphasis": _clean_text(focus),
            "key_points": [],
            "shot_type": shot_type,
            "transition": _normalize_transition(None, index=index),
            "camera": _resolve_scene_camera(
                None,
                shot_type=shot_type,
                index=index,
            ),
        }

    scene_title = (
        _sanitize_display_copy(_clean_text(raw_scene.get("title"))) or f"镜头 {index}"
    )
    shot_type = _clean_text(raw_scene.get("shot_type")).lower()
    if shot_type not in _SHOT_TYPES:
        if "总结" in scene_title or "协作" in scene_title:
            shot_type = "summary"
        elif "引入" in scene_title or "整体" in scene_title or "先看" in scene_title:
            shot_type = "intro"
        else:
            shot_type = "focus"
    description = (
        _clean_text(raw_scene.get("description"))
        or _clean_text(raw_scene.get("summary"))
        or _clean_text(raw_scene.get("caption"))
        or f"{title} 的第 {index} 个镜头"
    )
    emphasis = _clean_text(raw_scene.get("emphasis")) or _clean_text(
        raw_scene.get("focus")
    )
    if not emphasis:
        emphasis = _clean_text(focus)
    key_points = raw_scene.get("key_points")
    if not isinstance(key_points, list):
        key_points = _split_key_points(description)
    else:
        key_points = [_clean_text(item) for item in key_points if _clean_text(item)]

    clipped_description = _clip_text(_sanitize_display_copy(description), maximum=72)
    clipped_emphasis = _clip_text(_sanitize_display_copy(emphasis), maximum=26)
    clipped_key_points: list[str] = []
    for item in key_points:
        clipped = _clip_text(item, maximum=22)
        if (
            clipped
            and clipped != clipped_description
            and clipped not in clipped_key_points
        ):
            clipped_key_points.append(clipped)

    return {
        "id": _clean_text(raw_scene.get("id")) or f"scene-{index}",
        "title": _clip_text(scene_title, maximum=14) or f"镜头 {index}",
        "shot_type": shot_type,
        "description": clipped_description,
        "emphasis": clipped_emphasis,
        "key_points": clipped_key_points[:3],
        "transition": _normalize_transition(raw_scene.get("transition"), index=index),
        "camera": _resolve_scene_camera(
            raw_scene.get("camera"),
            shot_type=shot_type,
            index=index,
        ),
        "focus_sequence": [
            _clean_text(item)
            for item in (raw_scene.get("focus_sequence") or [])
            if _clean_text(item)
        ],
    }


def _enforce_scene_progression(scenes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not scenes:
        return scenes
    if len(scenes) == 1:
        only = dict(scenes[0])
        only["shot_type"] = "focus"
        only["camera"] = _resolve_scene_camera(None, shot_type="focus", index=1)
        return [only]

    normalized: list[dict[str, Any]] = []
    for index, scene in enumerate(scenes, start=1):
        current = dict(scene)
        original_shot = _clean_text(current.get("shot_type")).lower()
        if index == 1:
            current["shot_type"] = "intro"
        elif index == len(scenes):
            current["shot_type"] = "summary"
        else:
            current["shot_type"] = "focus"
        if current.get("shot_type") != original_shot or not _clean_text(
            current.get("camera")
        ):
            current["camera"] = _resolve_scene_camera(
                None,
                shot_type=str(current["shot_type"]),
                index=index,
            )
        normalized.append(current)
    return normalized
