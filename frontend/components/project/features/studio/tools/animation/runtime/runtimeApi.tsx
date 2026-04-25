"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Arrow,
  Callout,
  Caption,
  Chart,
  Edge,
  Equation,
  Label,
  Node,
  Scene,
  Sprite,
  Stage,
  Timeline,
  Track,
} from "./primitives";
import { AnimationGraphRenderer } from "./graphRenderer";
import { usePlaybackState } from "./playbackState";

export { PlaybackProvider } from "./playbackState";

export function usePlayback() {
  return usePlaybackState();
}

export function useTimeline() {
  const playback = usePlaybackState();
  return {
    stepIndex: playback.stepIndex,
    totalSteps: playback.totalSteps,
    sceneIndex: playback.sceneIndex,
    sceneProgress: playback.sceneProgress,
  };
}

export function useSceneState() {
  const playback = usePlaybackState();
  return {
    sceneIndex: playback.sceneIndex,
    isCurrent: true,
    progress: playback.sceneProgress,
  };
}

export function createRuntimeApi() {
  return {
    React,
    motion,
    Stage,
    Scene,
    Node,
    Edge,
    Arrow,
    Label,
    Caption,
    Track,
    Chart,
    Sprite,
    Callout,
    Equation,
    Timeline,
    AnimationGraphRenderer,
    useTimeline,
    usePlayback,
    useSceneState,
  };
}
