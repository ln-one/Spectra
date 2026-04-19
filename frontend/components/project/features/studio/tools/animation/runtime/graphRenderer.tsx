"use client";

import { useEffect, useMemo } from "react";
import { MotionCanvasSceneRenderer } from "./motionCanvasRenderer";
import { compileRuntimeGraphToMotionCanvasScene } from "./motionCanvasManifest";
import {
  createTheatreSequenceProject,
  compileRuntimeGraphToTheatreState,
  resolveTheatreFrameForSequencePosition,
} from "./theatreState";
import { usePlaybackState } from "./playbackState";
import type { AnimationGraphRendererProps } from "./types";

function syncTheatreSequencePosition(
  position: number,
  sheet: { sequence: { position: number } }
) {
  sheet.sequence.position = position;
}

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
  const theatreProjectBinding = useMemo(
    () => createTheatreSequenceProject(compiledTheatreState),
    [compiledTheatreState]
  );
  const activeFrame = resolveTheatreFrameForSequencePosition(
    compiledTheatreState,
    playback.sequencePosition
  );

  useEffect(() => {
    syncTheatreSequencePosition(
      activeFrame / compiledTheatreState.stepDurationFrames,
      theatreProjectBinding.sheet
    );
  }, [activeFrame, compiledTheatreState.stepDurationFrames, theatreProjectBinding]);

  return (
    <div
      data-testid="animation-runtime-motion-canvas-shell"
      data-theatre-sheet={theatreProjectBinding.sheet.address.sheetId}
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
