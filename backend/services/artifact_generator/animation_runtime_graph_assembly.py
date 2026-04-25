from __future__ import annotations

import re
from typing import Any

SUPPORTED_EXPLAINER_FAMILIES = {
    "algorithm_demo",
    "physics_mechanics",
    "system_flow",
    "math_transform",
}

ALLOWED_GRAPH_ACTIONS = {
    "highlight",
    "swap",
    "move",
    "compare",
    "reveal",
    "connect",
    "annotate",
    "transform_value",
    "focus",
    "complete",
}

GRAPH_ACTION_ALIASES = {
    "appear": "reveal",
    "arrive": "move",
    "advance": "move",
    "annotate_focus": "annotate",
    "call_out": "annotate",
    "emphasize": "highlight",
    "establish": "reveal",
    "fade_in": "reveal",
    "merge": "connect",
    "recap": "highlight",
    "reveal_layout": "reveal",
    "trace": "focus",
    "trace_path": "focus",
    "transition": "move",
    # Common LLM drift tokens observed in algorithm demos.
    "skip": "compare",
    "inspect": "compare",
    "scan": "compare",
    "visit": "focus",
    "lock": "complete",
    "settle": "complete",
    "mark_sorted": "complete",
    "stabilize": "complete",
}


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def _coerce_numeric_dataset(value: Any) -> list[float]:
    if not isinstance(value, list):
        return []
    dataset: list[float] = []
    for item in value:
        if isinstance(item, (int, float)):
            dataset.append(float(item))
    return dataset


def _normalize_indices(value: Any, length: int) -> list[int]:
    if not isinstance(value, list):
        return []
    normalized: list[int] = []
    for item in value:
        if not isinstance(item, int):
            continue
        if item < 0 or item >= length:
            continue
        normalized.append(item)
    return normalized


def _seed_algorithm_snapshots(
    raw_steps: list[dict[str, Any]],
    content: dict[str, Any],
) -> list[dict[str, Any]]:
    if not raw_steps:
        return []

    dataset = _coerce_numeric_dataset(content.get("dataset"))
    if not dataset:
        dataset = [5.0, 3.0, 8.0, 2.0, 6.0]
    working = list(dataset)
    if not working:
        return []

    seeded_steps: list[dict[str, Any]] = []
    pair_cursor = 0
    unsorted_right = max(len(working) - 1, 1)
    algorithm_type = clean_text(content.get("algorithm_type")).lower()
    prefer_bubble_mode = algorithm_type in {"", "bubble_sort"}

    for step_index, step in enumerate(raw_steps):
        next_step = dict(step)
        active_indices = _normalize_indices(step.get("active_indices"), len(working))
        swap_indices = _normalize_indices(step.get("swap_indices"), len(working))
        swapped = False

        if step_index > 0:
            if len(swap_indices) >= 2:
                left, right = swap_indices[0], swap_indices[1]
                if left != right:
                    working[left], working[right] = working[right], working[left]
                    swapped = True
                if not active_indices:
                    active_indices = [left, right]
            elif prefer_bubble_mode and len(working) >= 2:
                if pair_cursor >= unsorted_right:
                    pair_cursor = 0
                    unsorted_right = max(unsorted_right - 1, 1)
                left = pair_cursor
                right = min(pair_cursor + 1, len(working) - 1)
                active_indices = [left, right]
                if left != right and working[left] > working[right]:
                    working[left], working[right] = working[right], working[left]
                    swap_indices = [left, right]
                    swapped = True
                pair_cursor += 1

        if not active_indices and len(working) >= 2:
            active_indices = [0, 1]

        if swapped and not swap_indices and len(active_indices) >= 2:
            swap_indices = active_indices[:2]

        next_step["snapshot"] = list(working)
        next_step["active_indices"] = active_indices
        next_step["swap_indices"] = swap_indices
        seeded_steps.append(next_step)

    return seeded_steps


def canonical_action_hint(value: Any) -> str:
    action_name = clean_text(value).lower().replace("-", "_").replace(" ", "_")
    action_name = re.sub(r"[^a-z0-9_]+", "_", action_name).strip("_")
    if action_name in ALLOWED_GRAPH_ACTIONS:
        return action_name
    return GRAPH_ACTION_ALIASES.get(action_name, "")


