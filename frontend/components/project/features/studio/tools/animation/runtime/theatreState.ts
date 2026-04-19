"use client";

import { getProject } from "@theatre/core";
import type {
  ExplainerFamilyPresentationPreset,
  GenericExplainerGraphV1,
  TheatreSequenceProjectBinding,
  TheatreSequenceObjectState,
  TheatreSequenceSceneRange,
  TheatreSequenceState,
  TheatreSequenceTrack,
} from "./types";

export const THEATRE_STEP_DURATION_FRAMES = 48;

function sanitizeTheatreProjectId(value: string): string {
  const collapsed = value
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const candidate = collapsed.slice(0, 32);
  return candidate.length >= 3 ? candidate : "spectra-runtime";
}

function sanitizeTheatreProps(
  props: Record<string, number | string | boolean | null>
): Record<string, number | string | boolean> {
  const sanitizedEntries = Object.entries(props).filter(
    (_entry): _entry is [string, number | string | boolean] => _entry[1] !== null
  );
  return Object.fromEntries(
    sanitizedEntries
  ) as Record<string, number | string | boolean>;
}

export function resolveAnimationPresentationPreset(
  familyHint: string | null | undefined
): ExplainerFamilyPresentationPreset {
  switch (familyHint) {
    case "physics_mechanics":
    case "system_flow":
    case "math_transform":
      return familyHint;
    default:
      return "algorithm_demo";
  }
}

function stringifyFocusTargets(targets: string[]): string {
  return targets.join(",");
}

function buildSceneRanges(graph: GenericExplainerGraphV1): TheatreSequenceSceneRange[] {
  return (graph.scenes ?? []).map((scene) => ({
    id: scene.id,
    title: scene.title,
    startFrame: scene.start_step * THEATRE_STEP_DURATION_FRAMES,
    endFrame: (scene.end_step + 1) * THEATRE_STEP_DURATION_FRAMES - 1,
  }));
}

function buildPlaybackObject(graph: GenericExplainerGraphV1): TheatreSequenceObjectState {
  return {
    objectId: "playback",
    role: "playback",
    props: {
      totalSteps: graph.steps.length,
      durationFrames: graph.steps.length * THEATRE_STEP_DURATION_FRAMES,
      familyPreset: resolveAnimationPresentationPreset(graph.family_hint),
    },
  };
}

function buildSceneObjects(graph: GenericExplainerGraphV1): TheatreSequenceObjectState[] {
  return (graph.scenes ?? []).map((scene) => ({
    objectId: `scene:${scene.id}`,
    role: "scene",
    props: {
      title: scene.title,
      emphasis: scene.emphasis ?? null,
      startStep: scene.start_step,
      endStep: scene.end_step,
      focusTargets: stringifyFocusTargets(scene.focus_targets),
    },
  }));
}

function buildCaptionObjects(graph: GenericExplainerGraphV1): TheatreSequenceObjectState[] {
  return graph.steps.map((step) => ({
    objectId: `caption:${step.index}`,
    role: "caption",
    props: {
      stepIndex: step.index,
      title: step.primary_caption.title,
      body: step.primary_caption.body ?? null,
      secondaryNote: step.primary_caption.secondary_note ?? null,
    },
  }));
}

function buildEntityObjects(graph: GenericExplainerGraphV1): TheatreSequenceObjectState[] {
  const latestByEntityId = new Map<string, TheatreSequenceObjectState>();

  for (const step of graph.steps) {
    for (const entity of step.entities) {
      latestByEntityId.set(entity.id, {
        objectId: `entity:${entity.id}`,
        role: "entity",
        props: {
          kind: entity.kind,
          title: entity.title ?? entity.label ?? null,
          accent: entity.accent ?? null,
          x: entity.x ?? entity.from_x ?? null,
          y: entity.y ?? entity.from_y ?? null,
          width: entity.width ?? null,
          height: entity.height ?? null,
          focusWeight: entity.focus_weight ?? null,
        },
      });
    }
  }

  return Array.from(latestByEntityId.values()).sort((left, right) =>
    left.objectId.localeCompare(right.objectId)
  );
}

function buildTracks(graph: GenericExplainerGraphV1): TheatreSequenceTrack[] {
  const playbackTrack: TheatreSequenceTrack = {
    objectId: "playback",
    prop: "stepIndex",
    keyframes: graph.steps.map((step) => ({
      frame: step.index * THEATRE_STEP_DURATION_FRAMES,
      value: step.index,
    })),
  };

  const sceneTrack: TheatreSequenceTrack = {
    objectId: "playback",
    prop: "sceneId",
    keyframes: graph.steps.map((step) => {
      const scene =
        graph.scenes.find(
          (candidate) =>
            step.index >= candidate.start_step && step.index <= candidate.end_step
        ) ?? graph.scenes[0];
      return {
        frame: step.index * THEATRE_STEP_DURATION_FRAMES,
        value: scene?.id ?? "scene:unknown",
      };
    }),
  };

  const focusTrack: TheatreSequenceTrack = {
    objectId: "playback",
    prop: "focusTargets",
    keyframes: graph.steps.map((step) => ({
      frame: step.index * THEATRE_STEP_DURATION_FRAMES,
      value: stringifyFocusTargets(step.focus_targets),
    })),
  };

  return [playbackTrack, sceneTrack, focusTrack];
}

export function compileRuntimeGraphToTheatreState(
  graph: GenericExplainerGraphV1
): TheatreSequenceState {
  const familyPreset = resolveAnimationPresentationPreset(graph.family_hint);
  return {
    projectId: sanitizeTheatreProjectId(
      `spectra-runtime-${graph.family_hint}-${graph.title}`
    ),
    sheetId: "animation-sequence",
    familyPreset,
    durationFrames: graph.steps.length * THEATRE_STEP_DURATION_FRAMES,
    stepDurationFrames: THEATRE_STEP_DURATION_FRAMES,
    sceneRanges: buildSceneRanges(graph),
    objects: [
      buildPlaybackObject(graph),
      ...buildSceneObjects(graph),
      ...buildCaptionObjects(graph),
      ...buildEntityObjects(graph),
    ],
    tracks: buildTracks(graph),
  };
}

export function resolveTheatreFrameForStep(
  sequenceState: TheatreSequenceState,
  stepIndex: number
): number {
  const safeStep = Math.max(0, stepIndex);
  return Math.min(
    sequenceState.durationFrames,
    safeStep * sequenceState.stepDurationFrames
  );
}

export function resolveTheatreFrameForSequencePosition(
  sequenceState: TheatreSequenceState,
  sequencePosition: number
): number {
  const clampedPosition = Math.max(0, sequencePosition);
  return Math.min(
    Math.max(sequenceState.durationFrames - 1, 0),
    clampedPosition * sequenceState.stepDurationFrames
  );
}

export function createTheatreSequenceProject(
  sequenceState: TheatreSequenceState
): TheatreSequenceProjectBinding {
  const project = getProject(sequenceState.projectId);
  const sheet = project.sheet(sequenceState.sheetId);
  const objects = new Map<string, ReturnType<typeof sheet.object>>();

  for (const objectState of sequenceState.objects) {
    const props = sanitizeTheatreProps({ ...objectState.props });
    const theatreObject = sheet.object(objectState.objectId, props, {
      reconfigure: true,
    });
    objects.set(objectState.objectId, theatreObject);
  }

  return {
    project,
    sheet: sheet as TheatreSequenceProjectBinding["sheet"],
    objects,
  };
}
