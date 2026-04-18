"use client";

import { ANIMATION_DSL_CONTRACT } from "./dslContract";
import type { AnimationCompileError, AnimationSceneOutlineItem } from "./types";

export interface AnimationRuntimeTrackItemPlan {
  id: string;
  label: string;
  value: number;
  accent?: "swap" | "active" | "success" | "muted" | null;
  marker?: string | null;
}

export interface AnimationRuntimeAlgorithmStepPlan {
  caption_title: string;
  caption_body: string;
  items: AnimationRuntimeTrackItemPlan[];
  max_value?: number | null;
}

export interface AnimationRuntimePlanV1 {
  title: string;
  summary: string;
  family_hint: string;
  scene_outline: AnimationSceneOutlineItem[];
  timeline: {
    total_steps: number;
  };
  steps: AnimationRuntimeAlgorithmStepPlan[];
  bindings: {
    step_index_source: "playback.stepIndex";
  };
  layout: {
    subject_position: "center";
    caption_position: "bottom";
  };
  caption_strategy: {
    mode: "single_caption";
  };
  subject: {
    kind: "track";
    track_mode: "bars";
  };
  used_primitives: string[];
}

function error(message: string, ruleId: string): AnimationCompileError {
  return { message, ruleId, source: "schema" };
}

export function validateRuntimePlan(
  plan: AnimationRuntimePlanV1 | null | undefined
): AnimationCompileError[] {
  if (!plan) {
    return [error("runtime_plan is missing.", "runtime-plan-missing")];
  }

  const errors: AnimationCompileError[] = [];
  const fixed = ANIMATION_DSL_CONTRACT.planSchemaFragments.algorithm_demo;
  const trackSchema = ANIMATION_DSL_CONTRACT.primitivePropSchema.Track;

  if (plan.family_hint !== "algorithm_demo") {
    errors.push(
      error(
        "Only algorithm_demo runtime plans are supported by the browser plan validator.",
        "runtime-plan-family-unsupported"
      )
    );
  }
  if (plan.subject.kind !== fixed.fixed_subject_kind) {
    errors.push(error("subject.kind must be `track`.", "runtime-plan-subject-kind"));
  }
  if (plan.subject.track_mode !== fixed.fixed_track_mode) {
    errors.push(error("subject.track_mode must be `bars`.", "runtime-plan-track-mode"));
  }
  if (plan.caption_strategy.mode !== fixed.fixed_caption_mode) {
    errors.push(
      error(
        "caption_strategy.mode must be `single_caption`.",
        "runtime-plan-caption-mode"
      )
    );
  }
  if (plan.bindings.step_index_source !== fixed.fixed_bindings) {
    errors.push(
      error(
        "bindings.step_index_source must be `playback.stepIndex`.",
        "runtime-plan-bindings"
      )
    );
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    errors.push(error("runtime_plan.steps must be a non-empty array.", "runtime-plan-steps"));
    return errors;
  }
  if (plan.timeline.total_steps !== plan.steps.length) {
    errors.push(
      error(
        "timeline.total_steps must exactly match steps.length.",
        "runtime-plan-step-count"
      )
    );
  }

  const expectedPrimitives = [
    "Stage",
    "Scene",
    "Track",
    "Caption",
    "usePlayback",
  ];
  if (JSON.stringify(plan.used_primitives) !== JSON.stringify(expectedPrimitives)) {
    errors.push(
      error(
        "algorithm_demo used_primitives must match the fixed deterministic compiler set.",
        "runtime-plan-used-primitives"
      )
    );
  }

  for (const [index, step] of plan.steps.entries()) {
    if (!step.caption_body?.trim()) {
      errors.push(
        error(`step ${index + 1} is missing caption_body.`, "runtime-plan-caption-body")
      );
    }
    if (!Array.isArray(step.items) || step.items.length === 0) {
      errors.push(
        error(`step ${index + 1} must include Track items.`, "runtime-plan-track-items")
      );
      continue;
    }
    for (const [itemIndex, item] of step.items.entries()) {
      const keys = Object.keys(item as Record<string, unknown>);
      const allowed = new Set(trackSchema?.track_item_allowed_props ?? []);
      const required = trackSchema?.track_item_required_props ?? [];
      for (const key of keys) {
        if (!allowed.has(key)) {
          errors.push(
            error(
              `step ${index + 1} item ${itemIndex + 1} has unsupported prop \`${key}\`.`,
              "runtime-plan-track-item-props"
            )
          );
        }
      }
      for (const key of required) {
        if (!(key in item)) {
          errors.push(
            error(
              `step ${index + 1} item ${itemIndex + 1} is missing \`${key}\`.`,
              "runtime-plan-track-item-required"
            )
          );
        }
      }
      if (
        item.accent &&
        !(trackSchema?.track_item_accent_enum ?? []).includes(item.accent)
      ) {
        errors.push(
          error(
            `step ${index + 1} item ${itemIndex + 1} has invalid accent \`${item.accent}\`.`,
            "runtime-plan-track-item-accent"
          )
        );
      }
    }
  }

  return errors;
}

export function compileRuntimePlan(plan: AnimationRuntimePlanV1): string {
  const errors = validateRuntimePlan(plan);
  if (errors.length > 0) {
    throw new Error(errors[0]?.message || "runtime_plan validation failed.");
  }

  const stepsJson = JSON.stringify(
    plan.steps.map((step) => ({
      captionTitle: step.caption_title,
      captionBody: step.caption_body,
      items: step.items,
      maxValue: step.max_value ?? 0,
    })),
    null,
    2
  );

  return `const steps = ${stepsJson};

export default function Animation(runtimeProps) {
  const playback = usePlayback();
  const currentIndex = Math.max(0, Math.min(playback.stepIndex, steps.length - 1));
  const currentStep = steps[currentIndex] || steps[0];
  return React.createElement(
    Stage,
    { title: ${JSON.stringify(plan.title)}, subtitle: ${JSON.stringify(plan.summary)}, theme: runtimeProps.theme },
    React.createElement(
      Scene,
      null,
      React.createElement(Track, {
        items: currentStep.items,
        maxValue: currentStep.maxValue,
        mode: "bars"
      }),
      React.createElement(Caption, {
        title: currentStep.captionTitle,
        body: currentStep.captionBody
      })
    )
  );
}
`;
}
