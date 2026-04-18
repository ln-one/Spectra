"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import {
  ANIMATION_RHYTHM_OPTIONS,
  ANIMATION_SLOT_OPTIONS,
  ANIMATION_VISUAL_TYPE_OPTIONS,
  getRhythmLabel,
  getVisualTypeLabel,
} from "./constants";
import type {
  AnimationPlacementSlot,
  AnimationRhythm,
  AnimationStylePack,
  AnimationVisualType,
} from "./types";
import { AnimationRuntimeHost } from "./runtime/host";
import { readAnimationRuntimeSnapshot } from "./runtime/snapshot";

type PlacementRecommendation = {
  recommended_page?: number;
  recommended_slot?: string;
  reason?: string;
};

type PlacementRecord = {
  ppt_artifact_id?: string;
  page_number?: number;
  slot?: string;
  confirmed_at?: string;
};

function getSourceOptionLabel(item: { id: string; title?: string }): string {
  const shortId = item.id.slice(0, 8);
  const title = item.title?.trim();
  if (title) return `${title} (${shortId})`;
  return `PPT ${shortId}`;
}

function normalizeRecommendation(
  value: Record<string, unknown> | null
): PlacementRecommendation | null {
  if (!value) return null;
  return {
    recommended_page:
      typeof value.recommended_page === "number"
        ? value.recommended_page
        : undefined,
    recommended_slot:
      typeof value.recommended_slot === "string"
        ? value.recommended_slot
        : undefined,
    reason: typeof value.reason === "string" ? value.reason : undefined,
  };
}

function normalizePlacements(
  value: Record<string, unknown>[] | null
): PlacementRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    ppt_artifact_id:
      typeof item.ppt_artifact_id === "string"
        ? item.ppt_artifact_id
        : undefined,
    page_number:
      typeof item.page_number === "number" ? item.page_number : undefined,
    slot: typeof item.slot === "string" ? item.slot : undefined,
    confirmed_at:
      typeof item.confirmed_at === "string" ? item.confirmed_at : undefined,
  }));
}

