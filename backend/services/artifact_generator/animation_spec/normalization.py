"""Public animation spec normalization entrypoint."""

from __future__ import annotations

import re
from typing import Any

from .constants import _SHOT_TYPES
from .default_scenes import _default_scenes
from .scenes import _enforce_scene_progression, _normalize_scene
from .semantics import (
    _build_object_details,
    _build_semantic_objects,
    _enrich_scene_semantics,
    infer_layout_type,
    infer_subject_family,
    infer_visual_type,
)
from .text import (
    _clamp_int,
    _clean_text,
    _extract_scene_count_constraint,
    _resolve_scene_budget,
    _sanitize_display_copy,
    derive_animation_title,
)
from .theme import _resolve_style_pack, _resolve_theme


_ALGORITHM_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("bubble_sort", r"(冒泡排序|bubble\s*sort)"),
    ("selection_sort", r"(选择排序|selection\s*sort)"),
    ("insertion_sort", r"(插入排序|insertion\s*sort)"),
    ("binary_search", r"(二分查找|binary\s*search)"),
)

_SUPPORTED_EXPLAINER_FAMILIES = {
    "algorithm_demo",
    "physics_mechanics",
    "system_flow",
    "math_transform",
}

_PHYSICS_KEYWORD_TOKENS = (
    "物理",
    "运动",
    "力",
    "受力",
    "速度",
    "位移",
    "轨迹",
    "加速度",
    "重力",
    "抛物线",
    "抛射",
    "斜抛",
    "平抛",
    "弹道",
)


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _infer_algorithm_type(*parts: str) -> str | None:
    text = " ".join(part for part in parts if part).lower()
    for algorithm_type, pattern in _ALGORITHM_KEYWORDS:
        if re.search(pattern, text, re.IGNORECASE):
            return algorithm_type
    return None


def _resolve_explicit_animation_family(content: dict[str, Any]) -> str:
    for key in ("animation_family", "family_hint"):
        candidate = _clean_text(content.get(key)).lower()
        if candidate in _SUPPORTED_EXPLAINER_FAMILIES:
            return candidate
    return ""


def _infer_animation_family(
    *,
    content: dict[str, Any],
    visual_type: str,
    subject_family: str,
) -> str:
    explicit = _resolve_explicit_animation_family(content)
    if explicit:
        return explicit

    text = " ".join(
        _clean_text(content.get(key))
        for key in ("title", "topic", "summary", "scene", "focus", "teaching_goal")
    ).lower()
    if _infer_algorithm_type(text):
        return "algorithm_demo"
    if any(token in text for token in _PHYSICS_KEYWORD_TOKENS):
        return "physics_mechanics"

    if subject_family in {"energy_transfer", "lifecycle_cycle"}:
        return "physics_mechanics"
    if subject_family == "trend_change" or visual_type == "relationship_change":
        return "math_transform"
    if subject_family in {
        "protocol_exchange",
        "pipeline_sequence",
        "generic_process",
        "traversal_path",
        "structure_layers",
    }:
        return "system_flow"
    return "system_flow"


def _resolve_subject_family(
    *,
    content: dict[str, Any],
    visual_type: str,
) -> tuple[str, str]:
    subject_family = infer_subject_family(content, visual_type)
    animation_family = _infer_animation_family(
        content=content,
        visual_type=visual_type,
        subject_family=subject_family,
    )
    if (
        animation_family == "physics_mechanics"
        and visual_type != "structure_breakdown"
        and subject_family not in {"energy_transfer", "lifecycle_cycle"}
    ):
        subject_family = "energy_transfer"
    return subject_family, animation_family


