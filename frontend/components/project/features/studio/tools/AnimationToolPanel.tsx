"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Play, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TOOL_COLORS } from "../constants";
import type { ToolPanelProps } from "./types";
import {
  ANIMATION_RHYTHM_OPTIONS,
  ANIMATION_STYLE_PACK_OPTIONS,
  getReadinessLabel,
  resolveDefaultExplainerStylePack,
} from "./animation/constants";
import { PreviewStep } from "./animation/PreviewStep";
import type {
  AnimationPlacementSlot,
  AnimationOutputFormat,
  AnimationRhythm,
  AnimationStylePack,
  AnimationVisualType,
} from "./animation/types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";

const FOCUS_PRESETS = [
  "突出关键步骤变化",
  "强调因果关系",
  "先讲结论再拆过程",
  "适合课堂演示节奏",
];

function normalizeDraftString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeDraftNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRhythm(value: unknown): AnimationRhythm {
  return value === "slow" || value === "balanced" || value === "fast"
    ? value
    : "balanced";
}

function normalizeFormat(value: unknown): AnimationOutputFormat {
  // Hard-disable expensive cloud video path (mp4/cloud_video_wan).
  if (value === "gif") return "gif";
  return "html5";
}

function normalizeInitialFormat(_value: unknown): AnimationOutputFormat {
  // Hard-cut default path is html5; stale persisted gif drafts should not hijack
  // new generation runs unless the user re-selects gif explicitly.
  return "html5";
}

function normalizeStylePack(value: unknown): AnimationStylePack {
  return value === "teaching_ppt_cartoon" ||
    value === "teaching_ppt_fresh_green" ||
    value === "teaching_ppt_deep_blue" ||
    value === "teaching_ppt_warm_orange" ||
    value === "teaching_ppt_minimal_gray"
    ? value
    : resolveDefaultExplainerStylePack();
}

function normalizeVisualType(value: unknown): AnimationVisualType | null {
  return value === "process_flow" ||
    value === "relationship_change" ||
    value === "structure_breakdown"
    ? value
    : null;
}

