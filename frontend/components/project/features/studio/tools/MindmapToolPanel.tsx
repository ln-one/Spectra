"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  CheckCircle2,
  GitBranchPlus,
  Lightbulb,
  Loader2,
  Network,
  RefreshCw,
} from "lucide-react";
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
import type {
  ResolvedArtifactPayload,
  ToolFlowContext,
  ToolPanelProps,
} from "./types";
import { PreviewStep } from "./mindmap/PreviewStep";

type MindmapMode = "preview" | "edit";
const MINDMAP_QUICK_INSERTS = [
  "做成一张主干清晰、层级丰富的大图，一级分支控制在 4 到 7 个。",
  "节点名称尽量用短词或短句，不写成长段解释。",
  "按“概念 / 机制 / 对比 / 误区 / 应用 / 例题”组织分支。",
  "优先归纳关系与结构，不要把资料原文一段段搬上去。",
  "如果主题过大，先聚焦一个核心问题，再向下展开多层分支。",
];
const MINDMAP_STRUCTURE_HINTS = [
  "中心主题只表达一个问题，先把主问题立住，再向外扩展。",
  "一级分支最好是并列类别，适合用概念、机制、对比、误区、应用等视角展开。",
  "每个子节点都应直接回答父节点，不要跳层或变成资料摘录树。",
  "节点文字保持可扫读，长解释更适合放在节点摘要里。",
  "导图要有层次张力，宁可做成完整大图，也不要停在三层浅纲要。",
];

function normalizeMindmapNode(
  raw: unknown
): { id: string; children: unknown[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const rawId = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!rawId) return null;
  return {
    id: rawId,
    children: Array.isArray(obj.children) ? obj.children : [],
  };
}

function hasRenderableMindmapResult(flowContext?: ToolFlowContext): boolean {
  const artifact = flowContext?.resolvedArtifact;
  if (!artifact || artifact.contentKind !== "json") return false;
  const content =
    artifact.content && typeof artifact.content === "object"
      ? (artifact.content as Record<string, unknown>)
      : null;
  if (!content) return false;
  const nodes = Array.isArray(content.nodes) ? content.nodes : [];
  if (nodes.length === 0) return false;

  const firstNode = normalizeMindmapNode(nodes[0]);
  if (!firstNode) return false;
  if (nodes.length === 1) return true;
  if (firstNode.children.length > 0) return true;

  return nodes.some((item) => {
    const node = item as Record<string, unknown>;
    const parentId =
      typeof node.parent_id === "string" ? node.parent_id.trim() : "";
    return parentId.length > 0;
  });
}