function readMetadataMap(
  flowContext?: ToolFlowContext
): Record<string, unknown> | null {
  const metadata = flowContext?.resolvedArtifact?.artifactMetadata;
  if (!metadata || typeof metadata !== "object") return null;
  return metadata;
}

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
  durationSeconds = 6,
  rhythm = "balanced",
  visualType = null,
  focus = "",
  serverSpecPreview,
  flowContext,
  recommendation = null,
  placements = [],
  isRefining = false,
  isRecommendingPlacement = false,
  isConfirmingPlacement = false,
  onDurationChange = () => {},
  onRhythmChange = () => {},
  onVisualTypeChange = () => {},
  onFocusChange = () => {},
  onRefine = () => {},
  onRecommendPlacement = () => {},
  onConfirmPlacement = () => {},
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回按规格渲染的 GIF 动画。";
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
    if (!mediaBlob) return null;
    if (typeof URL === "undefined") return null;
    if (typeof URL.createObjectURL !== "function") return null;
    return URL.createObjectURL(mediaBlob);
  }, [mediaBlob, mediaContentUrl]);
  useEffect(() => {
    return () => {
      if (!mediaUrl) return;
      if (typeof URL === "undefined") return;
      if (typeof URL.revokeObjectURL !== "function") return;
      URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);
  const latestArtifactId =
    flowContext?.latestArtifacts?.[0]?.artifactId ?? null;
  const sourceOptions = (flowContext?.sourceOptions ?? []).map((item) => ({
    ...item,
    title: getSourceOptionLabel(item),
  }));
  const metadata = readMetadataMap(flowContext);
  const metadataRecommendation = normalizeRecommendation(
    metadata?.placement_recommendation as Record<string, unknown> | null
  );
  const metadataPlacements = normalizePlacements(
    metadata?.placements as Record<string, unknown>[] | null
  );
  const recommendationState =
    normalizeRecommendation(recommendation) ?? metadataRecommendation;
  const placementState =
    placements.length > 0
      ? normalizePlacements(placements)
      : metadataPlacements;

  const recommendedPageText = recommendationState?.recommended_page
    ? String(recommendationState.recommended_page)
    : "";
  const recommendedSlot = (
    recommendationState?.recommended_slot &&
    ANIMATION_SLOT_OPTIONS.some(
      (item) => item.value === recommendationState.recommended_slot
    )
      ? recommendationState.recommended_slot
      : "bottom-right"
  ) as AnimationPlacementSlot;
  const [pageNumbersText, setPageNumbersText] = useState(recommendedPageText);
  const [isPageNumbersEdited, setIsPageNumbersEdited] = useState(false);
  const [slot, setSlot] = useState<AnimationPlacementSlot>(recommendedSlot);
  const [isSlotEdited, setIsSlotEdited] = useState(false);
  const [showRefineSettings, setShowRefineSettings] = useState(false);
  const [showPlacementDetails, setShowPlacementDetails] = useState(false);
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const recommendedDurationSeconds =
    typeof serverSpecPreview?.comfortable_duration_seconds === "number"
      ? serverSpecPreview.comfortable_duration_seconds
      : typeof serverSpecPreview?.recommended_duration_seconds === "number"
        ? serverSpecPreview.recommended_duration_seconds
        : null;
  const minimumDurationSeconds =
    typeof serverSpecPreview?.minimum_duration_seconds === "number"
      ? serverSpecPreview.minimum_duration_seconds
      : null;
  const sceneCount =
    typeof serverSpecPreview?.scene_count === "number"
      ? serverSpecPreview.scene_count
      : null;
  const durationWarning =
    typeof serverSpecPreview?.duration_warning === "string"
      ? serverSpecPreview.duration_warning
      : null;
  const effectivePageNumbersText = isPageNumbersEdited
    ? pageNumbersText
    : recommendedPageText;
  const effectiveSlot = isSlotEdited ? slot : recommendedSlot;
  const runtimeSnapshot = useMemo(
    () => readAnimationRuntimeSnapshot({ flowContext, serverSpecPreview }),
    [flowContext, serverSpecPreview]
  );
  const cloudVideoStatus =
    typeof metadata?.cloud_video_status === "string"
      ? metadata.cloud_video_status
      : null;
  const cloudVideoError =
    typeof metadata?.cloud_video_error === "string"
      ? metadata.cloud_video_error
      : null;
  const showRuntimePlayer = Boolean(runtimeSnapshot);
  const showVideoPreview = Boolean(mediaUrl) && !showRuntimePlayer;
  const exportLabel =
    flowContext?.resolvedArtifact?.artifactType === "mp4" ? "下载 MP4" : "下载 GIF";
  const hasRuntimePlayer = showRuntimePlayer;
  const showCapabilityNotice =
    capabilityStatus !== "backend_ready" && !hasRuntimePlayer;
  const hasRenderedMedia = Boolean(mediaUrl);
  const refineSummaryParts = [
    `${durationSeconds} 秒`,
    getRhythmLabel(rhythm),
    `模板：${getVisualTypeLabel(visualType)}`,
  ];

  if (focus.trim()) {
    refineSummaryParts.push(`重点：${focus.trim()}`);
  }
  const formattedLastGeneratedAt =
    isClient && lastGeneratedAt ? new Date(lastGeneratedAt).toLocaleString() : null;

  const handleConfirm = () => {
    const pptArtifactId = flowContext?.selectedSourceId ?? "";
    const pageNumbers = Array.from(
      new Set(
        effectivePageNumbersText
          .split(/[,，\s]+/)
          .map((item) => Number.parseInt(item, 10))
          .filter((item) => Number.isFinite(item) && item > 0)
      )
    );

    if (!pptArtifactId || pageNumbers.length === 0) return;
    onConfirmPlacement(pptArtifactId, pageNumbers, effectiveSlot);
  };

  return (
    <div className="space-y-4">
      {showVideoPreview && mediaUrl ? (
        <section className="overflow-hidden rounded-[28px] border border-zinc-200/70 bg-white shadow-sm">
          <div className="relative aspect-video bg-zinc-950">
            <video
              title="动画视频预览"
              className="h-full w-full"
              src={mediaUrl}
              controls
              playsInline
            />
          </div>
        </section>
      ) : null}

      {!showVideoPreview && cloudVideoStatus && cloudVideoStatus !== "succeeded" ? (
        <section className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold text-zinc-800">视频生成任务</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {cloudVideoStatus === "failed"
              ? "百炼视频生成失败。"
              : "正在等待百炼 Wan 返回正式 MP4 成片。"}
          </p>
          {cloudVideoError ? (
            <p className="mt-3 rounded-xl border border-red-200/80 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {cloudVideoError}
            </p>
          ) : null}
        </section>
      ) : null}

      {showRuntimePlayer ? (
        <AnimationRuntimeHost snapshot={runtimeSnapshot} minimal />
      ) : null}

      {showCapabilityNotice || latestArtifactId ? (
        <section className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
          {showCapabilityNotice ? (
            <CapabilityNotice
              status={capabilityStatus}
              reason={capabilityReason}
            />
          ) : null}

          <div
            className={`${showCapabilityNotice ? "mt-3" : ""} flex items-center justify-between gap-3`}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-800">导出成果</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {hasRenderedMedia
                  ? showRuntimePlayer
                    ? "主预览已回到 runtime；这里保留正式导出入口。"
                    : "后端导出已返回，可直接下载。"
                  : formattedLastGeneratedAt
                    ? `最近一次生成：${formattedLastGeneratedAt}`
                    : "上方是主预览；这里仅保留导出入口。"}
              </p>
            </div>
            {latestArtifactId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-full text-xs"
                onClick={() =>
                  void flowContext?.onExportArtifact?.(latestArtifactId)
                }
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {exportLabel}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-800">结果 refine</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {refineSummaryParts.join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs text-zinc-600"
              onClick={() => setShowRefineSettings((value) => !value)}
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              更多设置
              {showRefineSettings ? (
                <ChevronUp className="ml-1.5 h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full bg-blue-600 px-4 text-xs hover:bg-blue-500"
              disabled={!latestArtifactId || isRefining}
              onClick={onRefine}
            >
              {isRefining ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  正在 refine
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  生成新版
                </>
              )}
            </Button>
          </div>
        </div>

        {showRefineSettings ? (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-600">
                动画时长：{durationSeconds} 秒
              </Label>
              <Slider
                value={[durationSeconds]}
                min={3}
                max={20}
                step={1}
                onValueChange={(value) => onDurationChange(value[0] ?? 6)}
              />
              {recommendedDurationSeconds ? (
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900">
                  <p>
                    当前分镜 {sceneCount ?? "-"} 个
                    {minimumDurationSeconds
                      ? `，至少 ${Math.round(minimumDurationSeconds)} 秒`
                      : ""}
                    ，推荐 {Math.round(recommendedDurationSeconds)} 秒。
                  </p>
                  {durationWarning ? (
                    <p className="mt-1 text-amber-800">{durationWarning}</p>
                  ) : null}
                  {durationSeconds !== Math.round(recommendedDurationSeconds) ? (
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full text-[11px]"
                        onClick={() =>
                          onDurationChange(Math.round(recommendedDurationSeconds))
                        }
                      >
                        一键采用推荐时长
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">节奏</Label>
              <Select
                value={rhythm}
                onValueChange={(value) =>
                  onRhythmChange(value as AnimationRhythm)
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANIMATION_RHYTHM_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-zinc-500">
                {getRhythmLabel(rhythm)}
              </p>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs text-zinc-600">模板类型</Label>
              <Select
                value={visualType ?? "__auto__"}
                onValueChange={(value) =>
                  onVisualTypeChange(
                    value === "__auto__" ? null : (value as AnimationVisualType)
                  )
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">自动判断</SelectItem>
                  {ANIMATION_VISUAL_TYPE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label className="text-xs text-zinc-600">表现重点</Label>
              <Textarea
                value={focus}
                onChange={(event) => onFocusChange(event.target.value)}
                placeholder="例如：突出因果链路，不要平均展示所有步骤。"
                className="mt-2 min-h-[88px] resize-none text-xs"
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-800">插入 PPT</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              先选目标 PPT，再决定页码和版位。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs text-zinc-600"
              onClick={() => setShowPlacementDetails((value) => !value)}
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              更多设置
              {showPlacementDetails ? (
                <ChevronUp className="ml-1.5 h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => void flowContext?.onLoadSources?.()}
            >
              刷新 PPT
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">选择 PPT</Label>
            <Select
              value={flowContext?.selectedSourceId ?? "__none__"}
              onValueChange={(value) =>
                flowContext?.onSelectedSourceChange?.(
                  value === "__none__" ? null : value
                )
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="请选择一个 PPT 成果" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">暂不插入</SelectItem>
                {sourceOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title?.trim() || "未命名PPT"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">插入页码</Label>
            <Input
              value={effectivePageNumbersText}
              onChange={(event) => {
                setIsPageNumbersEdited(true);
                setPageNumbersText(event.target.value);
              }}
              placeholder="例如：2 或 2,5,8"
              className="h-9 text-xs"
            />
          </div>

          <div className="flex items-end gap-2 md:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full text-xs"
              disabled={!latestArtifactId || !flowContext?.selectedSourceId}
              onClick={() =>
                flowContext?.selectedSourceId
                  ? onRecommendPlacement(flowContext.selectedSourceId)
                  : undefined
              }
            >
              {isRecommendingPlacement ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  推荐中
                </>
              ) : (
                "推荐页"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-full bg-blue-600 px-4 text-xs hover:bg-blue-500"
              disabled={!latestArtifactId || !flowContext?.selectedSourceId}
              onClick={handleConfirm}
            >
              {isConfirmingPlacement ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  记录中
                </>
              ) : (
                "确认插入"
              )}
            </Button>
          </div>
        </div>

        {showPlacementDetails ? (
          <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">预设版位</Label>
                <Select
                  value={effectiveSlot}
                  onValueChange={(value) => {
                    setIsSlotEdited(true);
                    setSlot(value as AnimationPlacementSlot);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANIMATION_SLOT_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {recommendationState ? (
              <div className="rounded-xl border border-blue-200/70 bg-blue-50/70 px-3 py-2 text-[11px] text-blue-900">
                推荐第 {recommendationState.recommended_page ?? "-"} 页，
                {ANIMATION_SLOT_OPTIONS.find(
                  (item) => item.value === recommendationState.recommended_slot
                )?.label ??
                  recommendationState.recommended_slot ??
                  "-"}
                。
              </div>
            ) : null}

            {placementState.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-800">
                  已记录的插入关系
                </p>
                {placementState.map((item, index) => (
                  <div
                    key={`${item.ppt_artifact_id ?? "ppt"}-${item.page_number ?? index}-${item.slot ?? "slot"}`}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600"
                  >
                    已关联到 PPT {item.ppt_artifact_id?.slice(0, 8)}，第{" "}
                    {item.page_number ?? "-"} 页，版位{" "}
                    {ANIMATION_SLOT_OPTIONS.find(
                      (slotItem) => slotItem.value === item.slot
                    )?.label ??
                      item.slot ??
                      "-"}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
