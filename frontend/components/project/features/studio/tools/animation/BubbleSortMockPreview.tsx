"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildArtifactDownloadFilename } from "@/lib/project-space/download-filename";
import { WorkbenchCenteredState } from "../WorkbenchCenteredState";
import { ANIMATION_STYLE_PACK_SWATCHES } from "./constants";
import {
  BUBBLE_SORT_EXPORT_FRAME_DELAY_MS,
  BUBBLE_SORT_EXPORT_FINAL_HOLD_FRAME_COUNT,
  BUBBLE_SORT_EXPORT_HEIGHT,
  BUBBLE_SORT_EXPORT_TRANSITION_FRAME_COUNT,
  BUBBLE_SORT_EXPORT_WIDTH,
  BUBBLE_SORT_MOCK_DURATION_SECONDS,
  buildBubbleSortMockRuntimeSnapshot,
} from "./bubbleSortMock";
import { PlaybackProvider } from "./runtime/runtimeApi";
import { AnimationGraphRenderer } from "./runtime/graphRenderer";

interface BubbleSortMockPreviewProps {
  startedAt?: string | null;
  exportArtifactId?: string | null;
}

interface BubbleSortRuntimeCardProps {
  playbackStep: number;
  snapshot: ReturnType<typeof buildBubbleSortMockRuntimeSnapshot>;
  theme: (typeof ANIMATION_STYLE_PACK_SWATCHES)[keyof typeof ANIMATION_STYLE_PACK_SWATCHES];
  totalSteps: number;
  className?: string;
}

