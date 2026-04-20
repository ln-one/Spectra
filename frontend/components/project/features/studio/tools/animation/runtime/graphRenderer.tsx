"use client";

import { useMemo } from "react";
import { MotionCanvasSceneRenderer } from "./motionCanvasRenderer";
import { compileRuntimeGraphToMotionCanvasScene } from "./motionCanvasManifest";
import {
  compileRuntimeGraphToTheatreState,
  resolveTheatreFrameForSequencePosition,
} from "./theatreState";
import { usePlaybackState } from "./playbackState";
import type { AnimationGraphRendererProps } from "./types";

export function AnimationGraphRenderer({
  graph,
  theme,
  theatreSequenceState,
  motionCanvasSceneManifest,
}: AnimationGraphRendererProps) {
  const playback = usePlaybackState();
  const compiledTheatreState = useMemo(
    () => theatreSequenceState ?? compileRuntimeGraphToTheatreState(graph),
    [graph, theatreSequenceState]
  );
  const compiledMotionCanvasManifest = useMemo(
    () => motionCanvasSceneManifest ?? compileRuntimeGraphToMotionCanvasScene(graph),
    [graph, motionCanvasSceneManifest]
  );
  const activeFrame = resolveTheatreFrameForSequencePosition(
    compiledTheatreState,
    playback.sequencePosition
  );

  return (
    <div
      data-testid="animation-runtime-motion-canvas-shell"
      data-theatre-sheet="animation-sequence"
      data-theatre-project={compiledTheatreState.projectId}
      data-motion-canvas-project={compiledMotionCanvasManifest.projectName}
    >
      <MotionCanvasSceneRenderer
        manifest={compiledMotionCanvasManifest}
        activeFrame={activeFrame}
        theme={theme}
      />
    </div>
  );
}
