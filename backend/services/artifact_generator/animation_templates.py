"""High-quality animation templates for common scenarios.

Templates provide stable multi-shot structure and layout.
LLM only fills content slots (labels, text, colors).
"""

from __future__ import annotations

from typing import Any, Callable

TemplateResult = dict[str, Any]
TemplateFn = Callable[[dict[str, Any]], TemplateResult]


def _clip(text: Any, max_len: int = 36) -> str:
    value = str(text or "").strip()
    if len(value) <= max_len:
        return value
    return value[: max_len - 1].rstrip() + "…"


# ===========================================================================
# Template 1: Protocol Exchange (TCP, HTTP, DNS)
# ===========================================================================


def template_protocol_exchange(slots: dict[str, Any]) -> TemplateResult:
    """Multi-shot protocol exchange template with stronger visual cues."""
    left_label = _clip(slots.get("left_label") or "客户端", 16)
    right_label = _clip(slots.get("right_label") or "服务端", 16)
    raw_steps = slots.get("steps") or []

    steps: list[dict[str, Any]] = []
    for i, step in enumerate(raw_steps[:6]):
        if not isinstance(step, dict):
            continue
        label = _clip(
            step.get("label") or step.get("arrow_label") or f"步骤{i + 1}", 24
        )
        direction = str(step.get("direction") or "left_to_right").strip().lower()
        if direction not in {"left_to_right", "right_to_left"}:
            direction = "left_to_right"
        description = _clip(
            step.get("description") or step.get("emphasis") or f"第{i + 1}步：{label}",
            64,
        )
        steps.append(
            {"label": label, "direction": direction, "description": description}
        )

    if not steps:
        steps = [
            {
                "label": "SYN",
                "direction": "left_to_right",
                "description": "客户端发起连接请求",
            },
            {
                "label": "SYN-ACK",
                "direction": "right_to_left",
                "description": "服务端确认并回应",
            },
            {
                "label": "ACK",
                "direction": "left_to_right",
                "description": "客户端确认连接建立",
            },
        ]

    objects: list[dict[str, Any]] = [
        {
            "id": "left_endpoint",
            "type": "icon",
            "name": "server",
            "label": left_label,
            "color": "BLUE_C",
            "position": [-4.0, 0.0],
            "size": 1.15,
            "style": {"fill_opacity": 0.58},
        },
        {
            "id": "right_endpoint",
            "type": "icon",
            "name": "cloud",
            "label": right_label,
            "color": "GREEN_C",
            "position": [4.0, 0.0],
            "size": 1.15,
            "style": {"fill_opacity": 0.58},
        },
    ]

    timeline: list[dict[str, Any]] = [
        {
            "description": f"{left_label} 与 {right_label} 建立通信",
            "actions": [
                {
                    "type": "fade_in",
                    "target": ["left_endpoint", "right_endpoint"],
                    "params": {"run_time": 0.78},
                    "lag_ratio": 0.25,
                }
            ],
            "wait_after": 0.55,
        }
    ]

    for i, step in enumerate(steps):
        direction = step["direction"]
        start_pos = [-2.6, 0.0] if direction == "left_to_right" else [2.6, 0.0]
        end_pos = [2.6, 0.0] if direction == "left_to_right" else [-2.6, 0.0]
        active_side = (
            "left_endpoint" if direction == "left_to_right" else "right_endpoint"
        )

        arrow_id = f"arrow_step_{i}"
        packet_id = f"packet_step_{i}"
        note_id = f"note_step_{i}"
        ring_id = f"ring_step_{i}"

        ring_pos = [-4.0, 0.0] if direction == "left_to_right" else [4.0, 0.0]

        objects.extend(
            [
                {
                    "id": arrow_id,
                    "type": "arrow",
                    "color": "YELLOW",
                    "position": [0.0, 0.0],
                    "style": {"start": start_pos, "end": end_pos, "stroke_width": 4},
                },
                {
                    "id": packet_id,
                    "type": "text",
                    "label": step["label"],
                    "color": "ORANGE",
                    "position": [0.0, 0.56],
                    "style": {"font_size": 24},
                },
                {
                    "id": note_id,
                    "type": "text",
                    "label": _clip(step["description"], 24),
                    "color": "TEAL",
                    "position": [0.0, -1.35],
                    "style": {"font_size": 18},
                },
                {
                    "id": ring_id,
                    "type": "circle",
                    "color": "YELLOW",
                    "position": ring_pos,
                    "size": {"radius": 1.2},
                    "style": {"fill_opacity": 0.08, "stroke_width": 3},
                },
            ]
        )

        timeline.append(
            {
                "description": step["description"],
                "actions": [
                    {"type": "create", "target": ring_id, "params": {"run_time": 0.3}},
                    {
                        "type": "grow_arrow",
                        "target": arrow_id,
                        "params": {"run_time": 0.72},
                    },
                    {
                        "type": "fade_in",
                        "target": [packet_id, note_id],
                        "params": {"run_time": 0.42},
                        "lag_ratio": 0.15,
                    },
                    {
                        "type": "indicate",
                        "target": active_side,
                        "params": {"color": "YELLOW", "run_time": 0.46},
                    },
                ],
                "wait_after": 0.8,
            }
        )

        if i < len(steps) - 1:
            timeline.append(
                {
                    "description": "转场到下一步",
                    "actions": [
                        {
                            "type": "fade_out",
                            "target": [arrow_id, packet_id, note_id, ring_id],
                            "params": {"run_time": 0.34},
                        }
                    ],
                    "wait_after": 0.2,
                }
            )

    return {"objects": objects, "timeline": timeline}