export function MindmapToolPanel({
  toolName: _toolName,
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
  const [activeMode, setActiveMode] = useState<MindmapMode>("preview");
  const [hasActivatedResultSurface, setHasActivatedResultSurface] = useState(false);
  const [stickyResolvedArtifact, setStickyResolvedArtifact] =
    useState<ResolvedArtifactPayload | null>(null);

  const sourceOptions = flowContext?.sourceOptions ?? [];
  const requiresSourceArtifact = Boolean(flowContext?.requiresSourceArtifact);
  const sourceLabel =
    (flowContext?.selectedSourceId &&
      sourceOptions.find((item) => item.id === flowContext.selectedSourceId)
        ?.title) ||
    null;

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
      focus_scope: flowContext?.selectedSourceId ? "current_session" : "full_project",
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    flowContext?.selectedSourceId,
    onDraftChange,
    project?.name,
    requirementText,
  ]);

  const hasRequirement = requirementText.trim().length > 0;
  const hasRenderableResult = hasRenderableMindmapResult(flowContext);
  const isGenerating =
    isGeneratingLocal ||
    flowContext?.isActionRunning ||
    flowContext?.workflowState === "executing" ||
    flowContext?.managedResultTarget?.status === "processing";
  const isHistoryResultMode = flowContext?.managedWorkbenchMode === "history";
  useEffect(() => {
    if (hasRenderableResult || isGenerating || isHistoryResultMode) {
      setHasActivatedResultSurface(true);
    }
  }, [hasRenderableResult, isGenerating, isHistoryResultMode]);

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

  useEffect(() => {
    const resolvedArtifact = flowContext?.resolvedArtifact;
    if (!resolvedArtifact) return;
    if (!hasRenderableMindmapResult({ ...flowContext, resolvedArtifact })) return;
    setStickyResolvedArtifact((previous) =>
      previous?.artifactId === resolvedArtifact.artifactId ? previous : resolvedArtifact
    );
  }, [flowContext]);

  const shouldShowPreview = Boolean(
    isHistoryResultMode ||
      isGenerating ||
      hasRenderableResult ||
      hasActivatedResultSurface
  );
  const shouldShowComposeCard = !shouldShowPreview;

  const previewFlowContext = useMemo(() => {
    if (!stickyResolvedArtifact) return flowContext;
    if (hasRenderableResult || flowContext?.resolvedArtifact) return flowContext;
    return {
      ...flowContext,
      resolvedArtifact: stickyResolvedArtifact,
    };
  }, [flowContext, hasRenderableResult, stickyResolvedArtifact]);

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

  useEffect(() => {
    const onGenerate = () => {
      void handleGenerate();
    };
    const onSetMode = (event: Event) => {
      const customEvent = event as CustomEvent<{ mode?: MindmapMode }>;
      const nextMode = customEvent.detail?.mode;
      if (nextMode === "preview" || nextMode === "edit") {
        setActiveMode(nextMode);
      }
    };
    window.addEventListener("spectra:mindmap:generate", onGenerate);
    window.addEventListener(
      "spectra:mindmap:set-mode",
      onSetMode as EventListener
    );
    return () => {
      window.removeEventListener("spectra:mindmap:generate", onGenerate);
      window.removeEventListener(
        "spectra:mindmap:set-mode",
        onSetMode as EventListener
      );
    };
  }, [handleGenerate]);

  useEffect(() => {
    if (!shouldShowPreview) {
      setActiveMode("preview");
    }
  }, [shouldShowPreview]);

  const insertPromptHint = (hint: string) => {
    setRequirementText((prev) => {
      const normalized = prev.trim();
      if (!normalized) return hint;
      if (normalized.includes(hint)) return prev;
      return `${normalized}\n${hint}`;
    });
  };

  return (
    <DraftResultWorkbenchShell
      showDraft={shouldShowComposeCard}
      showResult={shouldShowPreview}
      bodyClassName={
        shouldShowPreview ? "h-full min-h-0 overflow-hidden p-0" : undefined
      }
      draft={
        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-900">生成要求</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  输入一次要求，直接生成更完整的大图，再进入工作面继续精修。
                </p>
              </div>
              {sourceLabel ? (
                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-medium text-teal-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">已选择：{sourceLabel}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50/80 px-3 py-1.5 text-[11px] font-medium text-cyan-700 shadow-sm">
                  <Network className="h-3.5 w-3.5 shrink-0" />
                  <span>将结合当前项目资料生成导图</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700">
                <Lightbulb className="h-3.5 w-3.5" />
                <span>快捷补全</span>
              </div>
              {MINDMAP_QUICK_INSERTS.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => insertPromptHint(hint)}
                  className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                >
                  {hint}
                </button>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="mindmap-prompt"
                    className="text-xs font-semibold text-zinc-800"
                  >
                    导图生成说明
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    {requirementText.length} 字
                  </span>
                </div>
                <Textarea
                  id="mindmap-prompt"
                  value={requirementText}
                  onChange={(event) => setRequirementText(event.target.value)}
                  placeholder="例如：围绕停止等待协议的效率问题，整理成课堂讲解用思维导图，突出核心概念、效率推导、影响因素和常见误区。"
                  className="min-h-[280px] resize-y rounded-xl border-zinc-200 bg-white text-sm leading-7 shadow-none focus-visible:ring-1"
                />
                <p className="mt-2 text-[11px] text-zinc-500">
                  建议写明主题、讲解视角和希望突出的关系，系统会默认生成层级更丰富的知识导图。
                </p>
              </div>

              <aside className="rounded-2xl border border-teal-100 bg-[linear-gradient(180deg,rgba(240,253,250,0.92),rgba(236,254,255,0.84))] p-3">
                <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800">
                  <GitBranchPlus className="h-3.5 w-3.5" />
                  导图建议
                </div>
                <ul className="space-y-1.5 text-[12px] leading-5 text-zinc-700">
                  {MINDMAP_STRUCTURE_HINTS.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>

          {requiresSourceArtifact ? (
            <div className="mx-4 mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
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
            <div className="mx-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              当前能力还在准备中，请稍后再试。
            </div>
          ) : null}
        </section>
      }
      result={
        <PreviewStep
          mode={activeMode}
          selectedId={selectedId}
          lastGeneratedAt={lastGeneratedAt}
          flowContext={previewFlowContext}
          onSelectNode={setSelectedId}
        />
      }
    />
  );
}