export function AnimationToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const existingDraft = flowContext?.currentDraft;
  const [topic, setTopic] = useState(normalizeDraftString(existingDraft?.topic));
  const [focus, setFocus] = useState(
    normalizeDraftString(existingDraft?.motion_brief)
  );
  const [durationSeconds, setDurationSeconds] = useState(
    normalizeDraftNumber(existingDraft?.duration_seconds, 6)
  );
  const [rhythm, setRhythm] = useState<AnimationRhythm>(
    normalizeRhythm(existingDraft?.rhythm)
  );
  const [animationFormat, setAnimationFormat] = useState<AnimationOutputFormat>(
    normalizeInitialFormat(existingDraft?.animation_format)
  );
  const [hasManualFormatSelection, setHasManualFormatSelection] = useState(false);
  const [stylePack, setStylePack] = useState<AnimationStylePack>(
    normalizeStylePack(existingDraft?.style_pack)
  );
  const [visualType, setVisualType] = useState<AnimationVisualType | null>(
    normalizeVisualType(existingDraft?.visual_type)
  );
  const [hasBootstrappedTopic, setHasBootstrappedTopic] = useState(false);
  const [isGeneratingLocal, setIsGeneratingLocal] = useState(false);
  const [isPreparingSpec, setIsPreparingSpec] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isRecommendingPlacement, setIsRecommendingPlacement] = useState(false);
  const [isConfirmingPlacement, setIsConfirmingPlacement] = useState(false);
  const [hasRequestedGeneration, setHasRequestedGeneration] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [placementRecommendation, setPlacementRecommendation] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [placementRecords, setPlacementRecords] = useState<
    Record<string, unknown>[]
  >([]);
  const [serverSpecPreview, setServerSpecPreview] = useState<Record<
    string,
    unknown
  > | null>(null);
  const latestArtifactId = flowContext?.latestArtifacts?.[0]?.artifactId ?? null;
  const sourceLabel =
    (flowContext?.selectedSourceId &&
      (flowContext?.sourceOptions ?? []).find(
        (item) => item.id === flowContext.selectedSourceId
      )?.title) ||
    null;

  const { suggestions, isLoading } = useStudioRagRecommendations({
    query: "为当前项目推荐适合做成教学动画的知识点、动态过程和重点变化。",
    fallbackSuggestions: ["概念形成过程", "变量变化关系", "关键步骤演示"],
  });

  useEffect(() => {
    if (!hasBootstrappedTopic && !topic.trim() && suggestions[0]) {
      setTopic(suggestions[0]);
      setHasBootstrappedTopic(true);
    }
  }, [hasBootstrappedTopic, suggestions, topic]);

  useEffect(() => {
    if (flowContext?.managedWorkbenchMode !== "draft") return;
    const draft = flowContext.currentDraft;
    if (!draft) return;

    const nextTopic = normalizeDraftString(draft.topic);
    const nextFocus = normalizeDraftString(draft.motion_brief);
    const nextDuration = normalizeDraftNumber(draft.duration_seconds, 6);
    const nextRhythm = normalizeRhythm(draft.rhythm);
    const nextFormat = normalizeFormat(draft.animation_format);
    const resolvedFormat =
      !hasManualFormatSelection && !latestArtifactId ? "html5" : nextFormat;
    const nextStylePack = normalizeStylePack(draft.style_pack);
    const nextVisualType = normalizeVisualType(draft.visual_type);

    setTopic((prev) => (prev === nextTopic ? prev : nextTopic));
    setFocus((prev) => (prev === nextFocus ? prev : nextFocus));
    setDurationSeconds((prev) => (prev === nextDuration ? prev : nextDuration));
    setRhythm((prev) => (prev === nextRhythm ? prev : nextRhythm));
    setAnimationFormat((prev) => (prev === resolvedFormat ? prev : resolvedFormat));
    setStylePack((prev) => (prev === nextStylePack ? prev : nextStylePack));
    setVisualType((prev) => (prev === nextVisualType ? prev : nextVisualType));
  }, [
    flowContext?.currentDraft,
    flowContext?.managedWorkbenchMode,
    hasManualFormatSelection,
    latestArtifactId,
  ]);

  useEffect(() => {
    const safeAnimationFormat = animationFormat === "gif" ? "gif" : "html5";
    onDraftChange?.({
      topic,
      motion_brief: focus,
      duration_seconds: durationSeconds,
      animation_format: safeAnimationFormat,
      render_mode: safeAnimationFormat,
      rhythm,
      style_pack: stylePack,
      visual_type: visualType,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    animationFormat,
    durationSeconds,
    flowContext?.selectedSourceId,
    focus,
    onDraftChange,
    rhythm,
    stylePack,
    topic,
    visualType,
  ]);

  useEffect(() => {
    setPlacementRecommendation(null);
    setPlacementRecords([]);
  }, [latestArtifactId]);

  const isHistoryResultMode = flowContext?.managedWorkbenchMode === "history";
  const resultTargetStatus = flowContext?.managedResultTarget?.status ?? null;
  const isGeneratingFromStatus = resultTargetStatus === "processing";
  const isGenerating = Boolean(
    isGeneratingLocal ||
      isPreparingSpec ||
      isGeneratingFromStatus ||
      flowContext?.isActionRunning
  );
  const shouldShowPreview =
    isHistoryResultMode || hasRequestedGeneration || isGenerating;
  const shouldShowComposeCard = !shouldShowPreview;

  useEffect(() => {
    if (flowContext?.managedWorkbenchMode !== "draft" || isGenerating) return;
    setHasRequestedGeneration(false);
  }, [flowContext?.managedWorkbenchMode, isGenerating]);

  useEffect(() => {
    if (flowContext?.managedWorkbenchMode !== "draft") {
      setHasManualFormatSelection(false);
    }
  }, [flowContext?.managedWorkbenchMode]);

  const prepareSpecPreview = async () => {
    if (!flowContext?.onPreviewExecution) return;
    setIsPreparingSpec(true);
    try {
      const executionPreview = await flowContext.onPreviewExecution();
      if (!executionPreview) return;
      const previewSpec =
        typeof executionPreview.spec_preview === "object" &&
        executionPreview.spec_preview
          ? (executionPreview.spec_preview as Record<string, unknown>)
          : null;
      setServerSpecPreview(previewSpec);

      if (!visualType && previewSpec?.visual_type) {
        const nextVisualType = String(previewSpec.visual_type);
        if (
          nextVisualType === "process_flow" ||
          nextVisualType === "relationship_change" ||
          nextVisualType === "structure_breakdown"
        ) {
          setVisualType(nextVisualType);
        }
      }
    } finally {
      setIsPreparingSpec(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim() || isGenerating) return;

    await prepareSpecPreview();

    if (flowContext?.onPrepareGenerate) {
      const prepared = await flowContext.onPrepareGenerate();
      if (!prepared) return;
    }

    setHasRequestedGeneration(true);

    if (!flowContext?.onExecute) {
      setLastGeneratedAt(new Date().toISOString());
      return;
    }

    setIsGeneratingLocal(true);
    try {
      const executed = await flowContext.onExecute();
      if (executed) {
        setLastGeneratedAt(new Date().toISOString());
      }
    } finally {
      setIsGeneratingLocal(false);
    }
  };

  const handleStructuredRefine = async () => {
    if (!latestArtifactId || !flowContext?.onStructuredRefine) return;
    setIsRefining(true);
    try {
      const ok = await flowContext.onStructuredRefine({
        artifactId: latestArtifactId,
        message:
          animationFormat === "gif"
            ? "请根据新的参数生成一版新的 GIF 动画"
            : "请根据新的参数生成一版新的 HTML runtime 动画",
        config: {
          duration_seconds: durationSeconds,
          rhythm,
          style_pack: stylePack,
          focus,
          visual_type: visualType,
        },
      });
      if (ok) {
        setLastGeneratedAt(new Date().toISOString());
      }
    } finally {
      setIsRefining(false);
    }
  };

  const handleRecommendPlacement = async (pptArtifactId: string) => {
    if (!latestArtifactId || !flowContext?.onRecommendAnimationPlacement)
      return;
    setIsRecommendingPlacement(true);
    try {
      const payload = await flowContext.onRecommendAnimationPlacement({
        artifactId: latestArtifactId,
        pptArtifactId,
      });
      setPlacementRecommendation(payload ?? null);
    } finally {
      setIsRecommendingPlacement(false);
    }
  };

  const handleConfirmPlacement = async (
    pptArtifactId: string,
    pageNumbers: number[],
    slot: AnimationPlacementSlot
  ) => {
    if (!latestArtifactId || !flowContext?.onConfirmAnimationPlacement) return;
    setIsConfirmingPlacement(true);
    try {
      const payload = await flowContext.onConfirmAnimationPlacement({
        artifactId: latestArtifactId,
        pptArtifactId,
        pageNumbers,
        slot,
      });
      if (Array.isArray(payload?.placements)) {
        setPlacementRecords(
          payload.placements.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object"
          )
        );
      }
    } finally {
      setIsConfirmingPlacement(false);
    }
  };

  const appendFocusPreset = (value: string) => {
    setFocus((previous) => {
      const trimmed = previous.trim();
      if (!trimmed) return value;
      if (trimmed.includes(value)) return previous;
      return `${trimmed}；${value}`;
    });
  };

  const colors = TOOL_COLORS.animation;
  const actionLabels = flowContext?.display?.actionLabels ?? {
    execute: "生成演示动画",
  };
  const canGenerate =
    !isGenerating &&
    topic.trim().length > 0 &&
    !flowContext?.isLoadingProtocol &&
    flowContext?.canExecute !== false;

  return (
    <div
      className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/80 shadow-2xl shadow-zinc-200/30 backdrop-blur-xl group/workbench"
      style={{
        ["--project-tool-accent" as never]: colors.primary,
        ["--project-tool-accent-soft" as never]: colors.glow,
        ["--project-tool-surface" as never]: colors.soft,
      }}
    >
      <div className={cn("h-1 w-full bg-gradient-to-r", colors.gradient)} />

      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-100/80 bg-zinc-50/30 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-zinc-100 bg-white p-2 shadow-sm transition-transform duration-500 group-hover/workbench:scale-110">
                <Play className="h-5 w-5" style={{ color: colors.primary }} />
              </div>
              <div>
                <h3 className="text-sm font-black tracking-tight text-zinc-900">
                  {toolName}工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  先明确教学演示目标，再一键生成可继续 refine 与 placement 的动画成果。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-zinc-100 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600 shadow-sm">
                {getReadinessLabel(flowContext?.readiness)}
              </span>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
                disabled={!canGenerate}
                onClick={() => void handleGenerate()}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    正在生成动画...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {actionLabels.execute}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {shouldShowComposeCard ? (
            <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-zinc-900">
                      生成一段教学演示动画
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      先写清教学目标和表现重点，系统会生成 storyboard 并进入结果工作面。
                    </p>
                  </div>
                  {sourceLabel ? (
                    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">已绑定：{sourceLabel}</span>
                    </div>
                  ) : (
                    <div className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-500 shadow-sm">
                      未绑定 PPT：可先生成动画，后续再做 placement
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-zinc-700">
                    教学主题
                  </Label>
                  <Textarea
                    value={topic}
                    onChange={(event) => {
                      setHasBootstrappedTopic(true);
                      setTopic(event.target.value);
                    }}
                    placeholder="例如：演示冒泡排序中比较与交换的全过程，重点让学生理解每轮后最大值如何归位。"
                    className="min-h-[120px] resize-y rounded-xl border-zinc-200 bg-white text-sm shadow-none"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {(isLoading ? [] : suggestions).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        onClick={() => {
                          setHasBootstrappedTopic(true);
                          setTopic(item);
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Label className="text-xs font-medium text-zinc-700">
                      表现重点
                    </Label>
                    <span className="text-[11px] text-zinc-400">可选</span>
                  </div>
                  <Textarea
                    value={focus}
                    onChange={(event) => setFocus(event.target.value)}
                    placeholder="例如：突出关键对比步骤，不要平均展示所有镜头。"
                    className="min-h-[96px] resize-none rounded-xl border-zinc-200 bg-white text-sm shadow-none"
                  />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {FOCUS_PRESETS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        onClick={() => appendFocusPreset(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-zinc-700">
                      输出格式
                    </Label>
                    <Select
                      value={animationFormat}
                      onValueChange={(value) =>
                        {
                          setHasManualFormatSelection(true);
                          setAnimationFormat(value as AnimationOutputFormat);
                        }
                      }
                    >
                      <SelectTrigger className="h-9 rounded-xl border-zinc-200 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="html5">HTML（本地 runtime 导出）</SelectItem>
                        <SelectItem value="gif">GIF（支持后续 placement）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-zinc-700">
                      动画节奏
                    </Label>
                    <Select
                      value={rhythm}
                      onValueChange={(value) =>
                        setRhythm(value as AnimationRhythm)
                      }
                    >
                      <SelectTrigger className="h-9 rounded-xl border-zinc-200 text-xs">
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
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-zinc-700">
                      视觉风格
                    </Label>
                    <Select
                      value={stylePack}
                      onValueChange={(value) =>
                        setStylePack(value as AnimationStylePack)
                      }
                    >
                      <SelectTrigger className="h-9 rounded-xl border-zinc-200 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ANIMATION_STYLE_PACK_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {shouldShowPreview ? (
            <PreviewStep
              lastGeneratedAt={lastGeneratedAt}
              durationSeconds={durationSeconds}
              rhythm={rhythm}
              stylePack={stylePack}
              visualType={visualType}
              focus={focus}
              serverSpecPreview={serverSpecPreview}
              flowContext={flowContext}
              recommendation={placementRecommendation}
              placements={placementRecords}
              isRefining={isRefining}
              isRecommendingPlacement={isRecommendingPlacement}
              isConfirmingPlacement={isConfirmingPlacement}
              onDurationChange={setDurationSeconds}
              onRhythmChange={setRhythm}
              onStylePackChange={setStylePack}
              onVisualTypeChange={setVisualType}
              onFocusChange={setFocus}
              onRefine={() => {
                if (latestArtifactId) {
                  void handleStructuredRefine();
                }
              }}
              onRecommendPlacement={(pptArtifactId) => {
                void handleRecommendPlacement(pptArtifactId);
              }}
              onConfirmPlacement={(pptArtifactId, pageNumbers, slot) => {
                void handleConfirmPlacement(pptArtifactId, pageNumbers, slot);
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
