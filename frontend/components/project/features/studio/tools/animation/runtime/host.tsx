"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ANIMATION_STYLE_PACK_SWATCHES,
  resolveDefaultExplainerStylePack,
} from "../constants";
import { AnimationRuntimeErrorPanel } from "./ErrorPanel";
import { isSandboxInboundEvent } from "./sandboxProtocol";
import {
  compileRuntimeGraphToTheatreState,
  resolveTheatreFrameForSequencePosition,
} from "./theatreState";
import type {
  AnimationArtifactRuntimeSnapshot,
  AnimationCompileError,
  AnimationExecutionState,
  AnimationRuntimeTheme,
  AnimationSandboxOutboundMessage,
} from "./types";

function resolveTheme(snapshot: AnimationArtifactRuntimeSnapshot): AnimationRuntimeTheme {
  const stylePack = snapshot.stylePack ?? resolveDefaultExplainerStylePack();
  return (
    ANIMATION_STYLE_PACK_SWATCHES[
      stylePack as keyof typeof ANIMATION_STYLE_PACK_SWATCHES
    ] ?? ANIMATION_STYLE_PACK_SWATCHES.teaching_ppt_minimal_gray
  );
}

interface AnimationRuntimeHostProps {
  snapshot: AnimationArtifactRuntimeSnapshot;
  autoplay?: boolean;
  minimal?: boolean;
}

function buildOutboundMessage(params: {
  type: "animation-runtime:init" | "animation-runtime:update";
  sessionToken: string;
  snapshot: AnimationArtifactRuntimeSnapshot;
  executionState: AnimationExecutionState;
  theme: AnimationRuntimeTheme;
}): AnimationSandboxOutboundMessage {
  if (params.type === "animation-runtime:init") {
    return {
      type: "animation-runtime:init",
      sessionToken: params.sessionToken,
      snapshot: params.snapshot,
      executionState: params.executionState,
      theme: params.theme,
    };
  }
  return {
    type: "animation-runtime:update",
    sessionToken: params.sessionToken,
    executionState: params.executionState,
    theme: params.theme,
  };
}

function clampSequencePosition(value: number, totalSteps: number): number {
  return Math.max(0, Math.min(value, Math.max(totalSteps - 1, 0)));
}

export function AnimationRuntimeHost({
  snapshot,
  autoplay = true,
  minimal = true,
}: AnimationRuntimeHostProps) {
  return (
    <AnimationRuntimeHostInner
      key={`${snapshot.runtimeVersion}:${snapshot.generationPromptDigest ?? snapshot.componentCode}:${autoplay ? "autoplay" : "manual"}:${minimal ? "minimal" : "full"}`}
      snapshot={snapshot}
      autoplay={autoplay}
      minimal={minimal}
    />
  );
}