def normalize_action_hints(raw_hints: Any) -> list[str]:
    if not isinstance(raw_hints, list):
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_hints:
        action_name = canonical_action_hint(item)
        if not action_name or action_name in seen:
            continue
        normalized.append(action_name)
        seen.add(action_name)
    return normalized


def scene_outline(content: dict[str, Any]) -> list[dict[str, Any]]:
    outline: list[dict[str, Any]] = []
    for raw_scene in content.get("scenes") or []:
        if not isinstance(raw_scene, dict):
            continue
        title = clean_text(raw_scene.get("title")) or f"Scene {len(outline) + 1}"
        summary = clean_text(raw_scene.get("description") or raw_scene.get("emphasis"))
        outline.append({"title": title, "summary": summary or None})
    if outline:
        return outline
    title = clean_text(content.get("title")) or "Animation"
    summary = clean_text(content.get("summary")) or None
    return [{"title": title, "summary": summary}]


def normalized_steps(content: dict[str, Any]) -> list[dict[str, Any]]:
    raw_steps = content.get("steps")
    normalized_raw_steps = (
        [step for step in raw_steps if isinstance(step, dict)]
        if isinstance(raw_steps, list)
        else []
    )
    is_algorithm_family = clean_text(
        content.get("animation_family") or content.get("family_hint")
    ).lower() == "algorithm_demo"
    has_algorithm_snapshot = False
    needs_algorithm_snapshot_seed = False
    if normalized_raw_steps:
        if not is_algorithm_family:
            return normalized_raw_steps
        has_algorithm_snapshot = any(
            isinstance(step.get("snapshot"), list) and bool(step.get("snapshot"))
            for step in normalized_raw_steps
        )
        if has_algorithm_snapshot:
            return normalized_raw_steps
        needs_algorithm_snapshot_seed = True

    runtime_graph = content.get("runtime_graph")
    if isinstance(runtime_graph, dict):
        graph_steps = runtime_graph.get("steps")
        if isinstance(graph_steps, list) and graph_steps:
            converted_steps: list[dict[str, Any]] = []
            for index, graph_step in enumerate(graph_steps, start=1):
                if not isinstance(graph_step, dict):
                    continue
                caption = graph_step.get("primary_caption")
                caption_title = ""
                caption_body = ""
                if isinstance(caption, dict):
                    caption_title = clean_text(caption.get("title"))
                    caption_body = clean_text(caption.get("body"))

                snapshot: list[float] = []
                active_indices: list[int] = []
                swap_indices: list[int] = []
                entities = graph_step.get("entities")
                if isinstance(entities, list):
                    for entity in entities:
                        if not isinstance(entity, dict):
                            continue
                        if clean_text(entity.get("kind")) != "track_stack":
                            continue
                        raw_items = entity.get("items")
                        if isinstance(raw_items, list) and raw_items:
                            for item_index, item in enumerate(raw_items):
                                if not isinstance(item, dict):
                                    continue
                                raw_value = item.get("value")
                                if not isinstance(raw_value, (int, float)):
                                    continue
                                snapshot.append(float(raw_value))
                                accent = clean_text(item.get("accent")).lower()
                                if accent == "active":
                                    active_indices.append(item_index)
                                elif accent == "swap":
                                    swap_indices.append(item_index)
                        else:
                            raw_data = entity.get("data")
                            if isinstance(raw_data, list) and raw_data:
                                parsed_snapshot: list[float] = []
                                for raw_value in raw_data:
                                    if isinstance(raw_value, (int, float)):
                                        parsed_snapshot.append(float(raw_value))
                                if parsed_snapshot:
                                    snapshot = parsed_snapshot
                                raw_highlight = entity.get("highlight")
                                if isinstance(raw_highlight, list):
                                    highlight_indices = [
                                        value
                                        for value in raw_highlight
                                        if isinstance(value, int)
                                    ]
                                    if len(highlight_indices) >= 2:
                                        swap_indices = highlight_indices
                                    elif len(highlight_indices) == 1:
                                        active_indices = highlight_indices
                        if snapshot:
                            break

                action = "reveal"
                if swap_indices:
                    action = "swap"
                elif active_indices:
                    action = "compare"
                converted_steps.append(
                    {
                        "title": caption_title or f"Step {index}",
                        "caption": caption_body or caption_title or f"Step {index}",
                        "action": action,
                        "snapshot": snapshot,
                        "active_indices": active_indices,
                        "swap_indices": swap_indices,
                    }
                )
            if converted_steps:
                return converted_steps

    if needs_algorithm_snapshot_seed:
        seeded_steps = _seed_algorithm_snapshots(normalized_raw_steps, content)
        if seeded_steps:
            return seeded_steps

    steps: list[dict[str, Any]] = []
    for scene in content.get("scenes") or []:
        if not isinstance(scene, dict):
            continue
        title = clean_text(scene.get("title")) or f"Step {len(steps) + 1}"
        desc = clean_text(scene.get("description") or scene.get("emphasis") or title)
        steps.append({"action": "reveal", "caption": desc, "title": title})
    if steps:
        return steps
    title = clean_text(content.get("title")) or "Animation"
    summary = clean_text(content.get("summary")) or title
    return [{"action": "reveal", "caption": summary, "title": title}]