# ===========================================================================
# Template 2: Process Flow
# ===========================================================================


def template_process_flow(slots: dict[str, Any]) -> TemplateResult:
    """Linear process flow with per-step callouts and highlights."""
    stages = slots.get("stages") or ["阶段1", "阶段2", "阶段3"]
    stages = [_clip(stage, 14) for stage in stages if str(stage or "").strip()]
    stages = stages[:5] if stages else ["阶段1", "阶段2", "阶段3"]

    objects: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []

    num_stages = len(stages)
    spacing = 8.0 / max(num_stages - 1, 1)
    start_x = -4.0

    stage_icons = ["database", "router", "cloud", "check", "star"]

    for i, stage_label in enumerate(stages):
        x_pos = start_x + i * spacing
        stage_id = f"stage_{i}"
        icon_id = f"stage_icon_{i}"
        callout_id = f"callout_{i}"

        objects.append(
            {
                "id": stage_id,
                "type": "box",
                "label": stage_label,
                "color": "BLUE_C",
                "position": [x_pos, 0.0],
                "size": {"width": 1.9, "height": 1.2},
                "style": {"fill_opacity": 0.56, "corner_radius": 0.22},
            }
        )
        objects.append(
            {
                "id": icon_id,
                "type": "icon",
                "name": stage_icons[i % len(stage_icons)],
                "label": "",
                "color": "TEAL",
                "position": [x_pos, 1.05],
                "size": 0.56,
                "style": {"fill_opacity": 0.9},
            }
        )
        objects.append(
            {
                "id": callout_id,
                "type": "text",
                "label": f"重点：{_clip(stage_label, 10)}",
                "color": "TEAL",
                "position": [x_pos, -1.25],
                "style": {"font_size": 18},
            }
        )

        if i < num_stages - 1:
            objects.append(
                {
                    "id": f"arrow_{i}",
                    "type": "arrow",
                    "color": "GRAY_D",
                    "position": [0.0, 0.0],
                    "style": {
                        "start": [x_pos + 1.0, 0.0],
                        "end": [x_pos + spacing - 1.0, 0.0],
                    },
                }
            )

    for i, stage_label in enumerate(stages):
        stage_id = f"stage_{i}"
        icon_id = f"stage_icon_{i}"
        callout_id = f"callout_{i}"
        actions: list[dict[str, Any]] = [
            {"type": "fade_in", "target": icon_id, "params": {"run_time": 0.26}},
            {"type": "fade_in", "target": stage_id, "params": {"run_time": 0.45}},
            {
                "type": "indicate",
                "target": stage_id,
                "params": {"color": "YELLOW", "run_time": 0.48},
            },
            {"type": "fade_in", "target": callout_id, "params": {"run_time": 0.32}},
        ]
        if i < num_stages - 1:
            actions.append(
                {
                    "type": "grow_arrow",
                    "target": f"arrow_{i}",
                    "params": {"run_time": 0.42},
                }
            )

        timeline.append(
            {
                "description": f"进入 {stage_label}",
                "actions": actions,
                "wait_after": 0.72,
            }
        )

        if i < num_stages - 1:
            timeline.append(
                {
                    "description": "转场到下一阶段",
                    "actions": [
                        {
                            "type": "fade_out",
                            "target": callout_id,
                            "params": {"run_time": 0.24},
                        }
                    ],
                    "wait_after": 0.12,
                }
            )

    return {"objects": objects, "timeline": timeline}


