"""High-frequency animation templates.

This module holds additional pedagogical templates to avoid over-growing
`animation_templates.py` while keeping template semantics explicit.
"""

from __future__ import annotations

from typing import Any

TemplateResult = dict[str, Any]


def _clip(text: Any, max_len: int = 24) -> str:
    value = str(text or "").strip()
    if len(value) <= max_len:
        return value
    return value[: max_len - 1].rstrip() + "..."


def template_scientific_process(slots: dict[str, Any]) -> TemplateResult:
    """Scientific process template: photosynthesis / respiration / water cycle."""
    stages = slots.get("stages") or ["Input", "Transform", "Output"]
    stages = [_clip(s, 12) for s in stages if str(s or "").strip()][:5]
    if len(stages) < 3:
        stages = ["Input", "Transform", "Output"]

    highlights = slots.get("highlights") or []
    highlights = [_clip(h, 16) for h in highlights if str(h or "").strip()][
        : len(stages)
    ]

    objects: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []

    stage_icons = ["sun", "leaf", "molecule", "atom", "star"]
    accent_colors = ["YELLOW", "GREEN_C", "TEAL_C", "ORANGE", "BLUE_C"]
    icon_labels = ["\u5149\u80fd", "\u53f6\u7247", "\u8f6c\u5316", "\u4ea7\u7269", "\u7ed3\u679c"]

    for i, stage in enumerate(stages):
        stage_id = f"stage_{i}"
        icon_id = f"icon_{i}"
        title_id = f"stage_title_{i}"
        next_arrow_id = f"next_arrow_{i}"
        accent_color = accent_colors[i % len(accent_colors)]

        icon_x = -3.0
        icon_y = 1.35
        card_x = 1.0
        card_y = 1.35

        objects.append(
            {
                "id": icon_id,
                "type": "icon",
                "name": stage_icons[i % len(stage_icons)],
                "label": icon_labels[i % len(icon_labels)],
                "color": accent_color,
                "position": [icon_x, icon_y],
                "size": 1.3,
                "style": {"fill_opacity": 0.9},
            }
        )
        objects.append(
            {
                "id": stage_id,
                "type": "box",
                "label": stage,
                "color": accent_color,
                "position": [card_x, card_y],
                "size": {"width": 4.1, "height": 1.15},
                "style": {
                    "fill_opacity": 0.78,
                    "corner_radius": 0.24,
                    "font_size": 22,
                },
            }
        )
        objects.append(
            {
                "id": title_id,
                "type": "text",
                "label": f"\u7b2c{i + 1}\u6b65",
                "color": "BLUE_E",
                "position": [-4.2, 1.95],
                "style": {"font_size": 20},
            }
        )

        if i < len(stages) - 1:
            objects.append(
                {
                    "id": next_arrow_id,
                    "type": "arrow",
                    "color": accent_color,
                    "position": [0.0, 0.0],
                    "style": {"start": [3.0, card_y], "end": [3.85, card_y]},
                }
            )

        current_targets: list[str] = [icon_id, stage_id, title_id]
        if i < len(stages) - 1:
            current_targets.append(next_arrow_id)

        actions: list[dict[str, Any]] = []
        if i > 0:
            previous_targets = [
                f"icon_{i - 1}",
                f"stage_{i - 1}",
                f"stage_title_{i - 1}",
            ]
            if i - 1 < len(stages) - 1:
                previous_targets.append(f"next_arrow_{i - 1}")
            actions.append(
                {
                    "type": "fade_out",
                    "target": previous_targets,
                    "params": {"run_time": 0.14},
                }
            )

        actions.extend(
            [
                {
                    "type": "fade_in",
                    "target": [icon_id, title_id],
                    "params": {"run_time": 0.2, "shift": [-0.06, 0.1]},
                },
                {
                    "type": "fade_in",
                    "target": stage_id,
                    "params": {"run_time": 0.24, "shift": [0.06, 0.08]},
                },
                {
                    "type": "indicate",
                    "target": stage_id,
                    "params": {"color": "YELLOW", "run_time": 0.28, "scale_factor": 1.04},
                },
            ]
        )
        if i == 0:
            actions.extend(
                [
                    {
                        "type": "pulse_glow",
                        "target": [icon_id, stage_id],
                        "params": {
                            "color": "YELLOW",
                            "run_time": 0.24,
                            "opacity": 0.16,
                            "buff": 0.12,
                        },
                    },
                    {
                        "type": "absorb_to",
                        "target": stage_id,
                        "params": {
                            "color": "YELLOW",
                            "run_time": 0.34,
                            "source_positions": [[-1.0, 1.85], [-0.55, 1.65], [-0.1, 1.85]],
                        },
                    },
                ]
            )
        elif i == 1:
            actions.extend(
                [
                    {
                        "type": "absorb_to",
                        "target": stage_id,
                        "params": {
                            "color": "BLUE_C",
                            "run_time": 0.36,
                            "source_positions": [[-3.95, 1.0], [-3.7, 0.7], [-3.95, 0.35]],
                        },
                    },
                    {
                        "type": "pulse_glow",
                        "target": stage_id,
                        "params": {
                            "color": accent_color,
                            "run_time": 0.18,
                            "opacity": 0.12,
                        },
                    },
                ]
            )
        elif i == 2:
            actions.extend(
                [
                    {
                        "type": "pulse_glow",
                        "target": [icon_id, stage_id],
                        "params": {
                            "color": accent_color,
                            "run_time": 0.24,
                            "opacity": 0.15,
                            "glow_scale": 1.1,
                        },
                    },
                    {
                        "type": "absorb_to",
                        "target": icon_id,
                        "params": {
                            "color": "TEAL_C",
                            "run_time": 0.28,
                            "source_positions": [[-3.4, 1.35], [-3.0, 1.55], [-2.6, 1.35]],
                            "dot_radius": 0.06,
                        },
                    },
                ]
            )
        else:
            actions.extend(
                [
                    {
                        "type": "emit_from",
                        "target": stage_id,
                        "params": {
                            "color": accent_color,
                            "run_time": 0.34,
                            "destination_positions": [[2.95, 1.2], [3.2, 1.0], [2.95, 0.8]],
                        },
                    },
                    {
                        "type": "pulse_glow",
                        "target": stage_id,
                        "params": {
                            "color": accent_color,
                            "run_time": 0.18,
                            "opacity": 0.1,
                        },
                    },
                ]
            )
        if i < len(stages) - 1:
            actions.append(
                {
                    "type": "grow_arrow",
                    "target": next_arrow_id,
                    "params": {"run_time": 0.18},
                }
            )

        timeline.append(
            {
                "description": stage,
                "actions": actions,
                "focus_targets": current_targets,
                "wait_after": 0.68,
            }
        )

    return {"objects": objects, "timeline": timeline}


