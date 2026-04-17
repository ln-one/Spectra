"""Align generated AnimationPlan timeline with normalized scenes."""

from __future__ import annotations

from typing import Any

from .code_utils import _scene_step_description


def _align_timeline_with_scenes(
    plan_json: dict[str, Any], spec: dict[str, Any]
) -> dict[str, Any]:
    """Ensure scene cards map to timeline steps (at least 1 step per scene)."""
    theme = spec.get("theme") or {}
    bg = str(theme.get("background") or "#f3fbff")
    panel = str(theme.get("panel") or "#ffffff")
    duration_seconds = int(spec.get("duration_seconds") or 8)

    scene_meta = plan_json.get("scene_meta")
    if not isinstance(scene_meta, dict):
        scene_meta = {}
    scene_meta["duration_seconds"] = duration_seconds
    scene_meta["background_gradient"] = [bg, panel]
    plan_json["scene_meta"] = scene_meta

    scenes = spec.get("scenes") or []

    timeline = plan_json.get("timeline")
    if not isinstance(timeline, list):
        timeline = []
    objects = plan_json.get("objects")
    if not isinstance(objects, list):
        objects = []

    object_ids = [
        str(obj.get("id")) for obj in objects if isinstance(obj, dict) and obj.get("id")
    ]

    has_scenes = isinstance(scenes, list) and len(scenes) > 0
    min_steps_by_duration = max(3, min(6, round(duration_seconds / 2.8)))
    target_steps = max(len(scenes) if has_scenes else 0, min_steps_by_duration)

    # Align existing step descriptions with scene cards (if available).
    if has_scenes:
        for i in range(min(len(timeline), len(scenes))):
            step = timeline[i]
            if not isinstance(step, dict):
                continue
            step["description"] = _scene_step_description(scenes[i], i)
            step["wait_after"] = float(step.get("wait_after") or 0.4)

    # If timeline is too short, append deterministic focus steps.
    if len(timeline) < target_steps:
        fallback_target = object_ids[0] if object_ids else None
        for i in range(len(timeline), target_steps):
            target = object_ids[i % len(object_ids)] if object_ids else fallback_target
            actions = []
            if i == 0 and object_ids:
                actions.append(
                    {
                        "type": "fade_in",
                        "target": object_ids[: min(2, len(object_ids))],
                        "params": {"run_time": 0.5},
                    }
                )
            if target:
                actions.append(
                    {
                        "type": "indicate",
                        "target": target,
                        "params": {"color": "YELLOW", "run_time": 0.6},
                    }
                )
            if not target and object_ids:
                actions.append(
                    {
                        "type": "fade_in",
                        "target": object_ids[: min(2, len(object_ids))],
                        "params": {"run_time": 0.5},
                    }
                )
            timeline.append(
                {
                    "description": (
                        _scene_step_description(scenes[i], i)
                        if has_scenes and i < len(scenes)
                        else f"镜头 {i + 1}"
                    ),
                    "actions": actions,
                    "wait_after": 0.45,
                }
            )

    # Guarantee each step has visible shot change, avoid "single static camera".
    entrance_types = {"fade_in", "create", "write", "grow_arrow"}
    for i, step in enumerate(timeline):
        if not isinstance(step, dict):
            continue
        actions = step.get("actions")
        if not isinstance(actions, list):
            actions = []
            step["actions"] = actions
        has_entrance = any(
            isinstance(a, dict) and a.get("type") in entrance_types for a in actions
        )
        if has_entrance:
            continue
        if object_ids:
            curr_target = object_ids[i % len(object_ids)]
            if i > 0:
                prev_target = object_ids[(i - 1) % len(object_ids)]
                actions.insert(
                    0,
                    {
                        "type": "fade_out",
                        "target": prev_target,
                        "params": {"run_time": 0.28},
                    },
                )
            actions.insert(
                1 if i > 0 else 0,
                {
                    "type": "fade_in",
                    "target": curr_target,
                    "params": {"run_time": 0.42, "shift": [0.22, 0]},
                },
            )
        step["wait_after"] = float(step.get("wait_after") or 0.4)

    # Stretch/compact waits so playback duration is closer to requested seconds.
    total_wait = sum(float((s or {}).get("wait_after") or 0.4) for s in timeline)
    target_wait = max(duration_seconds - 2.5, len(timeline) * 0.4)
    if timeline and total_wait > 0:
        scale = max(0.75, min(2.8, target_wait / total_wait))
        for step in timeline:
            if not isinstance(step, dict):
                continue
            adjusted = float(step.get("wait_after") or 0.4) * scale
            step["wait_after"] = round(max(0.3, min(1.8, adjusted)), 2)

    plan_json["timeline"] = timeline
    return plan_json
