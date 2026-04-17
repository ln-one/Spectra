import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Clapperboard,
  Download,
  Loader2,
  RotateCcw,
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
  const resolvedMediaArtifactId =
    capabilityStatus === "backend_ready" &&
    flowContext?.resolvedArtifact?.contentKind === "media"
      ? (flowContext?.resolvedArtifact?.artifactId ?? null)
      : null;
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
  const [replayToken, setReplayToken] = useState(0);
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
  const mediaUrl = useMemo(() => {
    if (!mediaBlob || !resolvedMediaArtifactId) {
      return null;
    }
    return URL.createObjectURL(mediaBlob);
  }, [mediaBlob, resolvedMediaArtifactId]);

  useEffect(() => {
    return () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
    };
  }, [mediaUrl]);

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
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">GIF 动画预览</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {lastGeneratedAt
                ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                : "这里只展示后端按动画规格渲染的真实 GIF。"}
            </p>
          </div>
          {latestArtifactId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                void flowContext?.onExportArtifact?.(latestArtifactId)
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              下载 GIF
            </Button>
          ) : null}
        </div>

        {mediaUrl ? (
          <div className="relative mt-4 h-[420px] overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <Image
              src={`${mediaUrl}#replay-${replayToken}`}
              alt="教学动画 GIF 预览"
              key={`gif-${replayToken}`}
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <Clapperboard className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              暂未收到后端真实动画
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              当前阶段只展示独立 GIF 产物，不再渲染 HTML 或 MP4 预览。
            </p>
          </div>
        )}
        {mediaUrl ? (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setReplayToken((value) => value + 1)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              再次播放
            </Button>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-800">结果 refine</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              当前阶段至少支持调整时长、节奏和表现重点。refine
              只更新动画本体，不自动回写已插入的 PPT 页面。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
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
                生成新版 GIF
              </>
            )}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                <p className="font-medium">时长建议</p>
                <p className="mt-1">
                  当前分镜 {sceneCount ?? "-"} 个。
                  {minimumDurationSeconds
                    ? ` 至少 ${Math.round(minimumDurationSeconds)} 秒`
                    : ""}
                  ，推荐 {Math.round(recommendedDurationSeconds)} 秒。
                </p>
                {durationWarning ? (
                  <p className="mt-1">{durationWarning}</p>
                ) : null}
                {durationSeconds !== Math.round(recommendedDurationSeconds) ? (
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
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
            <p className="text-[11px] text-zinc-500">
              当前 refine 模板：{getVisualTypeLabel(visualType)}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Label className="text-xs text-zinc-600">表现重点</Label>
          <Textarea
            value={focus}
            onChange={(event) => onFocusChange(event.target.value)}
            placeholder="例如：突出因果链路，不要平均展示所有步骤。"
            className="mt-2 min-h-[96px] resize-none text-xs"
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-800">插入 PPT</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              动画先作为独立 artifact
              保留。你可以选择不插入，也可以插入推荐页或自选页，并使用预设版位。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void flowContext?.onLoadSources?.()}
          >
            刷新 PPT 列表
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label className="text-xs text-zinc-600">插入页码</Label>
            <Input
              value={effectivePageNumbersText}
              onChange={(event) => {
                setIsPageNumbersEdited(true);
                setPageNumbersText(event.target.value);
              }}
              placeholder="例如：2 或 2,5,8"
              className="mt-2 h-9 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs"
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
              "推荐 1 页"
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
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

        {recommendationState ? (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-800">
            <p className="font-medium">系统推荐</p>
            <p className="mt-1">
              推荐插入第 {recommendationState.recommended_page ?? "-"}{" "}
              页，版位为
              {ANIMATION_SLOT_OPTIONS.find(
                (item) => item.value === recommendationState.recommended_slot
              )?.label ??
                recommendationState.recommended_slot ??
                "-"}
              。
            </p>
          </div>
        ) : null}

        {placementState.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-800">
              已记录的插入关系
            </p>
            {placementState.map((item, index) => (
              <div
                key={`${item.ppt_artifact_id ?? "ppt"}-${item.page_number ?? index}-${item.slot ?? "slot"}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600"
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
      </section>
    </div>
  );
}
