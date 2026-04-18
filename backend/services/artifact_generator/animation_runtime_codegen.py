from __future__ import annotations

import json

from .animation_runtime_contract import AnimationRuntimePlanV1, GenericExplainerGraphV1
from .animation_runtime_graph_assembly import (
    SUPPORTED_EXPLAINER_FAMILIES,
    assemble_generic_explainer_graph,
    build_explainer_draft_seed,
    validate_explainer_draft,
    validate_generic_explainer_graph,
)

RUNTIME_PLAN_VERSION = "animation_runtime_plan.v1"
RUNTIME_GRAPH_VERSION = "generic_explainer_graph.v1"
RUNTIME_DRAFT_VERSION = "explainer_draft.v1"
GRAPH_USED_PRIMITIVES = ["AnimationGraphRenderer"]


def compile_runtime_graph_to_component_code(graph: GenericExplainerGraphV1) -> str:
    graph_json = json.dumps(graph.model_dump(mode="python"), ensure_ascii=False, indent=2)
    return (
        f"const graph = {graph_json};\n\n"
        "export default function Animation(runtimeProps) {\n"
        "  return React.createElement(AnimationGraphRenderer, {\n"
        "    graph,\n"
        "    theme: runtimeProps.theme\n"
        "  });\n"
        "}\n"
    )


def compile_runtime_plan_to_component_code(plan: AnimationRuntimePlanV1) -> str:
    graph = GenericExplainerGraphV1.model_validate(
        {
            "title": plan.title,
            "summary": plan.summary,
            "family_hint": plan.family_hint,
            "scene_outline": [item.model_dump(mode="python") for item in plan.scene_outline],
            "timeline": {"total_steps": len(plan.steps)},
            "scenes": [
                {
                    "id": "scene-1",
                    "title": plan.scene_outline[0].title if plan.scene_outline else plan.title,
                    "summary": plan.scene_outline[0].summary if plan.scene_outline else None,
                    "emphasis": None,
                    "start_step": 0,
                    "end_step": len(plan.steps) - 1,
                    "focus_targets": [],
                }
            ],
            "steps": [
                {
                    "index": index,
                    "primary_caption": {
                        "title": step.caption_title,
                        "body": step.caption_body,
                        "secondary_note": None,
                    },
                    "entities": [
                        {
                            "id": "track-main",
                            "kind": "track_stack",
                            "items": [item.model_dump(mode="python") for item in step.items],
                            "max_value": step.max_value or 0,
                        }
                    ],
                    "actions": [],
                    "focus_targets": [],
                }
                for index, step in enumerate(plan.steps)
            ],
            "camera": {"mode": "fixed", "focus_region": None, "zoom_target": None},
            "style": {"tone": "legacy_plan", "density": "balanced"},
            "used_primitives": GRAPH_USED_PRIMITIVES,
        }
    )
    return compile_runtime_graph_to_component_code(graph)
