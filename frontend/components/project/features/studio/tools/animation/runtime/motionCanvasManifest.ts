"use client";

import { compileRuntimeGraphToTheatreState } from "./theatreState";
import type {
  GenericExplainerGraphV1,
  MotionCanvasSceneManifest,
  MotionCanvasSceneManifestItem,
} from "./types";

function buildSceneManifestItems(
  graph: GenericExplainerGraphV1,
  familyPreset: MotionCanvasSceneManifest["familyPreset"]
): MotionCanvasSceneManifestItem[] {
  return (graph.scenes ?? []).map((scene) => ({
    id: scene.id,
    title: scene.title,
    summary: scene.summary ?? null,
    preset: familyPreset,
    startFrame: scene.start_step * 48,
    endFrame: (scene.end_step + 1) * 48 - 1,
    steps: graph.steps
      .filter((step) => step.index >= scene.start_step && step.index <= scene.end_step)
      .map((step) => ({
        stepIndex: step.index,
        startFrame: step.index * 48,
        endFrame: (step.index + 1) * 48 - 1,
        caption: step.primary_caption,
        entities: step.entities,
        actions: step.actions,
        focusTargets: step.focus_targets,
      })),
  }));
}

export function compileRuntimeGraphToMotionCanvasScene(
  graph: GenericExplainerGraphV1
): MotionCanvasSceneManifest {
  const theatreSequenceState = compileRuntimeGraphToTheatreState(graph);
  return {
    projectName: graph.title,
    familyPreset: theatreSequenceState.familyPreset,
    width: 1280,
    height: 720,
    durationFrames: theatreSequenceState.durationFrames,
    scenes: buildSceneManifestItems(graph, theatreSequenceState.familyPreset),
  };
}
