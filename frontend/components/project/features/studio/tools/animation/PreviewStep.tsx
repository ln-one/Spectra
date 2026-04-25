"use client";

import { useEffect, useMemo } from "react";
import { Clapperboard, Download, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolFlowContext } from "../types";
import { WorkbenchCenteredState } from "../WorkbenchCenteredState";
import { BubbleSortMockPreview } from "./BubbleSortMockPreview";
import { AnimationRuntimeHost } from "./runtime/host";
import { readAnimationRuntimeSnapshot } from "./runtime/snapshot";
import type {
  AnimationPlacementSlot,
  AnimationRhythm,
  AnimationStylePack,
  AnimationVisualType,
} from "./types";

interface PreviewStepProps {
  lastGeneratedAt: string | null;
  durationSeconds?: number;
  rhythm?: AnimationRhythm;
  stylePack?: AnimationStylePack;
  visualType?: AnimationVisualType | null;
  focus?: string;
  serverSpecPreview?: Record<string, unknown> | null;
  flowContext?: ToolFlowContext;
  recommendation?: Record<string, unknown> | null;
  placements?: Record<string, unknown>[];
  isRefining?: boolean;
  isRecommendingPlacement?: boolean;
  isConfirmingPlacement?: boolean;
  onDurationChange?: (value: number) => void;
  onRhythmChange?: (value: AnimationRhythm) => void;
  onStylePackChange?: (value: AnimationStylePack) => void;
  onVisualTypeChange?: (value: AnimationVisualType | null) => void;
  onFocusChange?: (value: string) => void;
  topic?: string;
  showBubbleSortMock?: boolean;
  mockGenerationStartedAt?: string | null;
  onRefine?: () => void;
  onRecommendPlacement?: (pptArtifactId: string) => void;
  onConfirmPlacement?: (
    pptArtifactId: string,
    pageNumbers: number[],
    slot: AnimationPlacementSlot
  ) => void;
}

export function PreviewStep({
  lastGeneratedAt,
  flowContext,
  serverSpecPreview,
  showBubbleSortMock = false,
  mockGenerationStartedAt = null,
}: PreviewStepProps) {
  const capabilityStatus = flowContext?.capabilityStatus ?? "backend_placeholder";
  const managedStatus = flowContext?.managedResultTarget?.status ?? null;
  const latestArtifactId = flowContext?.latestArtifacts?.[0]?.artifactId ?? null;
  const artifactType = flowContext?.resolvedArtifact?.artifactType ?? null;

  const isGenerating =
    capabilityStatus === "executing" ||
    flowContext?.workflowState === "executing" ||
    managedStatus === "processing" ||
    flowContext?.isActionRunning;

  const mediaBlob =
    capabilityStatus === "backend_ready" &&
    flowContext?.resolvedArtifact?.contentKind === "media" &&
    flowContext.resolvedArtifact.blob
      ? flowContext.resolvedArtifact.blob
      : null;
  const mediaContentUrl =
    capabilityStatus === "backend_ready" &&
    flowContext?.resolvedArtifact?.contentKind === "media" &&
    typeof flowContext.resolvedArtifact.content === "string" &&
    flowContext.resolvedArtifact.content.trim()
      ? flowContext.resolvedArtifact.content
      : null;

  const mediaUrl = useMemo(() => {
    if (mediaContentUrl) return mediaContentUrl;
    if (!mediaBlob || typeof URL === "undefined") return null;
    if (typeof URL.createObjectURL !== "function") return null;
    return URL.createObjectURL(mediaBlob);
  }, [mediaBlob, mediaContentUrl]);

  useEffect(() => {
    return () => {
      if (!mediaUrl || typeof URL === "undefined") return;
      if (typeof URL.revokeObjectURL !== "function") return;
      URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);

  const htmlContent = useMemo(() => {
    const resolved = flowContext?.resolvedArtifact;
    if (!resolved || resolved.artifactType !== "html") return null;
    if (resolved.contentKind === "text" && typeof resolved.content === "string") {
      const trimmed = resolved.content.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (resolved.contentKind === "json" && resolved.content) {
      const payload = resolved.content as Record<string, unknown>;
      const rawHtml =
        (typeof payload.html === "string" && payload.html) ||
        (typeof payload.content_html === "string" && payload.content_html) ||
        (typeof payload.preview_html === "string" && payload.preview_html) ||
        "";
      const trimmed = rawHtml.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return null;
  }, [flowContext?.resolvedArtifact]);

  const runtimeSnapshot = useMemo(
    () => readAnimationRuntimeSnapshot({ flowContext, serverSpecPreview }),
    [flowContext, serverSpecPreview]
  );

  const hasReadyArtifact = Boolean(latestArtifactId) && capabilityStatus === "backend_ready";

  if (showBubbleSortMock) {
    return (
      <BubbleSortMockPreview
        startedAt={mockGenerationStartedAt}
        exportArtifactId={latestArtifactId}
      />
    );
  }

  if (!hasReadyArtifact) {
    return (
      <WorkbenchCenteredState
        tone="emerald"
        loading={isGenerating}
        icon={Clapperboard}
        title={isGenerating ? "动画生成中" : "暂未收到后端真实动画"}
        description={
          isGenerating
            ? "生成任务执行中，结果返回后会自动进入预览。"
            : "还没有收到首个真实成果，请稍等后端返回。"
        }
        pill={isGenerating ? "动画工作台正在准备中" : "动画成果返回后会在这里直接展开"}
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
              后端已返回真实成果，可直接预览和导出。
            </p>
          </div>
          {latestArtifactId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => void flowContext?.onExportArtifact?.(latestArtifactId)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              导出
            </Button>
          ) : null}
        </div>
        {lastGeneratedAt ? (
          <p className="mt-2 text-[11px] text-zinc-500">
            最近生成：{new Date(lastGeneratedAt).toLocaleString()}
          </p>
        ) : null}
      </section>

      {mediaUrl ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {artifactType === "gif" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt="动画预览"
              className="w-full"
            />
          ) : (
            <div className="relative aspect-video bg-zinc-950">
              <video
                title="动画视频预览"
                className="h-full w-full"
                src={mediaUrl}
                controls
                playsInline
              />
            </div>
          )}
        </section>
      ) : runtimeSnapshot && artifactType === "html" ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-700">
            <PlayCircle className="h-4 w-4" />
            Runtime 预览
          </div>
          <AnimationRuntimeHost snapshot={runtimeSnapshot} minimal />
        </section>
      ) : htmlContent ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <iframe
            title="HTML 动画预览"
            className="h-[480px] w-full bg-white"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={htmlContent}
          />
        </section>
      ) : runtimeSnapshot ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-700">
            <PlayCircle className="h-4 w-4" />
            Runtime 预览
          </div>
          <AnimationRuntimeHost snapshot={runtimeSnapshot} minimal />
        </section>
      ) : (
        <WorkbenchCenteredState
          tone="emerald"
          variant="compact"
          icon={Clapperboard}
          title="动画成果暂不可预览"
          description="后端已返回成果，但当前没有可展示的媒体或 runtime 预览内容。"
        />
      )}
    </div>
  );
}
