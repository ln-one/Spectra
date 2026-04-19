"use client";

import type {
  AnimationCompileError,
  GenericExplainerGraphV1,
  GraphEntity,
} from "./types";
import { compileRuntimeGraphToMotionCanvasScene } from "./motionCanvasManifest";
import { compileRuntimeGraphToTheatreState } from "./theatreState";

function error(message: string, ruleId: string): AnimationCompileError {
  return { message, ruleId, source: "schema" };
}

function hasSubjectEntity(entities: GraphEntity[]): boolean {
  return entities.some((entity) => entity.kind !== "caption" && entity.kind !== "callout");
}

export function validateRuntimeGraph(
  graph: GenericExplainerGraphV1 | null | undefined
): AnimationCompileError[] {
  if (!graph) {
    return [error("runtime_graph is missing.", "runtime-graph-missing")];
  }

  const errors: AnimationCompileError[] = [];
  if (!Array.isArray(graph.steps) || graph.steps.length === 0) {
    errors.push(error("runtime_graph.steps must be a non-empty array.", "runtime-graph-steps"));
    return errors;
  }
  if (graph.timeline.total_steps !== graph.steps.length) {
    errors.push(
      error(
        "timeline.total_steps must exactly match steps.length.",
        "runtime-graph-total-steps"
      )
    );
  }
  if (JSON.stringify(graph.used_primitives) !== JSON.stringify(["AnimationGraphRenderer"])) {
    errors.push(
      error(
        "runtime_graph must use the fixed AnimationGraphRenderer primitive.",
        "runtime-graph-used-primitives"
      )
    );
  }

  for (const [index, step] of graph.steps.entries()) {
    if (!step.primary_caption?.title?.trim()) {
      errors.push(
        error(
          `step ${index + 1} is missing primary caption title.`,
          "runtime-graph-primary-caption-title"
        )
      );
    }
    if (!Array.isArray(step.entities) || step.entities.length === 0) {
      errors.push(
        error(`step ${index + 1} must include at least one entity.`, "runtime-graph-entities")
      );
      continue;
    }
    if (!hasSubjectEntity(step.entities)) {
      errors.push(
        error(
          `step ${index + 1} must include at least one subject entity.`,
          "runtime-graph-no-empty-subject"
        )
      );
    }
  }

  for (const scene of graph.scenes ?? []) {
    if (scene.start_step > scene.end_step) {
      errors.push(
        error(
          `scene ${scene.id} has an invalid step range.`,
          "runtime-graph-scene-range"
        )
      );
    }
  }

  return errors;
}

export function compileRuntimeGraph(graph: GenericExplainerGraphV1): string {
  const errors = validateRuntimeGraph(graph);
  if (errors.length > 0) {
    throw new Error(errors[0]?.message || "runtime_graph validation failed.");
  }

  const graphJson = JSON.stringify(graph, null, 2);
  const theatreSequenceStateJson = JSON.stringify(
    compileRuntimeGraphToTheatreState(graph),
    null,
    2
  );
  const motionCanvasSceneManifestJson = JSON.stringify(
    compileRuntimeGraphToMotionCanvasScene(graph),
    null,
    2
  );
  return `const graph = ${graphJson};
const theatreSequenceState = ${theatreSequenceStateJson};
const motionCanvasSceneManifest = ${motionCanvasSceneManifestJson};

export default function Animation(runtimeProps) {
  return React.createElement(AnimationGraphRenderer, {
    graph,
    theme: runtimeProps.theme,
    theatreSequenceState,
    motionCanvasSceneManifest
  });
}
`;
}