def default_action_hint(step: dict[str, Any], family_hint: str) -> list[str]:
    action = clean_text(step.get("action")).lower()
    if family_hint == "algorithm_demo":
        mapping = {
            "compare": ["compare", "highlight"],
            "swap": ["swap", "move", "highlight"],
            "done": ["complete", "highlight"],
        }
        return mapping.get(action, ["highlight"])
    if family_hint == "physics_mechanics":
        return ["move", "focus"]
    if family_hint == "system_flow":
        return ["connect", "highlight"]
    if family_hint == "math_transform":
        return ["transform_value", "focus"]
    return ["highlight"]


def build_explainer_draft_seed(content: dict[str, Any], family_hint: str) -> dict[str, Any]:
    steps = normalized_steps(content)
    outline: list[dict[str, Any]]
    if family_hint == "algorithm_demo":
        dataset = content.get("dataset") if isinstance(content.get("dataset"), list) else []
        outline = [
            {
                "id": f"track-item-{index}",
                "kind": "track_stack",
                "label": f"Track {index + 1}" if dataset else "Array state",
            }
            for index, _ in enumerate(dataset[:1] or [0])
        ]
    elif family_hint == "physics_mechanics":
        outline = [
            {"id": "body-main", "kind": "node", "label": "Object"},
            {"id": "vector-main", "kind": "vector", "label": "Force / velocity"},
            {"id": "path-main", "kind": "path", "label": "Trajectory"},
        ]
    elif family_hint == "system_flow":
        outline = [
            {"id": "node-source", "kind": "node", "label": "Source"},
            {"id": "node-target", "kind": "node", "label": "Target"},
            {"id": "edge-main", "kind": "edge", "label": "Flow"},
        ]
    elif family_hint == "math_transform":
        outline = [
            {"id": "axis-main", "kind": "axis", "label": "Axes"},
            {"id": "curve-main", "kind": "curve", "label": "Function"},
            {"id": "badge-param", "kind": "badge", "label": "Parameter"},
        ]
    else:
        outline = [{"id": "node-main", "kind": "node", "label": "Subject"}]

    return {
        "story_beats": [
            clean_text(step.get("title") or step.get("caption") or f"Beat {index + 1}")
            for index, step in enumerate(steps)
        ],
        "entities_outline": outline,
        "step_captions": [
            {
                "caption_title": clean_text(step.get("title") or step.get("action") or f"Step {index + 1}"),
                "caption_body": clean_text(step.get("caption") or step.get("description") or f"Step {index + 1}"),
            }
            for index, step in enumerate(steps)
        ],
        "action_hints": [default_action_hint(step, family_hint) for step in steps],
        "layout_intent": "subject centered with a single caption in the bottom safe area",
        "focus_targets": [item["id"] for item in outline[:2]],
        "family_hint": family_hint,
        "style_tone": clean_text(content.get("style_pack") or "teaching_ppt_minimal_gray"),
    }