# ===========================================================================
# Template 3: Comparison (A vs B)
# ===========================================================================


def template_comparison(slots: dict[str, Any]) -> TemplateResult:
    """Side-by-side comparison template with emphasis chips."""
    left_title = _clip(slots.get("left_title") or "方案A", 16)
    right_title = _clip(slots.get("right_title") or "方案B", 16)

    left_points = slots.get("left_points") or slots.get("left_items") or []
    right_points = slots.get("right_points") or slots.get("right_items") or []
    left_points = [_clip(item, 16) for item in left_points[:3]]
    right_points = [_clip(item, 16) for item in right_points[:3]]

    objects: list[dict[str, Any]] = [
        {
            "id": "left_panel",
            "type": "box",
            "label": left_title,
            "color": "BLUE_C",
            "position": [-3.1, 1.5],
            "size": {"width": 3.6, "height": 1.25},
            "style": {"fill_opacity": 0.56, "corner_radius": 0.22},
        },
        {
            "id": "right_panel",
            "type": "box",
            "label": right_title,
            "color": "GREEN_C",
            "position": [3.1, 1.5],
            "size": {"width": 3.6, "height": 1.25},
            "style": {"fill_opacity": 0.56, "corner_radius": 0.22},
        },
        {
            "id": "left_icon",
            "type": "icon",
            "name": "check",
            "label": "",
            "color": "GREEN_C",
            "position": [-4.7, 1.5],
            "size": 0.52,
            "style": {"fill_opacity": 0.95},
        },
        {
            "id": "right_icon",
            "type": "icon",
            "name": "cross",
            "label": "",
            "color": "RED_C",
            "position": [4.7, 1.5],
            "size": 0.52,
            "style": {"fill_opacity": 0.95},
        },
    ]

    timeline: list[dict[str, Any]] = [
        {
            "description": f"{left_title} 对比 {right_title}",
            "actions": [
                {
                    "type": "fade_in",
                    "target": ["left_panel", "right_panel", "left_icon", "right_icon"],
                    "params": {"run_time": 0.7},
                    "lag_ratio": 0.25,
                }
            ],
            "wait_after": 0.6,
        }
    ]

    for i, point in enumerate(left_points):
        point_id = f"left_point_{i}"
        objects.append(
            {
                "id": point_id,
                "type": "text",
                "label": f"• {point}",
                "color": "WHITE",
                "position": [-3.1, 0.6 - i * 0.8],
                "style": {"font_size": 20},
            }
        )
        timeline.append(
            {
                "description": f"左侧要点：{point}",
                "actions": [
                    {
                        "type": "fade_in",
                        "target": point_id,
                        "params": {"run_time": 0.34},
                    },
                    {
                        "type": "indicate",
                        "target": "left_panel",
                        "params": {"color": "YELLOW", "run_time": 0.34},
                    },
                ],
                "wait_after": 0.34,
            }
        )

    for i, point in enumerate(right_points):
        point_id = f"right_point_{i}"
        objects.append(
            {
                "id": point_id,
                "type": "text",
                "label": f"• {point}",
                "color": "WHITE",
                "position": [3.1, 0.6 - i * 0.8],
                "style": {"font_size": 20},
            }
        )
        timeline.append(
            {
                "description": f"右侧要点：{point}",
                "actions": [
                    {
                        "type": "fade_in",
                        "target": point_id,
                        "params": {"run_time": 0.34},
                    },
                    {
                        "type": "indicate",
                        "target": "right_panel",
                        "params": {"color": "YELLOW", "run_time": 0.34},
                    },
                ],
                "wait_after": 0.34,
            }
        )

    return {"objects": objects, "timeline": timeline}


# ===========================================================================
# Template Registry
# ===========================================================================

TEMPLATES: dict[str, TemplateFn] = {
    "protocol_exchange": template_protocol_exchange,
    "process_flow": template_process_flow,
    "comparison": template_comparison,
}


def apply_template(template_name: str, slots: dict[str, Any]) -> TemplateResult | None:
    """Apply a template with given content slots."""
    template_fn = TEMPLATES.get(template_name)
    if not template_fn:
        return None
    return template_fn(slots)
