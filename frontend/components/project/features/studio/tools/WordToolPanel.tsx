"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { previewApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { useProjectStore } from "@/stores/projectStore";
import { CheckCircle2, X } from "lucide-react";
import type { ToolPanelProps } from "./types";
import { PreviewStep } from "./word/PreviewStep";

const DEFAULT_DETAIL_LEVEL = "standard";
const REQUIREMENT_PRESETS = [
  "补充学情分析",
  "突出重难点突破",
  "对齐评价任务",
  "设计课堂活动",
  "写清板书作业",
  "加入分层练习",
];

export function WordToolPanel({
  toolName: _toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const existingDraft = flowContext?.currentDraft;
  const initialTopic =
    typeof existingDraft?.topic === "string" ? existingDraft.topic : "";
  const initialRequirements =
    typeof existingDraft?.output_requirements === "string"
      ? existingDraft.output_requirements
      : "";
  const { activeSessionId } = useProjectStore(
    useShallow((state) => ({
      activeSessionId: state.activeSessionId,
    }))
  );
  const [topic, setTopic] = useState(initialTopic);
  const [additionalRequirements, setAdditionalRequirements] =
    useState(initialRequirements);
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
  const isGenerating = Boolean(
    resultTargetStatus === "processing" || flowContext?.isActionRunning
  );
  const shouldShowPreview = Boolean(isHistoryResultMode || isGenerating);
  const shouldShowComposeCard = !shouldShowPreview;

  useEffect(() => {
    if (flowContext?.wordWorkbenchMode !== "draft") return;
    const nextTopic =
      typeof flowContext?.currentDraft?.topic === "string"
        ? flowContext.currentDraft.topic
        : "";
    const nextRequirements =
      typeof flowContext?.currentDraft?.output_requirements === "string"
        ? flowContext.currentDraft.output_requirements
        : "";
    setTopic((prev) => (prev === nextTopic ? prev : nextTopic));
    setAdditionalRequirements((prev) =>
      prev === nextRequirements ? prev : nextRequirements
    );
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
      topic,
      learning_goal: "",
      output_requirements: additionalRequirements,
      primary_source_id: primarySourceId,
      selected_source_ids: selectedSourceIds,
      document_variant: "layered_lesson_plan",
      source_artifact_id: primarySourceId,
    });
  }, [
    additionalRequirements,
    onDraftChange,
    primarySourceId,
    selectedSourceIds,
    topic,
  ]);

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

  const handleTopicChange = (value: string) => {
    setTopic(value);
  };

  const handleClearTopic = () => {
    setTopic("");
  };

  const appendRequirementPreset = (value: string) => {
    setAdditionalRequirements((previous) => {
      const trimmed = previous.trim();
      if (!trimmed) return value;
      if (trimmed.includes(value)) return previous;
      return `${trimmed}；${value}`;
    });
  };

  return (
    <div className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/80 shadow-2xl shadow-zinc-200/30 backdrop-blur-xl">
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {shouldShowComposeCard ? (
            <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-zinc-900">
                      生成一份教案
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      有课件会优先参考课件；没有课件，也可以基于课题和右侧资料来源直接生成。
                    </p>
                  </div>
                  {sourceLabel ? (
                    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">已选择：{sourceLabel}</span>
                    </div>
                  ) : (
                    <div className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-500 shadow-sm">
                      未选课件：将按课题与资料来源生成
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="lesson-plan-topic"
                    className="text-xs font-medium text-zinc-700"
                  >
                    课题
                  </Label>
                  <div className="relative">
                    <Input
                      id="lesson-plan-topic"
                      value={topic}
                      onChange={(event) => handleTopicChange(event.target.value)}
                      placeholder="例如：牛顿第二定律、物理层的基本概念"
                      className="h-10 rounded-xl border-zinc-200 pr-9 text-sm shadow-none"
                    />
                    {topic ? (
                      <button
                        type="button"
                        aria-label="清空课题"
                        className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                        onClick={handleClearTopic}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Label
                      htmlFor="lesson-plan-requirements"
                      className="text-xs font-medium text-zinc-700"
                    >
                      补充要求
                    </Label>
                    {additionalRequirements ? (
                      <button
                        type="button"
                        aria-label="清空补充要求"
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-zinc-500 transition hover:bg-white hover:text-zinc-800"
                        onClick={() => setAdditionalRequirements("")}
                      >
                        <X className="h-3 w-3" />
                        清空
                      </button>
                    ) : null}
                  </div>
                  <Textarea
                    id="lesson-plan-requirements"
                    value={additionalRequirements}
                    onChange={(event) =>
                      setAdditionalRequirements(event.target.value)
                    }
                    maxLength={400}
                    placeholder="告诉我这份教案要特别注意什么，例如：补充学情分析、突出重难点突破、写清板书作业。"
                    className="min-h-[112px] resize-none rounded-xl border-zinc-200 bg-white text-sm shadow-none focus-visible:ring-1"
                  />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      {REQUIREMENT_PRESETS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          onClick={() => appendRequirementPreset(item)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                    <span className="shrink-0 text-[11px] text-zinc-400">
                      {additionalRequirements.length}/400
                    </span>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {shouldShowPreview ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