def template_biological_cycle(slots: dict[str, Any]) -> TemplateResult:
    """Biological cycle template: mitosis / life cycle."""
    cycle_name = _clip(slots.get("cycle_name") or "Biological Cycle", 22)
    phases = slots.get("phases") or ["Phase 1", "Phase 2", "Phase 3", "Phase 4"]
    phases = [_clip(p, 12) for p in phases if str(p or "").strip()][:6]
    if len(phases) < 3:
        phases = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"]

    ring_positions = [
        [0.0, 1.8],
        [2.5, 0.7],
        [2.5, -1.2],
        [0.0, -2.0],
        [-2.5, -1.2],
        [-2.5, 0.7],
    ]

    objects: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []

    count = len(phases)
    for i, phase in enumerate(phases):
        pos = ring_positions[i % len(ring_positions)]
        phase_id = f"phase_{i}"
        icon_id = f"phase_icon_{i}"

        # Add cell icon inside the circle
        objects.append(
            {
                "id": icon_id,
                "type": "icon",
                "name": "cell",
                "label": "",
                "color": "TEAL",
                "position": [pos[0], pos[1]],
                "size": 1.2,
                "style": {"fill_opacity": 0.8},
            }
        )

        objects.append(
            {
                "id": phase_id,
                "type": "circle",
                "label": phase,
                "color": "PURPLE_C",
                "position": pos,
                "size": {"radius": 0.85},
                "style": {"fill_opacity": 0.52, "stroke_width": 3},
            }
        )

        next_pos = ring_positions[(i + 1) % count]
        arrow_id = f"cycle_arrow_{i}"
        objects.append(
            {
                "id": arrow_id,
                "type": "arrow",
                "color": "BLUE_B",
                "position": [0.0, 0.0],
                "style": {"start": pos, "end": next_pos, "stroke_width": 3},
            }
        )

        timeline.append(
            {
                "description": f"循环阶段：{phase}",
                "actions": [
                    {
                        "type": "fade_in",
                        "target": icon_id,
                        "params": {"run_time": 0.25},
                    },
                    {
                        "type": "fade_in",
                        "target": phase_id,
                        "params": {"run_time": 0.3},
                    },
                    {
                        "type": "grow_arrow",
                        "target": arrow_id,
                        "params": {"run_time": 0.35},
                    },
                    {
                        "type": "indicate",
                        "target": phase_id,
                        "params": {"color": "YELLOW", "run_time": 0.35},
                    },
                ],
                "wait_after": 0.55,
            }
        )

    return {"objects": objects, "timeline": timeline}