def validate_explainer_draft(
    draft: dict[str, Any],
    content: dict[str, Any],
    family_hint: str,
) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    steps = normalized_steps(content)
    step_captions = draft.get("step_captions") if isinstance(draft.get("step_captions"), list) else []
    action_hints = draft.get("action_hints") if isinstance(draft.get("action_hints"), list) else []
    entities_outline = draft.get("entities_outline") if isinstance(draft.get("entities_outline"), list) else []
    if clean_text(draft.get("family_hint")) != family_hint:
        errors.append({"stage": "draft_semantic", "rule_id": "draft-family-mismatch", "message": "family_hint must match the normalized animation family."})
    if len(step_captions) != len(steps):
        errors.append({"stage": "draft_semantic", "rule_id": "draft-step-caption-count", "message": "step_captions length must exactly match normalized animation steps."})
    if len(action_hints) != len(steps):
        errors.append({"stage": "draft_semantic", "rule_id": "draft-action-hints-count", "message": "action_hints length must exactly match normalized animation steps."})
    if not entities_outline:
        errors.append({"stage": "draft_semantic", "rule_id": "draft-entities-outline-empty", "message": "entities_outline must include at least one subject entity."})
    for index, caption in enumerate(step_captions, start=1):
        if not isinstance(caption, dict):
            errors.append({"stage": "draft_semantic", "rule_id": "draft-step-caption-object", "message": f"step_captions[{index}] must be an object."})
            continue
        if clean_text(caption.get("caption_title")) == "":
            errors.append({"stage": "draft_semantic", "rule_id": "draft-caption-title-empty", "message": f"step_captions[{index}] is missing caption_title."})
        if clean_text(caption.get("caption_body")) == "":
            errors.append({"stage": "draft_semantic", "rule_id": "draft-caption-body-empty", "message": f"step_captions[{index}] is missing caption_body."})
    for index, raw_hint_list in enumerate(action_hints, start=1):
        if not isinstance(raw_hint_list, list):
            errors.append({"stage": "draft_semantic", "rule_id": "draft-action-hints-object", "message": f"action_hints[{index}] must be an array of strings."})
            continue
        invalid = [
            clean_text(item)
            for item in raw_hint_list
            if clean_text(item) and canonical_action_hint(item) == ""
        ]
        if invalid:
            errors.append(
                {
                    "stage": "draft_semantic",
                    "rule_id": "draft-action-hints-invalid",
                    "message": f"action_hints[{index}] contains unsupported action hints: {', '.join(invalid)}.",
                }
            )
    return errors


