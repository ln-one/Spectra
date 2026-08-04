/**
 * The original full graph view exposes a small, deliberately time-based
 * timelapse controller.  This module keeps that controller separate from the
 * renderer so the recovered timing semantics can be tested without a DOM.
 */

const GRAPH_VIEW_PROGRESSION_MIN_SPEED = 5;
const GRAPH_VIEW_PROGRESSION_MAX_SPEED = 100;
const GRAPH_VIEW_PROGRESSION_LINKS_PER_SECOND = 0.5;

export type GraphViewProgressionState = {
  progression: number;
  progressionSpeed: number;
  startedAtMs: number;
};

export type GraphViewProgressionFrame =
  | { kind: "stop"; progression: number }
  | { kind: "wait"; progression: number }
  | { kind: "render"; progression: number };

export type GraphViewProgressionRenderResult = {
  continue: boolean;
  progression: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Recovered from `renderProgression`: clamp(sqrt(numLinks) * .5, 5, 100).
 * A link-less graph still advances at the minimum speed, matching the bundle.
 */
export function graphViewProgressionSpeed(numLinks: number): number {
  const safeLinks = Number.isFinite(numLinks) ? Math.max(0, numLinks) : 0;
  return clamp(
    Math.sqrt(safeLinks) * GRAPH_VIEW_PROGRESSION_LINKS_PER_SECOND,
    GRAPH_VIEW_PROGRESSION_MIN_SPEED,
    GRAPH_VIEW_PROGRESSION_MAX_SPEED,
  );
}

export function beginGraphViewProgression(
  numLinks: number,
  startedAtMs: number,
): GraphViewProgressionState {
  return {
    progression: 1,
    progressionSpeed: graphViewProgressionSpeed(numLinks),
    startedAtMs,
  };
}

/**
 * Calculate the next controller action after the zero-delay macrotask used by
 * the original.  `observedProgression` is the value captured before yielding;
 * a changed value means another render/reset interrupted the animation.
 */
export function advanceGraphViewProgression(
  state: GraphViewProgressionState,
  observedProgression: number,
  nowMs: number,
): GraphViewProgressionFrame {
  if (state.progression <= 0 || observedProgression !== state.progression) {
    return { kind: "stop", progression: state.progression };
  }

  const elapsedMs = Math.max(0, nowMs - state.startedAtMs);
  const nextProgression = 1 + Math.floor((state.progressionSpeed * elapsedMs) / 1000);

  if (nextProgression === state.progression) {
    return { kind: "wait", progression: state.progression };
  }

  return { kind: "render", progression: nextProgression };
}

/**
 * The bundle assigns the new progression before calling render().  A falsy
 * render result ends the async loop while preserving that assigned value.
 */
export function resolveGraphViewProgressionRender(
  progression: number,
  renderResult: unknown,
): GraphViewProgressionRenderResult {
  return {
    continue: Boolean(renderResult),
    progression,
  };
}
