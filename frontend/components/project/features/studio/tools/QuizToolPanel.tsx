"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Lightbulb,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DraftResultWorkbenchShell } from "./DraftResultWorkbenchShell";
import type { ToolPanelProps } from "./types";
import {
  DIFFICULTY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
  STYLE_TAGS,
} from "./quiz/constants";
import { PreviewStep } from "./quiz/PreviewStep";
import type {
  QuizDifficulty,
  QuizQuestionType,
  QuizSurfaceMode,
} from "./quiz/types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";
import type { ResolvedArtifactPayload } from "./types";

function clampNumber(
  value: string,
  min: number,
  max: number,
  fallback: number
): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function hasQuizResult(flowContext?: ToolPanelProps["flowContext"]): boolean {
  const artifact = flowContext?.resolvedArtifact;
  return hasQuizResultArtifact(artifact);
}

function hasQuizResultArtifact(
  artifact?: ResolvedArtifactPayload | null
): boolean {
  if (!artifact || artifact.contentKind !== "json") return false;
  const content =
    artifact.content && typeof artifact.content === "object"
      ? (artifact.content as Record<string, unknown>)
      : null;
  const questions = Array.isArray(content?.questions) ? content.questions : [];
  return questions.length > 0;
}

export function QuizToolPanel({
  toolName: _toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const existingDraft = flowContext?.currentDraft;
  const initialScope =
    typeof existingDraft?.scope === "string"
      ? existingDraft.scope
      : typeof existingDraft?.question_focus === "string"
        ? existingDraft.question_focus
        : "";
  const [scope, setScope] = useState(initialScope);
  const [countInput, setCountInput] = useState(
    typeof existingDraft?.question_count === "number"
      ? String(existingDraft.question_count)
      : typeof existingDraft?.count === "number"
        ? String(existingDraft.count)
        : "5"
  );
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(
    typeof existingDraft?.difficulty === "string"
      ? (existingDraft.difficulty as QuizDifficulty)
      : "medium"
  );
  const [questionType, setQuestionType] = useState<QuizQuestionType>(
    typeof existingDraft?.question_type === "string"
      ? (existingDraft.question_type as QuizQuestionType)
      : "single"
  );
  const [styleTags, setStyleTags] = useState<string[]>(
    Array.isArray(existingDraft?.style_tags)
      ? existingDraft.style_tags.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : []
  );
  const [isGeneratingLocal, setIsGeneratingLocal] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [surfaceMode, setSurfaceMode] = useState<QuizSurfaceMode>("browse");
  const [hasActivatedResultSurface, setHasActivatedResultSurface] = useState(false);
  const [stickyResolvedArtifact, setStickyResolvedArtifact] =
    useState<ResolvedArtifactPayload | null>(null);

  const { suggestions, isLoading } = useStudioRagRecommendations({
    surface: "studio_quiz",
    seedText: scope,
  });

  useEffect(() => {
    if (flowContext?.managedWorkbenchMode !== "draft") return;
    const nextScope =
      typeof flowContext?.currentDraft?.scope === "string"
        ? flowContext.currentDraft.scope
        : typeof flowContext?.currentDraft?.question_focus === "string"
          ? flowContext.currentDraft.question_focus
          : "";
    setScope((prev) => (prev === nextScope ? prev : nextScope));
    const nextCount =
      typeof flowContext?.currentDraft?.question_count === "number"
        ? String(flowContext.currentDraft.question_count)
        : typeof flowContext?.currentDraft?.count === "number"
          ? String(flowContext.currentDraft.count)
          : "5";
    setCountInput((prev) => (prev === nextCount ? prev : nextCount));
    const nextDifficulty =
      typeof flowContext?.currentDraft?.difficulty === "string"
        ? (flowContext.currentDraft.difficulty as QuizDifficulty)
        : "medium";
    setDifficulty((prev) => (prev === nextDifficulty ? prev : nextDifficulty));
    const nextQuestionType =
      typeof flowContext?.currentDraft?.question_type === "string"
        ? (flowContext.currentDraft.question_type as QuizQuestionType)
        : "single";
    setQuestionType((prev) => (prev === nextQuestionType ? prev : nextQuestionType));
    const nextStyleTags = Array.isArray(flowContext?.currentDraft?.style_tags)
      ? flowContext.currentDraft.style_tags.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0
        )
      : [];
    setStyleTags((prev) =>
      prev.length === nextStyleTags.length &&
      prev.every((item, index) => item === nextStyleTags[index])
        ? prev
        : nextStyleTags
    );
  }, [flowContext?.currentDraft, flowContext?.managedWorkbenchMode]);

  const count = useMemo(() => clampNumber(countInput, 1, 20, 5), [countInput]);
  const sourceOptions = flowContext?.sourceOptions ?? [];
  const sourceLabel =
    (flowContext?.selectedSourceId &&
      sourceOptions.find((item) => item.id === flowContext.selectedSourceId)?.title) ||
    null;
  const isHistoryResultMode = flowContext?.managedWorkbenchMode === "history";
  const hasRenderableResult = hasQuizResult(flowContext);
  const isGenerating =
    isGeneratingLocal ||
    flowContext?.isActionRunning ||
    flowContext?.workflowState === "executing" ||
    flowContext?.managedResultTarget?.status === "processing";
  useEffect(() => {
    if (hasRenderableResult || isGenerating || isHistoryResultMode) {
      setHasActivatedResultSurface(true);
    }
  }, [hasRenderableResult, isGenerating, isHistoryResultMode]);

  useEffect(() => {
    const resolvedArtifact = flowContext?.resolvedArtifact;
    if (!resolvedArtifact) return;
    if (!hasQuizResultArtifact(resolvedArtifact)) return;
    setStickyResolvedArtifact((previous) =>
      previous?.artifactId === resolvedArtifact.artifactId ? previous : resolvedArtifact
    );
  }, [flowContext?.resolvedArtifact]);

  const shouldShowResult = Boolean(
    isHistoryResultMode ||
      hasRenderableResult ||
      isGenerating ||
      hasActivatedResultSurface
  );
  const shouldShowDraft = !shouldShowResult;
  const canGenerate = Boolean(
    scope.trim() &&
      !isGenerating &&
      !flowContext?.isLoadingProtocol &&
      flowContext?.canExecute !== false &&
      (!flowContext?.requiresSourceArtifact || flowContext?.selectedSourceId)
  );

  useEffect(() => {
    onDraftChange?.({
      scope,
      question_focus: scope,
      count,
      question_count: count,
      difficulty,
      question_type: questionType,
      style_tags: styleTags,
      humorous_distractors: styleTags.includes("加入幽默干扰项"),
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    count,
    difficulty,
    flowContext?.selectedSourceId,
    onDraftChange,
    questionType,
    scope,
    styleTags,
  ]);

  useEffect(() => {
    if (!shouldShowResult) {
      setSurfaceMode("browse");
    }
  }, [shouldShowResult]);

  const previewFlowContext = useMemo(() => {
    if (!stickyResolvedArtifact) return flowContext;
    if (hasRenderableResult || flowContext?.resolvedArtifact) return flowContext;
    return {
      ...flowContext,
      resolvedArtifact: stickyResolvedArtifact,
    };
  }, [flowContext, hasRenderableResult, stickyResolvedArtifact]);

  const handleToggleTag = (tag: string) => {
    setStyleTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (flowContext?.onPrepareGenerate) {
      const prepared = await flowContext.onPrepareGenerate();
      if (!prepared) return;
    }
    if (!flowContext?.onExecute) return;

    setIsGeneratingLocal(true);
    try {
      const executed = await flowContext.onExecute();
      if (!executed) return;
      setLastGeneratedAt(new Date().toISOString());
      setSurfaceMode("browse");
    } finally {
      setIsGeneratingLocal(false);
    }
  };

  useEffect(() => {
    const onGenerate = () => {
      void handleGenerate();
    };
    const onSetMode = (event: Event) => {
      const customEvent = event as CustomEvent<{ mode?: QuizSurfaceMode }>;
      const nextMode = customEvent.detail?.mode;
      if (nextMode === "browse" || nextMode === "edit") {
        setSurfaceMode(nextMode);
      }
    };

    window.addEventListener("spectra:quiz:generate", onGenerate);
    window.addEventListener("spectra:quiz:set-mode", onSetMode as EventListener);
    return () => {
      window.removeEventListener("spectra:quiz:generate", onGenerate);
      window.removeEventListener("spectra:quiz:set-mode", onSetMode as EventListener);
    };
  }, [canGenerate, flowContext, handleGenerate]);

  const insertScopeHint = (hint: string) => {
    setScope((prev) => {
      const normalized = prev.trim();
      if (!normalized) return hint;
      if (normalized.includes(hint)) return prev;
      return `${normalized}\n${hint}`;
    });
  };

  return (
    <DraftResultWorkbenchShell
      showDraft={shouldShowDraft}
      showResult={shouldShowResult}
      bodyClassName={shouldShowResult ? "h-full min-h-0 overflow-hidden p-0" : undefined}
      draft={
        <section className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-[0_18px_48px_rgba(139,92,246,0.08)]">
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_320px]">
            <div className="min-w-0 rounded-[28px] border border-violet-100 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label
                    htmlFor="quiz-scope"
                    className="text-sm font-semibold text-zinc-950"
                  >
                    考查范围 / 出题主题
                  </label>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    先写出这次小测想覆盖的知识点、题感和课堂目标。
                  </p>
                </div>
                {isLoading ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-violet-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    推荐中
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-400">{scope.length} 字</span>
                )}
              </div>
              <Textarea
                id="quiz-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                placeholder="例如：围绕牛顿第二定律，重点考概念辨析、受力分析里的易错点，并补一题迁移应用。"
                className="mt-4 min-h-[260px] resize-none rounded-3xl border border-zinc-200 bg-zinc-50/30 px-4 py-4 text-sm leading-7 shadow-none focus-visible:border-violet-300 focus-visible:ring-[3px] focus-visible:ring-violet-100"
              />
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-violet-700">
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span>插入建议</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 4).map((hint) => (
                    <button
                      key={hint}
                      type="button"
                      onClick={() => insertScopeHint(hint)}
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-medium text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-100"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <section className="rounded-[28px] border border-violet-100 bg-zinc-50/60 p-4">
                <p className="text-xs font-semibold text-zinc-900">轻配置</p>
                <div className="mt-4 grid gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-zinc-500">题量</label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={countInput}
                      onChange={(event) => setCountInput(event.target.value)}
                      className="h-10 border-zinc-200 bg-white text-xs focus-visible:ring-violet-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-zinc-500">难度</label>
                    <Select
                      value={difficulty}
                      onValueChange={(value) => setDifficulty(value as QuizDifficulty)}
                    >
                      <SelectTrigger className="h-10 border-zinc-200 bg-white text-xs focus:ring-violet-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIFFICULTY_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-zinc-500">题型</label>
                    <Select
                      value={questionType}
                      onValueChange={(value) =>
                        setQuestionType(value as QuizQuestionType)
                      }
                    >
                      <SelectTrigger className="h-10 border-zinc-200 bg-white text-xs focus:ring-violet-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_TYPE_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-violet-100 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-900">题目风格</p>
                  {styleTags.length > 0 ? (
                    <span className="text-[11px] font-medium text-violet-600">
                      {styleTags.length} 项已选
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STYLE_TAGS.map((tag) => {
                    const selected = styleTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className={[
                          "rounded-full border px-3 py-1.5 text-[11px] transition-colors",
                          selected
                            ? "border-violet-500 bg-violet-50 text-violet-700"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-violet-200 hover:bg-violet-50/60",
                        ].join(" ")}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[28px] border border-violet-100 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-900">来源成果</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-violet-200 px-2.5 text-[11px] text-violet-700 hover:bg-violet-50"
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
                      <SelectTrigger className="h-10 border-zinc-200 bg-white text-xs focus:ring-violet-100">
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
                    <p className="text-[11px] text-zinc-500">
                      {sourceLabel ? `当前已绑定：${sourceLabel}` : "不绑定也可以直接生成。"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-zinc-500">
                    当前没有可绑定成果，仍可直接生成。
                  </p>
                )}
              </section>
            </div>
          </div>
        </section>
      }
      result={
        <PreviewStep
          lastGeneratedAt={lastGeneratedAt}
          flowContext={previewFlowContext}
          surfaceMode={surfaceMode}
        />
      }
    />
  );
}