def algorithm_frame_entities(step: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    snapshot = step.get("snapshot") if isinstance(step.get("snapshot"), list) else []
    active_indices = {value for value in step.get("active_indices") or [] if isinstance(value, int)}
    swap_indices = {value for value in step.get("swap_indices") or [] if isinstance(value, int)}
    sorted_indices = {value for value in step.get("sorted_indices") or [] if isinstance(value, int)}
    action = clean_text(step.get("action")).lower()
    items = []
    focus_targets: list[str] = []
    for item_index, raw_value in enumerate(snapshot):
        if not isinstance(raw_value, (int, float)):
            continue
        accent = "muted"
        if item_index in sorted_indices or action == "done":
            accent = "success"
        elif item_index in swap_indices:
            accent = "swap"
        elif item_index in active_indices:
            accent = "active"
        item_id = f"track-item-{item_index}"
        if accent != "muted":
            focus_targets.append(item_id)
        items.append({"id": item_id, "label": f"#{item_index}", "value": float(raw_value), "accent": accent, "marker": "current" if item_index in active_indices else None})
    return ([{"id": "track-main", "kind": "track_stack", "items": items, "max_value": max([item["value"] for item in items], default=0)}], focus_targets)


def node_layout(outline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    laid_out: list[dict[str, Any]] = []
    total = max(len(outline), 1)
    for index, item in enumerate(outline):
        x = 80 + index * (520 / total)
        y = 120 + (index % 2) * 40
        laid_out.append({"id": item["id"], "kind": "node", "title": item["label"], "x": x, "y": y, "width": 150, "height": 84, "accent": "active" if index == 0 else "muted"})
    return laid_out


def physics_frame_entities(outline: list[dict[str, Any]], step_index: int, total_steps: int) -> tuple[list[dict[str, Any]], list[str]]:
    progress = 0 if total_steps <= 1 else step_index / (total_steps - 1)
    entities: list[dict[str, Any]] = []
    focus_targets: list[str] = []
    for item in outline:
        if item["kind"] == "node":
            entities.append({"id": item["id"], "kind": "node", "title": item["label"], "x": 120 + progress * 280, "y": 180 - progress * 60, "width": 150, "height": 84, "accent": "active"})
            focus_targets.append(item["id"])
        elif item["kind"] == "vector":
            entities.append({"id": item["id"], "kind": "vector", "label": item["label"], "from_x": 195 + progress * 280, "from_y": 220 - progress * 60, "to_x": 255 + progress * 280, "to_y": 160 - progress * 60, "accent": "active"})
        elif item["kind"] == "path":
            entities.append({"id": item["id"], "kind": "path", "points": [{"x": 120, "y": 240}, {"x": 220, "y": 200}, {"x": 320, "y": 170}, {"x": 420, "y": 140}]})
    return entities or node_layout(outline), focus_targets or ([outline[0]["id"]] if outline else [])


def system_frame_entities(outline: list[dict[str, Any]], step_index: int) -> tuple[list[dict[str, Any]], list[str]]:
    nodes = [item for item in outline if item["kind"] == "node"]
    entities = []
    focus_targets: list[str] = []
    for index, item in enumerate(nodes):
        accent = "active" if index == min(step_index, len(nodes) - 1) else "muted"
        entities.append({"id": item["id"], "kind": "node", "title": item["label"], "x": 80 + index * 200, "y": 180, "width": 140, "height": 80, "accent": accent})
        if accent == "active":
            focus_targets.append(item["id"])
    for index in range(max(len(nodes) - 1, 0)):
        entities.append({"id": f"edge-{index}", "kind": "edge", "label": "flow", "from_x": 150 + index * 200, "from_y": 220, "to_x": 230 + index * 200, "to_y": 220, "accent": "active" if index < step_index else "muted"})
    return entities or node_layout(outline), focus_targets or ([outline[0]["id"]] if outline else [])


def math_frame_entities(outline: list[dict[str, Any]], content: dict[str, Any], step_index: int, total_steps: int) -> tuple[list[dict[str, Any]], list[str]]:
    dataset = content.get("dataset") if isinstance(content.get("dataset"), list) else [1, 2, 3, 4]
    cutoff = max(2, min(len(dataset), step_index + 2))
    max_value = max([value for value in dataset if isinstance(value, (int, float))], default=1)
    points = []
    for index, raw_value in enumerate(dataset[:cutoff]):
        if not isinstance(raw_value, (int, float)):
            continue
        points.append({"x": 120 + index * 90, "y": 320 - (float(raw_value) / max_value) * 160})
    entities = [
        {"id": "axis-main", "kind": "axis", "label": "Axes", "x": 100, "y": 90, "width": 460, "height": 260},
        {"id": "curve-main", "kind": "curve", "label": "Curve", "points": points, "accent": "active"},
    ]
    return entities, ["curve-main"]


def scene_entries(outline: list[dict[str, Any]], total_steps: int) -> list[dict[str, Any]]:
    count = max(len(outline), 1)
    span = max(total_steps // count, 1)
    scenes = []
    for index, item in enumerate(outline):
        start_step = min(index * span, total_steps - 1)
        end_step = total_steps - 1 if index == count - 1 else min(((index + 1) * span) - 1, total_steps - 1)
        scenes.append({"id": f"scene-{index + 1}", "title": item["title"], "summary": item.get("summary"), "emphasis": item.get("summary"), "start_step": start_step, "end_step": end_step, "focus_targets": []})
    return scenes or [{"id": "scene-1", "title": "Scene 1", "summary": None, "emphasis": None, "start_step": 0, "end_step": total_steps - 1, "focus_targets": []}]


def assemble_generic_explainer_graph(content: dict[str, Any], draft: dict[str, Any], family_hint: str) -> dict[str, Any]:
    steps = normalized_steps(content)
    outline = scene_outline(content)
    entity_outline = draft.get("entities_outline") if isinstance(draft.get("entities_outline"), list) else []
    step_captions = draft.get("step_captions") if isinstance(draft.get("step_captions"), list) else []
    action_hints = draft.get("action_hints") if isinstance(draft.get("action_hints"), list) else []
    graph_steps: list[dict[str, Any]] = []
    for index, raw_step in enumerate(steps):
        caption = step_captions[index] if index < len(step_captions) and isinstance(step_captions[index], dict) else {}
        caption_title = clean_text(caption.get("caption_title"))
        caption_body = clean_text(caption.get("caption_body"))
        if not caption_title or not caption_body:
            raise ValueError(f"Step {index + 1} is missing caption text.")
        if family_hint == "algorithm_demo":
            frame_entities, focus_targets = algorithm_frame_entities(raw_step)
        elif family_hint == "physics_mechanics":
            frame_entities, focus_targets = physics_frame_entities(entity_outline, index, len(steps))
        elif family_hint == "system_flow":
            frame_entities, focus_targets = system_frame_entities(entity_outline, index)
        elif family_hint == "math_transform":
            frame_entities, focus_targets = math_frame_entities(entity_outline, content, index, len(steps))
        else:
            raise ValueError(f"Unsupported explainer family `{family_hint}`.")
        action_names = normalize_action_hints(action_hints[index] if index < len(action_hints) else [])
        graph_steps.append(
            {
                "index": index,
                "primary_caption": {"title": caption_title, "body": caption_body, "secondary_note": clean_text(raw_step.get("focus")) or None},
                "entities": frame_entities,
                "actions": [{"kind": action_name, "entity_ids": focus_targets, "note": clean_text(raw_step.get("action") or action_name)} for action_name in action_names],
                "focus_targets": focus_targets,
            }
        )
    return {
        "title": clean_text(content.get("title")) or "Animation",
        "summary": clean_text(content.get("summary")),
        "family_hint": family_hint,
        "scene_outline": outline,
        "timeline": {"total_steps": max(len(graph_steps), 1)},
        "scenes": scene_entries(outline, max(len(graph_steps), 1)),
        "steps": graph_steps,
        "camera": {"mode": "fixed", "focus_region": None, "zoom_target": None},
        "style": {
            "tone": clean_text(
                draft.get("style_tone")
                or content.get("style_pack")
                or "teaching_ppt_minimal_gray"
            ),
            "density": "balanced",
        },
        "used_primitives": ["AnimationGraphRenderer"],
    }


def validate_generic_explainer_graph(graph: dict[str, Any], family_hint: str) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    if clean_text(graph.get("family_hint")) != family_hint:
        errors.append({"stage": "graph_validation", "rule_id": "graph-family-mismatch", "message": "runtime graph family_hint must match the normalized family."})
    if graph.get("used_primitives") != ["AnimationGraphRenderer"]:
        errors.append({"stage": "graph_validation", "rule_id": "graph-used-primitives", "message": "runtime graph must use the fixed AnimationGraphRenderer primitive."})
    steps = graph.get("steps") if isinstance(graph.get("steps"), list) else []
    total_steps = ((graph.get("timeline") or {}).get("total_steps")) if isinstance(graph.get("timeline"), dict) else None
    if not steps:
        errors.append({"stage": "graph_validation", "rule_id": "graph-steps-empty", "message": "runtime graph must include at least one step."})
        return errors
    if total_steps != len(steps):
        errors.append({"stage": "graph_validation", "rule_id": "graph-total-steps", "message": "timeline.total_steps must exactly match graph steps length."})
    for index, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            errors.append({"stage": "graph_validation", "rule_id": "graph-step-object", "message": f"step {index} must be an object."})
            continue
        caption = step.get("primary_caption") if isinstance(step.get("primary_caption"), dict) else {}
        if clean_text(caption.get("title")) == "":
            errors.append({"stage": "graph_validation", "rule_id": "graph-primary-caption-title", "message": f"step {index} is missing primary caption title."})
        entities = step.get("entities") if isinstance(step.get("entities"), list) else []
        if not entities:
            errors.append({"stage": "graph_validation", "rule_id": "graph-step-entities-empty", "message": f"step {index} must include at least one subject entity."})
            continue
        if not any(isinstance(entity, dict) and entity.get("kind") != "caption" for entity in entities):
            errors.append({"stage": "graph_validation", "rule_id": "graph-no-empty-subject", "message": f"step {index} cannot contain only caption/callout entities."})
    return errors
