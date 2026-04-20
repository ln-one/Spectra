"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Textarea } from "@/components/ui/textarea";
import { previewApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { useProjectStore } from "@/stores/projectStore";
import { CheckCircle2, Lightbulb, ListChecks } from "lucide-react";
import { DraftResultWorkbenchShell } from "./DraftResultWorkbenchShell";
import type { ToolPanelProps } from "./types";
import { PreviewStep } from "./word/PreviewStep";

const DEFAULT_DETAIL_LEVEL = "standard";
const PROMPT_QUICK_INSERTS = [
  "按模块化教学流程编排，给出每个环节时长与目标。",
  "增加形成性评价与总结性评价，并给出可执行评分维度。",
  "加入分层任务（基础/进阶），照顾不同学习水平。",
  "给出课堂活动与教师/学生活动对应产出。",
  "适当使用二级、三级标题与列表，保证可读性。",
];
const PROMPT_QUALITY_CHECKLIST = [
  "教学定位与学情分析",
  "分层目标（可观察、可评估）",
  "教学流程（教师活动/学生活动/产出）",
  "评价与拓展（形成性 + 总结性）",
  "作业与课后延伸",
];

export function WordToolPanel({
  toolName: _toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const existingDraft = flowContext?.currentDraft;
  const initialPrompt =
    typeof existingDraft?.output_requirements === "string"
      ? existingDraft.output_requirements
      : "";
  const { activeSessionId } = useProjectStore(
    useShallow((state) => ({
      activeSessionId: state.activeSessionId,
    }))
  );
  const [promptText, setPromptText] = useState(initialPrompt);
  const [isGeneratingLocal, setIsGeneratingLocal] = useState(false);
  const [backendMarkdown, setBackendMarkdown] = useState("");
  const [isBackendPreviewLoading, setIsBackendPreviewLoading] = useState(false);
  const [backendPreviewError, setBackendPreviewError] = useState<string | null>(
    null
  );

  const primarySourceId = flowContext?.selectedSourceId ?? null;
  const selectedSourceIds = useMemo(
    () => (primarySourceId ? [primarySourceId] : []),
    [primarySourceId]
  );
  const sourceLabel =
    (primarySourceId &&
      (flowContext?.sourceOptions ?? []).find(
        (item) => item.id === primarySourceId
      )?.title) ||
    null;
  const latestArtifact = flowContext?.latestArtifacts?.[0];
  const previewArtifactId =
    flowContext?.resolvedArtifact?.artifactId ?? latestArtifact?.artifactId;
  const previewRunId = latestArtifact?.runId ?? null;
  const previewSessionId =
    flowContext?.wordResultTarget?.sessionId ?? activeSessionId ?? null;
  const isHistoryResultMode = flowContext?.wordWorkbenchMode === "history";
  const resultTargetStatus = flowContext?.wordResultTarget?.status ?? null;
  const hasPreviewArtifact = Boolean(previewArtifactId);
  const isGenerating = Boolean(
    isGeneratingLocal ||
      (resultTargetStatus === "processing" && !hasPreviewArtifact) ||
      flowContext?.isActionRunning
  );
  const shouldShowPreview = Boolean(isHistoryResultMode || isGenerating);
  const shouldShowComposeCard = !shouldShowPreview;
  const hasGenerationAnchor = Boolean(primarySourceId || promptText.trim());

  useEffect(() => {
    if (flowContext?.wordWorkbenchMode !== "draft") return;
    const nextPrompt =
      typeof flowContext?.currentDraft?.output_requirements === "string"
        ? flowContext.currentDraft.output_requirements
        : "";
    setPromptText((prev) => (prev === nextPrompt ? prev : nextPrompt));
  }, [flowContext?.currentDraft]);

  useEffect(() => {
    if (flowContext?.wordWorkbenchMode !== "draft" || isGenerating) return;
    setBackendMarkdown("");
    setBackendPreviewError(null);
  }, [flowContext?.wordWorkbenchMode, isGenerating]);

  useEffect(() => {
    onDraftChange?.({
      kind: "teaching_document",
      schema_id: "lesson_plan_v1",
      schema_version: 1,
      preset: "lesson_plan",
      detail_level: DEFAULT_DETAIL_LEVEL,
      topic: "",
      learning_goal: "",
      output_requirements: promptText,
      primary_source_id: primarySourceId,
      selected_source_ids: selectedSourceIds,
      document_variant: "layered_lesson_plan",
      source_artifact_id: primarySourceId,
    });
  }, [onDraftChange, primarySourceId, promptText, selectedSourceIds]);

  useEffect(() => {
    if (!shouldShowPreview) return;
    if (!previewSessionId) return;
    if (flowContext?.capabilityStatus !== "backend_ready") return;
    if (!previewArtifactId) return;

    let cancelled = false;
    const loadBackendPreview = async () => {
      try {
        setIsBackendPreviewLoading(true);
        setBackendPreviewError(null);
        const response = await previewApi.exportSessionPreview(
          previewSessionId,
          {
            artifact_id: previewArtifactId,
            run_id: previewRunId ?? undefined,
            format: "markdown",
            include_sources: true,
          }
        );
        if (cancelled) return;
        setBackendMarkdown(response.data.content || "");
      } catch (error) {
        if (cancelled) return;
        setBackendPreviewError(getErrorMessage(error));
        setBackendMarkdown("");
      } finally {
        if (!cancelled) {
          setIsBackendPreviewLoading(false);
        }
      }
    };

    void loadBackendPreview();
    return () => {
      cancelled = true;
    };
  }, [
    flowContext?.capabilityStatus,
    previewArtifactId,
    previewRunId,
    previewSessionId,
    shouldShowPreview,
  ]);

  const handleGenerate = async () => {
    if (!hasGenerationAnchor || isGenerating) return;
    if (flowContext?.onPrepareGenerate) {
      const prepared = await flowContext.onPrepareGenerate();
      if (!prepared) return;
    }
    if (!flowContext?.onExecute) return;
    setIsGeneratingLocal(true);
    try {
      await flowContext.onExecute();
    } finally {
      setIsGeneratingLocal(false);
    }
  };

  const insertPromptHint = (hint: string) => {
    setPromptText((prev) => {
      const normalized = prev.trim();
      if (!normalized) return hint;
      if (normalized.includes(hint)) return prev;
      return `${normalized}\n${hint}`;
    });
  };

  useEffect(() => {
    const onGenerate = () => {
      void handleGenerate();
    };
    window.addEventListener("spectra:word:generate", onGenerate);
    return () => window.removeEventListener("spectra:word:generate", onGenerate);
  }, [flowContext, hasGenerationAnchor, isGenerating, promptText]);

  return (
    <DraftResultWorkbenchShell
      showDraft={shouldShowComposeCard}
      showResult={shouldShowPreview}
      draft={
        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-900">生成要求</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  直接输入你想要的教案要求，生成后再进入编辑与导出。
                </p>
              </div>
              {sourceLabel ? (
                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">已选择：{sourceLabel}</span>
                </div>
              ) : (
                <div className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-500 shadow-sm">
                  未选课件：将按要求与资料来源生成
                </div>
              )}
            </div>
          </div>

          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700">
                <Lightbulb className="h-3.5 w-3.5" />
                <span>快捷补全</span>
              </div>
              {PROMPT_QUICK_INSERTS.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => insertPromptHint(hint)}
                  className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  {hint}
                </button>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="lesson-plan-prompt"
                    className="text-xs font-semibold text-zinc-800"
                  >
                    教案生成说明
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    {promptText.length} 字
                  </span>
                </div>
                <Textarea
                  id="lesson-plan-prompt"
                  value={promptText}
                  onChange={(event) => setPromptText(event.target.value)}
                  placeholder="输入本次教案目标、课堂重点、活动设计或评价要求。例如：围绕计算机网络物理层，突出案例导入、课堂互动与分层练习。"
                  className="min-h-[280px] resize-y rounded-xl border-zinc-200 bg-white text-sm leading-7 shadow-none focus-visible:ring-1"
                />
                <p className="mt-2 text-[11px] text-zinc-500">
                  建议写明课程主题、课堂活动和评价方式，生成质量会更稳定。
                </p>
              </div>

              <aside className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
                <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                  <ListChecks className="h-3.5 w-3.5" />
                  结构建议
                </div>
                <ul className="space-y-1.5 text-[12px] leading-5 text-zinc-600">
                  {PROMPT_QUALITY_CHECKLIST.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
        </section>
      }
      result={
        <PreviewStep
          markdown={backendMarkdown}
          isGenerating={isGenerating}
          lastGeneratedAt={null}
          flowContext={flowContext}
          isBackendPreviewLoading={isBackendPreviewLoading}
          backendPreviewError={backendPreviewError}
          toolbarMode="external"
          resultStatus={resultTargetStatus}
        />
      }
    />
  );
}