def _build_algorithm_demo_spec(
    *,
    content: dict[str, Any],
    title: str,
    topic: str,
    summary: str,
    focus: str,
    duration_seconds: int,
    rhythm: str,
    style_pack: str,
) -> dict[str, Any] | None:
    algorithm_type = _infer_algorithm_type(
        title,
        topic,
        summary,
        focus,
        str(content.get("algorithm_type") or ""),
        str(content.get("motion_brief") or ""),
    )
    if not algorithm_type:
        return None

    teaching_goal = (
        _sanitize_display_copy(_clean_text(content.get("teaching_goal")))
        or focus
        or f"帮助学生看懂 {topic} 的执行过程、关键比较点和结果变化。"
    )

    if algorithm_type == "bubble_sort":
        dataset = [5, 3, 8, 2, 6]
        steps = [
            {
                "action": "compare",
                "active_indices": [0, 1],
                "caption": "开始扫描未排序区，比较相邻元素是否需要交换。",
                "snapshot": [5, 3, 8, 2, 6],
            },
            {
                "action": "swap",
                "active_indices": [0, 1],
                "swap_indices": [0, 1],
                "caption": "当前一对元素发生交换，较小值前移。",
                "snapshot": [3, 5, 8, 2, 6],
            },
            {
                "action": "compare",
                "active_indices": [2, 3],
                "caption": "继续向后比较下一对相邻元素。",
                "snapshot": [3, 5, 8, 2, 6],
            },
            {
                "action": "swap",
                "active_indices": [2, 3],
                "swap_indices": [2, 3],
                "caption": "再次交换后，较大值继续向右移动。",
                "snapshot": [3, 5, 2, 8, 6],
            },
            {
                "action": "swap",
                "active_indices": [3, 4],
                "swap_indices": [3, 4],
                "sorted_indices": [4],
                "caption": "第一轮结束，当前最大值归位到末尾。",
                "snapshot": [3, 5, 2, 6, 8],
            },
            {
                "action": "swap",
                "active_indices": [1, 2],
                "swap_indices": [1, 2],
                "sorted_indices": [3, 4],
                "caption": "下一轮继续收缩未排序区并执行交换。",
                "snapshot": [3, 2, 5, 6, 8],
            },
            {
                "action": "swap",
                "active_indices": [0, 1],
                "swap_indices": [0, 1],
                "sorted_indices": [2, 3, 4],
                "caption": "最后一轮完成后，序列达到升序。",
                "snapshot": [2, 3, 5, 6, 8],
            },
        ]
    elif algorithm_type == "selection_sort":
        dataset = [7, 4, 6, 2, 5]
        steps = [
            {
                "action": "scan_min",
                "active_indices": [0, 1],
                "pointer_indices": [0],
                "caption": "从第一个位置开始扫描，先把 7 当作当前最小值候选。",
                "snapshot": [7, 4, 6, 2, 5],
            },
            {
                "action": "scan_min",
                "active_indices": [1, 3],
                "pointer_indices": [3],
                "caption": "扫描到 2 时更新最小值位置，准备与起始位交换。",
                "snapshot": [7, 4, 6, 2, 5],
            },
            {
                "action": "swap",
                "active_indices": [0, 3],
                "swap_indices": [0, 3],
                "sorted_indices": [0],
                "caption": "把最小值 2 放到最前面，已排序区向右扩张。",
                "snapshot": [2, 4, 6, 7, 5],
            },
            {
                "action": "scan_min",
                "active_indices": [1, 4],
                "pointer_indices": [1],
                "sorted_indices": [0],
                "caption": "第二轮从剩余区重新找最小值，4 已经保持在当前位置。",
                "snapshot": [2, 4, 6, 7, 5],
            },
            {
                "action": "swap",
                "active_indices": [2, 4],
                "swap_indices": [2, 4],
                "sorted_indices": [0, 1, 2],
                "caption": "把 5 换到第三位，未排序区继续缩小。",
                "snapshot": [2, 4, 5, 7, 6],
            },
            {
                "action": "swap",
                "active_indices": [3, 4],
                "swap_indices": [3, 4],
                "sorted_indices": [0, 1, 2, 3, 4],
                "caption": "最后交换 7 和 6，整个数组完成选择排序。",
                "snapshot": [2, 4, 5, 6, 7],
            },
        ]
    elif algorithm_type == "insertion_sort":
        dataset = [5, 2, 4, 6, 1]
        steps = [
            {
                "action": "pick_key",
                "active_indices": [1],
                "pointer_indices": [1],
                "sorted_indices": [0],
                "caption": "把第 2 个元素 2 当作 key，准备插入左侧有序区。",
                "snapshot": [5, 2, 4, 6, 1],
            },
            {
                "action": "shift",
                "active_indices": [0, 1],
                "pointer_indices": [0],
                "caption": "5 大于 2，向右移动一个位置给 key 腾出空位。",
                "snapshot": [5, 5, 4, 6, 1],
            },
            {
                "action": "insert",
                "active_indices": [0],
                "sorted_indices": [0, 1],
                "caption": "将 2 插入到最前面，前两个元素形成有序区。",
                "snapshot": [2, 5, 4, 6, 1],
            },
            {
                "action": "shift",
                "active_indices": [1, 2],
                "pointer_indices": [1],
                "sorted_indices": [0, 1],
                "caption": "处理 4 时，先将 5 右移，再把 4 插入正确位置。",
                "snapshot": [2, 5, 5, 6, 1],
            },
            {
                "action": "insert",
                "active_indices": [1],
                "sorted_indices": [0, 1, 2, 3],
                "caption": "4 插入后，有序区扩展到前四个元素。",
                "snapshot": [2, 4, 5, 6, 1],
            },
            {
                "action": "insert",
                "active_indices": [0],
                "sorted_indices": [0, 1, 2, 3, 4],
                "caption": "最后把 1 插入到最前面，插入排序完成。",
                "snapshot": [1, 2, 4, 5, 6],
            },
        ]
    else:
        dataset = [2, 4, 6, 8, 10, 12, 14]
        target_value = 10
        steps = [
            {
                "action": "inspect_mid",
                "active_indices": [3],
                "pointer_indices": [0, 3, 6],
                "caption": "先看中间位置 8，与目标值 10 比较。",
                "snapshot": dataset,
            },
            {
                "action": "move_window",
                "active_indices": [5],
                "pointer_indices": [4, 5, 6],
                "caption": "因为 8 小于目标值，搜索区间收缩到右半边。",
                "snapshot": dataset,
            },
            {
                "action": "found",
                "active_indices": [4],
                "pointer_indices": [4, 4, 4],
                "caption": "在新窗口的中点找到 10，二分查找成功结束。",
                "snapshot": dataset,
            },
        ]
        summary = summary or f"在有序序列中查找目标值 {target_value}。"

    intro_title = f"{topic}：输入与目标"
    process_title = f"{topic}：关键步骤推进"
    summary_title = f"{topic}：结果与规律"
    intro_description = summary or f"先明确 {topic} 的输入数据、执行目标与观察重点。"
    process_description = focus or "按步骤观察比较、交换与有序区变化。"
    summary_description = (
        steps[-1]["caption"]
        if steps
        else f"回看 {topic} 的结果并提炼可迁移规律。"
    )

    scenes = [
        {
            "title": intro_title,
            "description": intro_description,
            "emphasis": "明确输入状态与学习目标。",
        },
        {
            "title": process_title,
            "description": process_description,
            "emphasis": "高亮关键动作与状态变化。",
        },
        {
            "title": summary_title,
            "description": summary_description,
            "emphasis": "总结最终结果与可迁移规律。",
        },
    ]

    return {
        "kind": "animation_storyboard",
        "animation_family": "algorithm_demo",
        "algorithm_type": algorithm_type,
        "title": title,
        "topic": topic,
        "summary": summary or f"通过动画讲解 {topic} 的关键步骤。",
        "teaching_goal": teaching_goal,
        "focus": focus,
        "visual_type": "process_flow",
        "subject_family": "algorithm_demo",
        "layout_type": (
            "algorithm_window" if algorithm_type == "binary_search" else "algorithm_bars"
        ),
        "style_pack": style_pack,
        "duration_seconds": duration_seconds,
        "rhythm": rhythm,
        "theme": _resolve_theme(style_pack, content.get("theme")),
        "dataset": dataset,
        "steps": steps,
        "scenes": scenes,
        "objects": [str(item) for item in dataset],
        "object_details": [
            {"id": f"data-{index}", "label": str(value), "kind": "data_point"}
            for index, value in enumerate(dataset)
        ],
    }


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
    style_pack = _resolve_style_pack(content.get("style_pack"))
    algorithm_type = _infer_algorithm_type(
        title,
        topic,
        summary,
        focus,
        str(content.get("algorithm_type") or ""),
        str(content.get("motion_brief") or ""),
    )

    # Deterministic algorithm templates are now debug-only. Runtime default is
    # API-driven AI generation + structural normalization.
    if _coerce_bool(content.get("use_deterministic_algorithm_seed")):
        algorithm_demo_spec = _build_algorithm_demo_spec(
            content=content,
            title=title,
            topic=topic,
            summary=summary,
            focus=focus,
            duration_seconds=duration_seconds,
            rhythm=rhythm,
            style_pack=style_pack,
        )
        if algorithm_demo_spec is not None:
            return algorithm_demo_spec

    visual_type = infer_visual_type(content)
    subject_family, animation_family = _resolve_subject_family(
        content=content,
        visual_type=visual_type,
    )
    layout_type = infer_layout_type(subject_family, visual_type)
    if animation_family == "algorithm_demo":
        layout_type = (
            "algorithm_window" if algorithm_type == "binary_search" else "algorithm_bars"
        )
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
        "animation_family": animation_family,
        "family_hint": animation_family,
        "layout_type": layout_type,
        "style_pack": style_pack,
        "duration_seconds": duration_seconds,
        "rhythm": rhythm,
        "theme": _resolve_theme(style_pack, content.get("theme")),
        "scenes": normalized_scenes,
        "objects": [item["label"] for item in semantic_objects],
        "object_details": semantic_objects,
    }
    if algorithm_type:
        spec["algorithm_type"] = algorithm_type
    raw_steps = content.get("steps")
    if isinstance(raw_steps, list):
        normalized_steps = [dict(item) for item in raw_steps if isinstance(item, dict)]
        if normalized_steps:
            spec["steps"] = normalized_steps
    raw_dataset = content.get("dataset")
    if isinstance(raw_dataset, list):
        spec["dataset"] = list(raw_dataset)
    return spec
