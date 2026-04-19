from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RuntimeSceneOutlineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    summary: str | None = None


class RuntimeTimelinePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_steps: int = Field(ge=1)


class RuntimeBindingsPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_index_source: Literal["playback.stepIndex"]


class RuntimeLayoutPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_position: Literal["center"]
    caption_position: Literal["bottom"]


class RuntimeCaptionStrategyPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["single_caption"]


class RuntimeSubjectPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["track"]
    track_mode: Literal["bars"]


class RuntimeTrackItemPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    value: float
    accent: Literal["swap", "active", "success", "muted"] | None = None
    marker: str | None = None


class RuntimeAlgorithmStepPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    caption_title: str
    caption_body: str
    items: list[RuntimeTrackItemPlan]
    max_value: float | None = Field(default=None, ge=0)


class RuntimeDraftCaptionStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    caption_title: str
    caption_body: str


class RuntimeDraftEntityOutline(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Literal[
        "track_stack",
        "node",
        "edge",
        "vector",
        "path",
        "axis",
        "curve",
        "callout",
        "caption",
        "badge",
    ]
    label: str


class ExplainerDraftV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    story_beats: list[str]
    entities_outline: list[RuntimeDraftEntityOutline]
    step_captions: list[RuntimeDraftCaptionStep]
    action_hints: list[list[str]]
    layout_intent: str
    focus_targets: list[str]
    family_hint: str
    style_tone: str


class RuntimeDraftSceneHook(BaseModel):
    model_config = ConfigDict(extra="forbid")

    opener: str | None = None
    closer: str | None = None


class AlgorithmDemoRuntimeDraftV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    caption_steps: list[RuntimeDraftCaptionStep]
    scene_hook: RuntimeDraftSceneHook | None = None


class AnimationRuntimePlanV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    summary: str
    family_hint: str
    scene_outline: list[RuntimeSceneOutlineItem]
    timeline: RuntimeTimelinePlan
    steps: list[RuntimeAlgorithmStepPlan]
    bindings: RuntimeBindingsPlan
    layout: RuntimeLayoutPlan
    caption_strategy: RuntimeCaptionStrategyPlan
    subject: RuntimeSubjectPlan
    used_primitives: list[str]


class GraphPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float
    y: float


class GraphTrackItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    value: float
    accent: Literal["swap", "active", "success", "muted"] | None = None
    marker: str | None = None


class GraphEntity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Literal[
        "track_stack",
        "node",
        "edge",
        "vector",
        "path",
        "axis",
        "curve",
        "callout",
        "caption",
        "badge",
    ]
    title: str | None = None
    body: str | None = None
    text: str | None = None
    label: str | None = None
    accent: Literal["swap", "active", "success", "muted"] | None = None
    marker: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    from_x: float | None = None
    from_y: float | None = None
    to_x: float | None = None
    to_y: float | None = None
    items: list[GraphTrackItem] | None = None
    max_value: float | None = None
    points: list[GraphPoint] | None = None
    focus_weight: float | None = None
    target_ids: list[str] | None = None


class GraphAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal[
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
    ]
    entity_ids: list[str] = Field(default_factory=list)
    note: str | None = None


class GraphCaptionStream(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    body: str | None = None
    secondary_note: str | None = None


class GraphStepFrame(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=0)
    primary_caption: GraphCaptionStream
    entities: list[GraphEntity]
    actions: list[GraphAction] = Field(default_factory=list)
    focus_targets: list[str] = Field(default_factory=list)


class GraphScene(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    summary: str | None = None
    emphasis: str | None = None
    start_step: int = Field(ge=0)
    end_step: int = Field(ge=0)
    focus_targets: list[str] = Field(default_factory=list)


class GraphTimeline(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_steps: int = Field(ge=1)


class GraphCamera(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["fixed"] = "fixed"
    focus_region: str | None = None
    zoom_target: str | None = None


class GraphStyle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tone: str
    density: Literal["airy", "balanced", "dense"] = "balanced"


class GenericExplainerGraphV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    summary: str
    family_hint: str
    scene_outline: list[RuntimeSceneOutlineItem]
    timeline: GraphTimeline
    scenes: list[GraphScene]
    steps: list[GraphStepFrame]
    camera: GraphCamera
    style: GraphStyle
    used_primitives: list[str]


class AnimationRuntimeValidationReportItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: str
    rule_id: str | None = None
    message: str
    line: int | None = None
    column: int | None = None


@lru_cache(maxsize=1)
def load_animation_runtime_contract() -> dict:
    contract_path = Path(__file__).resolve().with_name("dsl-contract.json")
    return json.loads(contract_path.read_text(encoding="utf-8"))


def build_runtime_contract_prompt_fragment() -> str:
    contract = load_animation_runtime_contract()
    primitive_lines = []
    for name, props in contract["primitive_props"].items():
        prop_list = ", ".join(props) if props else "(no props)"
        primitive_lines.append(f"- {name}: {prop_list}")

    hook_lines = []
    for name, fields in contract["hook_return_shape"].items():
        field_list = ", ".join(fields)
        hook_lines.append(f"- {name}() -> {field_list}")

    return "\n".join(
        [
            "【runtime_dsl_contract】",
            "Allowed primitives and props:",
            *primitive_lines,
            "Allowed hooks and readonly return fields:",
            *hook_lines,
            "Subject primitives:",
            ", ".join(contract["subject_primitives"]),
            "Explanation primitives:",
            ", ".join(contract["explanation_primitives"]),
            "Graph renderer primitive:",
            "- AnimationGraphRenderer: graph, theme",
            "Explainer draft shape:",
            "- story_beats: array of short beat strings",
            "- entities_outline: array of {id, kind, label}",
            "- step_captions: array of {caption_title, caption_body}",
            "- action_hints: array of string arrays, one per step",
            "- layout_intent: short layout string",
            "- focus_targets: array of entity ids",
            "- family_hint: one of algorithm_demo, physics_mechanics, system_flow, math_transform",
            "- style_tone: short style string",
            "Do not output runtime code, primitive props, hooks, or graph internals.",
        ]
    )
