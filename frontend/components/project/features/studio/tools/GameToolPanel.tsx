"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gamepad2, Lightbulb, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DraftResultWorkbenchShell } from "./DraftResultWorkbenchShell";
import type { ResolvedArtifactPayload, ToolPanelProps } from "./types";
import { PreviewStep } from "./game/PreviewStep";
import { parseGamePayload } from "./game/GameSurfaceAdapter";

const GAME_DIRECTION_TAGS = [
  "拖拽归类",
  "流程排序",
  "关系连线",
];

const GAME_PROMPT_HINTS = [
  "围绕一个明确知识点，做成 1 分钟内可完成的课堂小游戏。",
  "不要做成选择题页面，要让学生通过拖拽、排序或连线完成判断。",
  "偏向教师投屏操作，答错后给一句简洁反馈。",
];

function hasGameResultArtifact(
  artifact?: ResolvedArtifactPayload | null
): boolean {
  const parsed = parseGamePayload(artifact?.content);
  return Boolean(parsed.title && parsed.runtime.html);
}

export function GameToolPanel({
  toolName: _toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const existingDraft = flowContext?.currentDraft;
  const [promptText, setPromptText] = useState(
    typeof existingDraft?.topic === "string"
      ? existingDraft.topic
      : typeof existingDraft?.teaching_goal === "string"
        ? existingDraft.teaching_goal
        : ""
  );
  const [isGeneratingLocal, setIsGeneratingLocal] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [hasActivatedResultSurface, setHasActivatedResultSurface] =
    useState(false);
  const [stickyResolvedArtifact, setStickyResolvedArtifact] =
    useState<ResolvedArtifactPayload | null>(null);

  useEffect(() => {
    if (flowContext?.managedWorkbenchMode !== "draft") return;
    const nextPrompt =
      typeof flowContext?.currentDraft?.topic === "string"
        ? flowContext.currentDraft.topic
        : typeof flowContext?.currentDraft?.teaching_goal === "string"
          ? flowContext.currentDraft.teaching_goal
          : "";
    setPromptText((prev) => (prev === nextPrompt ? prev : nextPrompt));
  }, [flowContext?.currentDraft, flowContext?.managedWorkbenchMode]);

  useEffect(() => {
    const normalized = promptText.trim();
    onDraftChange?.({
      topic: normalized,
      teaching_goal: normalized,
      interaction_brief: normalized,
      classroom_constraints: "",
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [flowContext?.selectedSourceId, onDraftChange, promptText]);

  const sourceOptions = flowContext?.sourceOptions ?? [];
  const sourceLabel =
    (flowContext?.selectedSourceId &&
      sourceOptions.find((item) => item.id === flowContext.selectedSourceId)?.title) ||
    null;
  const isHistoryResultMode = flowContext?.managedWorkbenchMode === "history";
  const hasRenderableResult = hasGameResultArtifact(flowContext?.resolvedArtifact);
  const isGenerating =
    isGeneratingLocal ||
    flowContext?.isActionRunning ||
    flowContext?.workflowState === "executing" ||
    flowContext?.managedResultTarget?.status === "processing";

  useEffect(() => {
    if (!hasRenderableResult) return;
    if (!isHistoryResultMode && !hasActivatedResultSurface) return;
    setStickyResolvedArtifact((previous) =>
      previous?.artifactId === flowContext?.resolvedArtifact?.artifactId
        ? previous
        : (flowContext?.resolvedArtifact ?? null)
    );
  }, [
    flowContext?.resolvedArtifact,
    hasActivatedResultSurface,
    hasRenderableResult,
    isHistoryResultMode,
  ]);

  useEffect(() => {
    if (isGenerating || isHistoryResultMode) {
      setHasActivatedResultSurface(true);
    }
  }, [isGenerating, isHistoryResultMode]);

  useEffect(() => {
    const resolvedTarget = flowContext?.resolvedTarget;
    const enteringFreshDraft =
      flowContext?.managedWorkbenchMode === "draft" &&
      !isGenerating &&
      !hasRenderableResult &&
      !isHistoryResultMode &&
      !flowContext?.resolvedArtifact &&
      resolvedTarget?.kind === "draft" &&
      !resolvedTarget.artifactId &&
      !resolvedTarget.runId;
    if (!enteringFreshDraft) return;
    setHasActivatedResultSurface(false);
    setStickyResolvedArtifact(null);
  }, [
    flowContext?.managedWorkbenchMode,
    flowContext?.resolvedArtifact,
    flowContext?.resolvedTarget,
    flowContext?.resolvedTarget?.artifactId,
    flowContext?.resolvedTarget?.kind,
    flowContext?.resolvedTarget?.runId,
    hasRenderableResult,
    isGenerating,
    isHistoryResultMode,
  ]);

  const previewFlowContext = useMemo(() => {
    if (isHistoryResultMode && flowContext?.resolvedArtifact) return flowContext;
    if (hasRenderableResult && hasActivatedResultSurface) return flowContext;
    if (!stickyResolvedArtifact) return flowContext;
    return {
      ...flowContext,
      resolvedArtifact: stickyResolvedArtifact,
    };
  }, [
    flowContext,
    hasActivatedResultSurface,
    hasRenderableResult,
    isHistoryResultMode,
    stickyResolvedArtifact,
  ]);

  const previewHasRenderableResult = hasGameResultArtifact(
    previewFlowContext?.resolvedArtifact
  );
  const shouldShowResult = Boolean(
    isHistoryResultMode ||
      isGenerating ||
      (hasActivatedResultSurface && previewHasRenderableResult)
  );
  const shouldShowDraft = !shouldShowResult;

  const canGenerate = Boolean(
    promptText.trim() &&
      !isGenerating &&
      !flowContext?.isLoadingProtocol &&
      flowContext?.canExecute !== false
  );

  const handleGenerate = useCallback(async () => {
    if (!flowContext?.onExecute || !canGenerate) return;
    setIsGeneratingLocal(true);
    try {
      const executed = await flowContext.onExecute();
      if (executed) {
        setLastGeneratedAt(new Date().toISOString());
        setHasActivatedResultSurface(true);
      }
    } finally {
      setIsGeneratingLocal(false);
    }
  }, [canGenerate, flowContext]);

  useEffect(() => {
    const onGenerate = () => {
      void handleGenerate();
    };
    window.addEventListener("spectra:outline:generate", onGenerate);
    return () => {
      window.removeEventListener("spectra:outline:generate", onGenerate);
    };
  }, [handleGenerate]);

  const sourceSummary = sourceLabel
    ? `已绑定来源成果：${sourceLabel}`
    : "来源成果默认可选，不绑定也能直接生成。";

  return (
    <DraftResultWorkbenchShell
      showDraft={shouldShowDraft}
      showResult={shouldShowResult}
      bodyClassName={shouldShowResult ? "h-full min-h-0 overflow-hidden p-0" : undefined}
      draft={
        <section className="overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-[0_18px_48px_rgba(244,63,94,0.08)]">
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_320px]">
            <div className="min-w-0 rounded-[28px] border border-rose-100 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label
                    htmlFor="interactive-game-prompt"
                    className="text-sm font-semibold text-zinc-950"
                  >
                    互动游戏生成说明
                  </label>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    只写一次你的课堂目标和玩法想法，生成后再进入试玩面。
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50 p-2 text-rose-500">
                  <Gamepad2 className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-800">
                    一句话描述你要的小游戏
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {promptText.length} 字
                  </span>
                </div>
                <Textarea
                  id="interactive-game-prompt"
                  value={promptText}
                  onChange={(event) => setPromptText(event.target.value)}
                  placeholder="例如：围绕串联与并联，做一个投屏操作的关系连线小游戏，让学生把电路类型和对应特征连起来，1 分钟内完成，答错后给简短反馈。"
                  className="min-h-[280px] resize-none rounded-3xl border border-zinc-200 bg-zinc-50/30 px-4 py-4 text-sm leading-7 shadow-none"
                />
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-rose-700">
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span>插入建议</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {GAME_PROMPT_HINTS.map((hint) => (
                    <button
                      key={hint}
                      type="button"
                      onClick={() =>
                        setPromptText((prev) => {
                          const normalized = prev.trim();
                          if (!normalized) return hint;
                          if (normalized.includes(hint)) return prev;
                          return `${normalized}\n${hint}`;
                        })
                      }
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <section className="rounded-[28px] border border-rose-100 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-900">来源成果</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-rose-200 px-2.5 text-[11px] text-rose-700 hover:bg-rose-50"
                    onClick={() => void flowContext?.onLoadSources?.()}
                    disabled={flowContext?.isLoadingProtocol || flowContext?.isActionRunning}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    刷新
                  </Button>
                </div>
                {sourceOptions.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <Select
                      value={flowContext?.selectedSourceId ?? ""}
                      onValueChange={(value) =>
                        flowContext?.onSelectedSourceChange?.(value || null)
                      }
                    >
                      <SelectTrigger className="h-10 rounded-2xl border-zinc-200 bg-white text-xs">
                        <SelectValue placeholder="可选：绑定一个已有成果" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceOptions.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {(item.title || item.id.slice(0, 8)) +
                              (item.type ? ` (${item.type})` : "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-zinc-500">{sourceSummary}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-zinc-500">{sourceSummary}</p>
                )}
              </section>

              <section className="rounded-[28px] border border-rose-100 bg-rose-50/50 p-4">
                <p className="text-xs font-semibold text-zinc-900">固定玩法</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {GAME_DIRECTION_TAGS.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-700"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      }
      result={
        <PreviewStep
          lastGeneratedAt={lastGeneratedAt}
          flowContext={previewFlowContext}
        />
      }
    />
  );
}