function BubbleSortRuntimeCard({
  playbackStep,
  snapshot,
  theme,
  totalSteps,
  className = "overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4",
}: BubbleSortRuntimeCardProps) {
  return (
    <section className={className}>
      {snapshot.runtimeGraph ? (
        <PlaybackProvider
          value={{
            isPlaying: true,
            sequencePosition: playbackStep,
            stepIndex: playbackStep,
            totalSteps,
            globalProgress: totalSteps > 1 ? playbackStep / (totalSteps - 1) : 0,
            sceneIndex: Math.min(
              snapshot.sceneOutline.length - 1,
              Math.floor(
                (playbackStep / Math.max(totalSteps, 1)) *
                  Math.max(snapshot.sceneOutline.length, 1)
              )
            ),
            sceneProgress: 0.5,
            playbackSpeed: 1,
            currentSceneTitle:
              snapshot.sceneOutline[
                Math.min(
                  snapshot.sceneOutline.length - 1,
                  Math.floor(
                    (playbackStep / Math.max(totalSteps, 1)) *
                      Math.max(snapshot.sceneOutline.length, 1)
                  )
                )
              ]?.title,
            hasAutoplayStarted: true,
          }}
        >
          <AnimationGraphRenderer graph={snapshot.runtimeGraph} theme={theme} />
        </PlaybackProvider>
      ) : null}
    </section>
  );
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function waitForMs(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

export function BubbleSortMockPreview({
  startedAt,
  exportArtifactId = null,
}: BubbleSortMockPreviewProps) {
  const [now, setNow] = useState(() => Date.now());
  const [fallbackStartMs] = useState(() => Date.now());
  const [isExporting, setIsExporting] = useState(false);
  const [exportStepIndex, setExportStepIndex] = useState(0);
  const exportFrameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  const isFakeGenerating = useMemo(() => {
    const start = startedAt ? new Date(startedAt).getTime() : fallbackStartMs;
    const elapsedSeconds = Math.max(0, (now - start) / 1000);
    return elapsedSeconds < BUBBLE_SORT_MOCK_DURATION_SECONDS;
  }, [fallbackStartMs, now, startedAt]);

  const snapshot = useMemo(() => buildBubbleSortMockRuntimeSnapshot(), []);
  const totalSteps = snapshot.runtimeGraph?.timeline.total_steps ?? 1;
  const playbackStep = useMemo(() => {
    if (totalSteps <= 1) return 0;
    const start = startedAt ? new Date(startedAt).getTime() : fallbackStartMs;
    const previewElapsedSeconds = Math.max(
      0,
      (now - start - BUBBLE_SORT_MOCK_DURATION_SECONDS * 1000) / 1000
    );
    return Math.floor(previewElapsedSeconds) % totalSteps;
  }, [fallbackStartMs, now, startedAt, totalSteps]);
  const theme =
    ANIMATION_STYLE_PACK_SWATCHES[
      (snapshot.stylePack as keyof typeof ANIMATION_STYLE_PACK_SWATCHES) ??
        "teaching_ppt_minimal_gray"
    ] ?? ANIMATION_STYLE_PACK_SWATCHES.teaching_ppt_minimal_gray;

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      await waitForNextPaint();

      const [{ GIFEncoder, applyPalette, quantize }, { toCanvas }] =
        await Promise.all([import("gifenc"), import("html-to-image")]);
      const gif = GIFEncoder();

      if (typeof document !== "undefined" && "fonts" in document) {
        try {
          await document.fonts.ready;
        } catch {
          // Ignore font readiness failures and continue with export.
        }
      }

      const captureFrame = async (delayMs: number) => {
        if (!exportFrameRef.current) {
          throw new Error("bubble sort export frame is not ready");
        }

        const canvas = await toCanvas(exportFrameRef.current, {
          cacheBust: true,
          pixelRatio: 1,
          canvasWidth: BUBBLE_SORT_EXPORT_WIDTH,
          canvasHeight: BUBBLE_SORT_EXPORT_HEIGHT,
          width: BUBBLE_SORT_EXPORT_WIDTH,
          height: BUBBLE_SORT_EXPORT_HEIGHT,
          backgroundColor: "#ffffff",
        });
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("failed to create bubble sort export canvas context");
        }

        const rgba = context.getImageData(
          0,
          0,
          BUBBLE_SORT_EXPORT_WIDTH,
          BUBBLE_SORT_EXPORT_HEIGHT
        ).data;
        const palette = quantize(rgba, 256, { format: "rgb565" });
        const index = applyPalette(rgba, palette, "rgb565");

        gif.writeFrame(index, BUBBLE_SORT_EXPORT_WIDTH, BUBBLE_SORT_EXPORT_HEIGHT, {
          palette,
          delay: delayMs,
          repeat: 0,
        });
      };

      setExportStepIndex(0);
      await waitForNextPaint();
      await captureFrame(BUBBLE_SORT_EXPORT_FRAME_DELAY_MS);

      for (let stepIndex = 1; stepIndex < totalSteps; stepIndex += 1) {
        setExportStepIndex(stepIndex);

        for (
          let transitionFrame = 0;
          transitionFrame < BUBBLE_SORT_EXPORT_TRANSITION_FRAME_COUNT;
          transitionFrame += 1
        ) {
          await waitForNextPaint();
          if (transitionFrame > 0) {
            await waitForMs(BUBBLE_SORT_EXPORT_FRAME_DELAY_MS);
          }
          await captureFrame(BUBBLE_SORT_EXPORT_FRAME_DELAY_MS);
        }
      }

      for (
        let holdFrame = 0;
        holdFrame < BUBBLE_SORT_EXPORT_FINAL_HOLD_FRAME_COUNT;
        holdFrame += 1
      ) {
        await waitForNextPaint();
        await captureFrame(BUBBLE_SORT_EXPORT_FRAME_DELAY_MS);
      }

      gif.finish();
      const gifBytes = gif.bytes();
      const gifBuffer = gifBytes.buffer.slice(
        gifBytes.byteOffset,
        gifBytes.byteOffset + gifBytes.byteLength
      ) as ArrayBuffer;

      const blob = new Blob([gifBuffer], {
        type: "image/gif",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildArtifactDownloadFilename({
        title: snapshot.title ?? "冒泡排序演示动画",
        artifactId: exportArtifactId ?? "bubble-sort-preview",
        artifactType: "gif",
        ext: "gif",
      });
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [exportArtifactId, isExporting, snapshot.title, totalSteps]);

  if (isFakeGenerating) {
    return (
      <WorkbenchCenteredState
        tone="emerald"
        loading
        icon={Clapperboard}
        title="动画生成中"
        description="正在按冒泡排序教学主题生成正式动画，请稍候。"
        pill={`AI 正在生成冒泡排序演示，约 ${BUBBLE_SORT_MOCK_DURATION_SECONDS} 秒后返回预览结果`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">动画预览</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              生成已完成，可直接查看当前动画结果。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={isExporting}
            onClick={handleExport}
          >
            {isExporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isExporting ? "导出 GIF 中" : "导出 GIF"}
          </Button>
        </div>
      </section>

      <BubbleSortRuntimeCard
        playbackStep={playbackStep}
        snapshot={snapshot}
        theme={theme}
        totalSteps={totalSteps}
      />

      {isExporting ? (
        <div
          className="pointer-events-none fixed left-[-10000px] top-0 opacity-0"
          aria-hidden="true"
        >
          <div
            ref={exportFrameRef}
            style={{
              width: `${BUBBLE_SORT_EXPORT_WIDTH}px`,
              height: `${BUBBLE_SORT_EXPORT_HEIGHT}px`,
              background: "#ffffff",
              padding: "24px",
              boxSizing: "border-box",
            }}
          >
            <BubbleSortRuntimeCard
              playbackStep={exportStepIndex}
              snapshot={snapshot}
              theme={theme}
              totalSteps={totalSteps}
              className="h-full overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