function AnimationRuntimeHostInner({
  snapshot,
  autoplay = true,
  minimal = true,
}: AnimationRuntimeHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const theatreSequenceState = useMemo(
    () =>
      snapshot.runtimeGraph ? compileRuntimeGraphToTheatreState(snapshot.runtimeGraph) : null,
    [snapshot.runtimeGraph]
  );
  const totalSteps = theatreSequenceState
    ? Math.max(
        Math.ceil(
          theatreSequenceState.durationFrames / theatreSequenceState.stepDurationFrames
        ),
        1
      )
    : (() => {
        if (snapshot.runtimeGraph?.timeline?.total_steps) {
          return Math.max(snapshot.runtimeGraph.timeline.total_steps, 1);
        }
        const metadata = snapshot.metadata ?? {};
        const rawSteps = metadata.steps;
        if (Array.isArray(rawSteps) && rawSteps.length > 0) return rawSteps.length;
        return Math.max(snapshot.sceneOutline.length, 1);
      })();
  const [sequencePosition, setSequencePosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [frameReady, setFrameReady] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<AnimationCompileError[]>(
    snapshot.compileStatus === "error" ? snapshot.compileErrors : []
  );
  const [hasAutoplayStarted, setHasAutoplayStarted] = useState(autoplay);
  const [isHovered, setIsHovered] = useState(false);
  const [controlsPinned, setControlsPinned] = useState(!autoplay);
  const [telemetryPosition, setTelemetryPosition] = useState<number | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const parentOrigin = mounted ? window.location.origin : "";
  const sessionToken = useMemo(
    () =>
      [
        snapshot.generationPromptDigest ?? snapshot.runtimeVersion,
        snapshot.familyHint ?? "runtime",
        snapshot.title ?? "animation",
      ].join(":"),
    [
      snapshot.familyHint,
      snapshot.generationPromptDigest,
      snapshot.runtimeVersion,
      snapshot.title,
    ]
  );

  const stepIndex = Math.min(
    Math.max(Math.round(sequencePosition), 0),
    Math.max(totalSteps - 1, 0)
  );

  useEffect(() => {
    if (!isPlaying || totalSteps <= 1) return undefined;
    const delay = Math.max(300, 1000 / playbackSpeed);
    const timeout = window.setTimeout(() => {
      setSequencePosition((current) => {
        const nextPosition = clampSequencePosition(current + 1, totalSteps);
        if (nextPosition >= totalSteps - 1) {
          setIsPlaying(false);
          return nextPosition;
        }
        return nextPosition;
      });
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [isPlaying, playbackSpeed, sequencePosition, totalSteps]);

  useEffect(() => {
    if (!minimal || !controlsPinned || !isPlaying) return undefined;
    const timeout = window.setTimeout(() => {
      setControlsPinned(false);
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [controlsPinned, isPlaying, minimal, sequencePosition]);

  const executionState: AnimationExecutionState = useMemo(() => {
    const safeTotal = Math.max(totalSteps, 1);
    const clampedPosition = clampSequencePosition(sequencePosition, safeTotal);
    const globalProgress = safeTotal > 1 ? clampedPosition / (safeTotal - 1) : 0;
    const activeFrame = theatreSequenceState
      ? resolveTheatreFrameForSequencePosition(theatreSequenceState, clampedPosition)
      : stepIndex;
    const sceneRanges = theatreSequenceState?.sceneRanges ?? [];
    const matchedSceneIndex = sceneRanges.findIndex(
      (scene) => activeFrame >= scene.startFrame && activeFrame <= scene.endFrame
    );
    const fallbackSceneCount = Math.max(snapshot.sceneOutline.length, 1);
    const sceneIndex =
      matchedSceneIndex >= 0
        ? matchedSceneIndex
        : Math.min(fallbackSceneCount - 1, Math.floor(globalProgress * fallbackSceneCount));
    const activeScene = sceneRanges[sceneIndex] ?? null;
    const sceneProgress = activeScene
      ? (activeFrame - activeScene.startFrame) /
        Math.max(activeScene.endFrame - activeScene.startFrame, 1)
      : globalProgress;
    const currentSceneTitle =
      activeScene?.title ?? snapshot.sceneOutline[sceneIndex]?.title?.trim() ?? undefined;
    return {
      isPlaying,
      sequencePosition: clampedPosition,
      stepIndex,
      totalSteps: safeTotal,
      globalProgress,
      sceneIndex,
      sceneProgress: Number.isFinite(sceneProgress)
        ? Math.max(0, Math.min(1, sceneProgress))
        : 0,
      playbackSpeed,
      currentSceneTitle,
      hasAutoplayStarted,
    };
  }, [
    hasAutoplayStarted,
    isPlaying,
    playbackSpeed,
    sequencePosition,
    snapshot.sceneOutline,
    stepIndex,
    theatreSequenceState,
    totalSteps,
  ]);

  const theme = resolveTheme(snapshot);
  const controlsVisible = minimal ? isHovered || !isPlaying || controlsPinned : true;
  const frameSrc = useMemo(() => {
    if (!parentOrigin) return "";
    const query = new URLSearchParams({
      session: sessionToken,
      parentOrigin: encodeURIComponent(parentOrigin),
    });
    return `/animation-runtime-sandbox?${query.toString()}`;
  }, [parentOrigin, sessionToken]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!iframeRef.current?.contentWindow) return;
      if (!isSandboxInboundEvent(event.data)) return;
      if (event.data.sessionToken !== sessionToken) return;
      if (event.origin !== "null" && event.origin !== parentOrigin) return;

      if (event.data.type === "animation-runtime:ready") {
        setFrameReady(true);
        setRuntimeErrors([]);
        return;
      }

      if (event.data.type === "animation-runtime:telemetry") {
        setTelemetryPosition(event.data.sequencePosition);
        return;
      }

      setRuntimeErrors(event.data.errors);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [parentOrigin, sessionToken]);

  useEffect(() => {
    if (
      !frameReady ||
      !iframeRef.current?.contentWindow ||
      (!snapshot.runtimeGraph && !snapshot.componentCode)
    ) {
      return;
    }
    const payload = buildOutboundMessage({
      type: telemetryPosition === null ? "animation-runtime:init" : "animation-runtime:update",
      sessionToken,
      snapshot,
      executionState,
      theme,
    });

    iframeRef.current.contentWindow.postMessage(payload, "*");
  }, [
    executionState,
    frameReady,
    sessionToken,
    snapshot,
    telemetryPosition,
    theme,
  ]);

  const errors =
    runtimeErrors.length > 0
      ? runtimeErrors
      : snapshot.compileStatus === "error"
        ? snapshot.compileErrors
        : [];

  const showPlayer =
    Boolean(snapshot.runtimeGraph || snapshot.componentCode) && errors.length === 0;
  const currentSceneTitle = executionState.currentSceneTitle?.trim() ?? "";

  return (
    <div className="space-y-3">
      {errors.length > 0 ? (
        <AnimationRuntimeErrorPanel
          title={
            snapshot.requiresRegeneration ? "动画需要重生成" : "动画运行失败"
          }
          description={
            snapshot.requiresRegeneration
              ? "当前 artifact 没有可执行 runtime 代码。这里不会回退成伪预览。"
              : "当前 artifact 的运行时代码没有通过编译或执行。这里不会回退成伪预览。"
          }
          errors={errors}
        />
      ) : null}

      {showPlayer ? (
        <div
          className="group/player relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setControlsPinned(true)}
          onTouchStart={() => setControlsPinned(true)}
        >
          <div className="relative min-h-[500px] overflow-hidden rounded-[28px] border border-white/40 bg-zinc-950 shadow-[0_24px_72px_rgba(15,23,42,0.16)]">
            {mounted && frameSrc ? (
              <iframe
                ref={iframeRef}
                title={snapshot.title ?? "Animation Runtime"}
                src={frameSrc}
                sandbox="allow-scripts"
                className="h-[500px] w-full border-0"
              />
            ) : (
              <div className="flex h-[500px] items-center justify-center text-sm text-white/70">
                Preparing sandbox...
              </div>
            )}
          </div>

          <div
            className={`absolute inset-x-5 bottom-5 z-30 transition duration-200 ${
              controlsVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-88"
            }`}
          >
            <div className="rounded-[20px] border border-white/20 bg-black/18 px-3 py-3 text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-full bg-white px-3 text-xs text-zinc-900 hover:bg-white/90"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsPlaying((current) => !current);
                    setHasAutoplayStarted(true);
                    setControlsPinned(true);
                  }}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="mr-1.5 h-3.5 w-3.5" />
                      暂停
                    </>
                  ) : (
                    <>
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      播放
                    </>
                  )}
                </Button>

                <div className="min-w-0 flex-1">
                  <Slider
                    value={[executionState.sequencePosition]}
                    min={0}
                    max={Math.max(executionState.totalSteps - 1, 0)}
                    step={1}
                    onValueChange={(value) => {
                      setSequencePosition(
                        clampSequencePosition(value[0] ?? 0, executionState.totalSteps)
                      );
                      setIsPlaying(false);
                      setHasAutoplayStarted(true);
                      setControlsPinned(true);
                    }}
                  />
                </div>
              </div>

              {controlsVisible ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full border-white/20 bg-white/6 px-3 text-[11px] text-white hover:bg-white/12"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSequencePosition((current) =>
                          clampSequencePosition(current + 1, executionState.totalSteps)
                        );
                        setIsPlaying(false);
                        setHasAutoplayStarted(true);
                        setControlsPinned(true);
                      }}
                    >
                      <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                      单步
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full border-white/20 bg-white/6 px-3 text-[11px] text-white hover:bg-white/12"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSequencePosition(0);
                        setIsPlaying(true);
                        setHasAutoplayStarted(true);
                        setControlsPinned(true);
                      }}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      重播
                    </Button>
                    {currentSceneTitle ? (
                      <span className="shrink-0 text-[10px] text-white/58">
                        {currentSceneTitle}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex min-w-[180px] items-center gap-3">
                    <span className="shrink-0 text-[10px] text-white/72">
                      {playbackSpeed.toFixed(1)}x
                    </span>
                    <Slider
                      value={[playbackSpeed]}
                      min={0.5}
                      max={2}
                      step={0.25}
                      onValueChange={(value) => {
                        setPlaybackSpeed(value[0] ?? 1);
                        setHasAutoplayStarted(true);
                        setControlsPinned(true);
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
