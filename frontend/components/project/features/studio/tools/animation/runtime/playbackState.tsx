"use client";

import React, { createContext, useContext } from "react";
import type { AnimationExecutionState } from "./types";

const PlaybackContext = createContext<AnimationExecutionState | null>(null);

export function PlaybackProvider({
  value,
  children,
}: React.PropsWithChildren<{ value: AnimationExecutionState }>) {
  return (
    <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>
  );
}

function usePlaybackContext(): AnimationExecutionState {
  return (
    useContext(PlaybackContext) ?? {
      isPlaying: false,
      sequencePosition: 0,
      stepIndex: 0,
      totalSteps: 1,
      globalProgress: 0,
      sceneIndex: 0,
      sceneProgress: 0,
      playbackSpeed: 1,
    }
  );
}

export function usePlaybackState() {
  return usePlaybackContext();
}
