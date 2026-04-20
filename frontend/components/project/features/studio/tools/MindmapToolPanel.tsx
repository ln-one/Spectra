"use client";

import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProjectStore } from "@/stores/projectStore";
import { DraftResultWorkbenchShell } from "./DraftResultWorkbenchShell";
import type { ToolPanelProps } from "./types";
import { PreviewStep } from "./mindmap/PreviewStep";

export function MindmapToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const existingDraft = flowContext?.currentDraft;
  const initialRequirement =
    typeof existingDraft?.output_requirements === "string"
      ? existingDraft.output_requirements
      : typeof existingDraft?.topic === "string"
        ? existingDraft.topic
        : "";

  const { project } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
    }))
  );

  const [requirementText, setRequirementText] = useState(initialRequirement);
  const [isGeneratingLocal, setIsGeneratingLocal] = useState(false);
  const [selectedId, setSelectedId] = useState("root");
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const sourceOptions = flowContext?.sourceOptions ?? [];
  const requiresSourceArtifact = Boolean(flowContext?.requiresSourceArtifact);

  useEffect(() => {
    const nextRequirement =
      typeof flowContext?.currentDraft?.output_requirements === "string"
        ? flowContext.currentDraft.output_requirements
        : typeof flowContext?.currentDraft?.topic === "string"
          ? flowContext.currentDraft.topic
          : "";
    setRequirementText((prev) => (prev === nextRequirement ? prev : nextRequirement));
  }, [flowContext?.currentDraft]);

  useEffect(() => {
    const requirement = requirementText.trim();
    const fallbackTopic = project?.name?.trim() || "当前项目核心概念";
    onDraftChange?.({
      topic: requirement || fallbackTopic,
      output_requirements: requirement,
      depth: 3,
      focus: "concept",
      target_audience: "高一",
      focus_scope: flowContext?.selectedSourceId ? "current_session" : "full_project",
      selected_id: selectedId,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    flowContext?.selectedSourceId,
    onDraftChange,
    project?.name,
    requirementText,
    selectedId,
  ]);

  const hasRequirement = requirementText.trim().length > 0;
  const hasResultArtifact = Boolean(
    flowContext?.resolvedArtifact?.artifactId ??
      flowContext?.latestArtifacts?.[0]?.artifactId
  );
  const isGenerating =
    isGeneratingLocal ||
    flowContext?.isActionRunning ||
    flowContext?.workflowState === "executing" ||
    flowContext?.managedResultTarget?.status === "processing";
  const isHistoryResultMode = flowContext?.managedWorkbenchMode === "history";
  const shouldShowPreview = Boolean(
    isHistoryResultMode || isGenerating || hasResultArtifact
  );
  const shouldShowComposeCard = !shouldShowPreview;

  const canGenerate = Boolean(
    hasRequirement &&
      !isGenerating &&
      !flowContext?.isLoadingProtocol &&
      flowContext?.canExecute !== false &&
      (!requiresSourceArtifact || Boolean(flowContext?.selectedSourceId))
  );

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
      setSelectedId("root");
      setLastGeneratedAt(new Date().toISOString());
    } finally {
      setIsGeneratingLocal(false);
    }
  };

  return (
    <DraftResultWorkbenchShell
      showDraft={shouldShowComposeCard}
      showResult={shouldShowPreview}
      bodyClassName={
        shouldShowPreview ? "h-full min-h-0 overflow-hidden p-0" : undefined
      }
      draft={
        <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-900">生成要求</p>
            <span className="text-[11px] text-zinc-400">{requirementText.length} 字</span>
          </div>
          <Textarea
            value={requirementText}
            onChange={(event) => setRequirementText(event.target.value)}
            placeholder="例如：围绕空闲时间是D，画出停止等待协议效率问题的关键概念关系，突出推导链路和课堂易错点。"
            className="min-h-[260px] resize-y rounded-xl border-zinc-200 bg-white text-sm leading-7 shadow-none focus-visible:ring-1"
          />
          <p className="mt-2 text-[11px] text-zinc-500">
            只需输入一个要求，系统会结合项目上下文生成可编辑导图。
          </p>

          {requiresSourceArtifact ? (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-700">
                  该卡片需要选择一个参考成果后才能生成
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void flowContext?.onLoadSources?.()}
                  disabled={
                    flowContext?.isLoadingProtocol || flowContext?.isActionRunning
                  }
                >
                  {flowContext?.isActionRunning ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  刷新列表
                </Button>
              </div>
              <div className="mt-2">
                <Select
                  value={flowContext?.selectedSourceId ?? ""}
                  onValueChange={(value) =>
                    flowContext?.onSelectedSourceChange?.(value || null)
                  }
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="请选择一个已生成成果" />
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
              </div>
            </div>
          ) : null}

          {flowContext?.isProtocolPending ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              当前能力还在准备中，请稍后再试。
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              className="h-9 rounded-lg bg-zinc-900 text-xs hover:bg-zinc-800"
              disabled={!canGenerate}
              onClick={() => void handleGenerate()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  正在生成导图...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  一键生成导图
                </>
              )}
            </Button>
          </div>
        </section>
      }
      result={
        <PreviewStep
          selectedId={selectedId}
          lastGeneratedAt={lastGeneratedAt}
          flowContext={flowContext}
          onSelectNode={setSelectedId}
        />
      }
    />
  );
}