def template_data_flow(slots: dict[str, Any]) -> TemplateResult:
    """Data flow template: data processing / algorithm pipeline."""
    input_label = _clip(slots.get("input_label") or "Input", 14)
    process_steps = slots.get("process_steps") or ["Clean", "Transform", "Compute"]
    process_steps = [
        _clip(step, 14) for step in process_steps if str(step or "").strip()
    ][:4]
    if len(process_steps) < 2:
        process_steps = ["Clean", "Transform", "Compute"]
    output_label = _clip(slots.get("output_label") or "Output", 14)

    all_nodes = [input_label, *process_steps, output_label]
    spacing = 8.4 / max(len(all_nodes) - 1, 1)
    start_x = -4.2

    objects: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []
    node_icons = ["database", "router", "cloud", "molecule", "check", "star"]

    for i, label in enumerate(all_nodes):
        x = start_x + i * spacing
        node_id = f"node_{i}"
        icon_id = f"node_icon_{i}"
        node_color = "BLUE_C"
        if i == 0:
            node_color = "GREEN_C"
        elif i == len(all_nodes) - 1:
            node_color = "ORANGE"

        objects.append(
            {
                "id": node_id,
                "type": "box",
                "label": label,
                "color": node_color,
                "position": [x, 0.0],
                "size": {"width": 1.55, "height": 1.0},
                "style": {"fill_opacity": 0.58, "corner_radius": 0.2},
            }
        )
        objects.append(
            {
                "id": icon_id,
                "type": "icon",
                "name": node_icons[i % len(node_icons)],
                "label": "",
                "color": "TEAL",
                "position": [x, 0.86],
                "size": 0.5,
                "style": {"fill_opacity": 0.9},
            }
        )

        if i < len(all_nodes) - 1:
            objects.append(
                {
                    "id": f"flow_{i}",
                    "type": "arrow",
                    "color": "YELLOW",
                    "position": [0.0, 0.0],
                    "style": {
                        "start": [x + 0.9, 0.0],
                        "end": [x + spacing - 0.9, 0.0],
                        "stroke_width": 4,
                    },
                }
            )

    for i, label in enumerate(all_nodes):
        actions: list[dict[str, Any]] = [
            {
                "type": "fade_in",
                "target": f"node_icon_{i}",
                "params": {"run_time": 0.24},
            },
            {"type": "fade_in", "target": f"node_{i}", "params": {"run_time": 0.33}},
            {
                "type": "indicate",
                "target": f"node_{i}",
                "params": {"color": "YELLOW", "run_time": 0.33},
            },
        ]
        if i < len(all_nodes) - 1:
            actions.append(
                {
                    "type": "grow_arrow",
                    "target": f"flow_{i}",
                    "params": {"run_time": 0.33},
                }
            )

        timeline.append(
            {
                "description": f"数据步骤 {i + 1}：{label}",
                "actions": actions,
                "wait_after": 0.5,
            }
        )

    return {"objects": objects, "timeline": timeline}
