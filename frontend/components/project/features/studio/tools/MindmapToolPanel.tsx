"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ragApi } from "@/lib/sdk";
import { useProjectStore } from "@/stores/projectStore";
import { WorkflowStepper } from "@/components/project/shared";
import type { ToolPanelProps } from "./types";
import {
  FOCUS_OPTIONS,
  getReadinessLabel,
  MINDMAP_STEPS,
} from "./mindmap/constants";
import { ConfigStep } from "./mindmap/ConfigStep";
import { GenerateStep } from "./mindmap/GenerateStep";
import { PreviewStep } from "./mindmap/PreviewStep";
import {
  countNodes,
  createBaseTree,
  findNodeById,
  findNodePath,
  injectChildren,
} from "./mindmap/tree-utils";
import type { MindNode, MindmapFocus, MindmapStep } from "./mindmap/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

function extractKeywords(input: string): string[] {
  return input
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ")
    .split(/\s+/)
    .filter((item) => item.length >= 2 && item.length <= 12);
}

function normalizeTopicLabel(label: string): string {
  return label
    .replace(/\.[a-zA-Z0-9]+$/g, "")
    .replace(/[《》"'`]/g, "")
    .trim();
}

export function MindmapToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const { project, files, selectedFileIds } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      files: state.files,
      selectedFileIds: state.selectedFileIds,
    }))
  );

  const [activeStep, setActiveStep] = useState<MindmapStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);

  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState("3");
  const [focus, setFocus] = useState<MindmapFocus>("concept");
  const [targetAudience, setTargetAudience] = useState("高一");
  const [selectedId, setSelectedId] = useState("root");
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const [isTopicSuggestionsLoading, setIsTopicSuggestionsLoading] =
    useState(false);
  const [isTopicDirty, setIsTopicDirty] = useState(false);
  const [tree, setTree] = useState<MindNode>(() =>
    createBaseTree("课程主题", focus, 3)
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const topicRef = useRef(topic);
  const topicDirtyRef = useRef(isTopicDirty);

  useEffect(() => {
    topicRef.current = topic;
  }, [topic]);

  useEffect(() => {
    topicDirtyRef.current = isTopicDirty;
  }, [isTopicDirty]);

  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;

    const loadTopicSuggestions = async () => {
      const readyFiles = files.filter((file) => file.status === "ready");
      const fallbackSuggestions = [
        normalizeTopicLabel(project.name || ""),
        ...readyFiles.map((file) => normalizeTopicLabel(file.filename || "")),
      ]
        .filter(Boolean)
        .slice(0, 4);

      setIsTopicSuggestionsLoading(true);
      try {
        const fileIds =
          selectedFileIds.length > 0
            ? selectedFileIds
            : readyFiles.map((file) => file.id);

        const response = await ragApi.search({
          project_id: project.id,
          query: `${project.name || "当前项目"} 核心主题 知识结构 关键词`,
          top_k: 5,
          filters: fileIds.length > 0 ? { file_ids: fileIds } : undefined,
        });

        if (cancelled) return;
        const chunks = response?.data?.results ?? [];
        const mergedText = chunks.map((item) => item.content).join(" ");
        const keywordCandidates = extractKeywords(mergedText).slice(0, 8);
        const sourceCandidates = chunks
          .map((item) => normalizeTopicLabel(item.source?.filename || ""))
          .filter(Boolean);

        const recommendations = Array.from(
          new Set([
            ...keywordCandidates,
            ...sourceCandidates,
            ...fallbackSuggestions,
          ])
        )
          .filter((item) => item.length >= 2 && item.length <= 24)
          .slice(0, 6);

        const nextSuggestions =
          recommendations.length > 0
            ? recommendations
            : fallbackSuggestions.length > 0
              ? fallbackSuggestions
              : ["当前项目核心概念"];

        setTopicSuggestions(nextSuggestions);
        if (!topicDirtyRef.current && !topicRef.current.trim()) {
          setTopic(nextSuggestions[0] || "");
        }
      } catch {
        if (cancelled) return;
        const nextSuggestions =
          fallbackSuggestions.length > 0
            ? fallbackSuggestions
            : ["当前项目核心概念"];
        setTopicSuggestions(nextSuggestions);
        if (!topicDirtyRef.current && !topicRef.current.trim()) {
          setTopic(nextSuggestions[0] || "");
        }
      } finally {
        if (!cancelled) {
          setIsTopicSuggestionsLoading(false);
        }
      }
    };

    void loadTopicSuggestions();
    return () => {
      cancelled = true;
    };
  }, [files, project?.id, project?.name, selectedFileIds]);

  const selectedNodePath = useMemo(
    () => findNodePath(tree, selectedId).join(" > "),
    [selectedId, tree]
  );

  useEffect(() => {
    onDraftChange?.({
      topic,
      depth: Number(depth),
      focus,
      focus_scope: flowContext?.selectedSourceId
        ? "current_session"
        : "full_project",
      target_audience: targetAudience,
      selected_node_path: selectedNodePath,
      selected_id: selectedId,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    depth,
    flowContext?.selectedSourceId,
    focus,
    onDraftChange,
    selectedId,
    selectedNodePath,
    targetAudience,
    topic,
  ]);

  const totalNodeCount = useMemo(() => countNodes(tree), [tree]);
  const selectedNodeLabel = useMemo(
    () => findNodeById(tree, selectedId)?.label ?? "未选择",
    [selectedId, tree]
  );
  const focusLabel =
    FOCUS_OPTIONS.find((item) => item.value === focus)?.label ?? "概念关系";

  const handleGenerate = async () => {
    const normalizedTopic =
      topic.trim() ||
      topicSuggestions[0] ||
      project?.name?.trim() ||
      "当前项目核心概念";

    const generatedTree = createBaseTree(normalizedTopic, focus, Number(depth));
    if (!topic.trim()) {
      setTopic(normalizedTopic);
    }
    setTree(generatedTree);
    setSelectedId("root");

    if (!flowContext?.onExecute) {
      setLastGeneratedAt(new Date().toISOString());
      setActiveStep("preview");
      return;
    }

    setIsGenerating(true);
    try {
      await flowContext.onExecute();
      setLastGeneratedAt(new Date().toISOString());
      setActiveStep("preview");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200 bg-[linear-gradient(160deg,#ffffff,#f8fafc)] shadow-[0_22px_65px_-48px_rgba(15,23,42,0.45)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-200 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}三步工作台{" "}
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                用三步完成导图制作：先设置，再生成，最后在面板里看结果并细化。{" "}
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600">
              {getReadinessLabel(flowContext?.readiness)}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="grid h-full min-h-0 gap-3 grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)]">
            <WorkflowStepper
              className="hidden h-full min-h-0 overflow-y-auto lg:block"
              layout="rail"
              currentStep={activeStep}
              steps={MINDMAP_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as MindmapStep)}
              title="思维导图流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={MINDMAP_STEPS}
                  onStepChange={(stepId) =>
                    setActiveStep(stepId as MindmapStep)
                  }
                  title="思维导图流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  topic={topic}
                  depth={depth}
                  focus={focus}
                  targetAudience={targetAudience}
                  focusLabel={focusLabel}
                  topicSuggestions={topicSuggestions}
                  isTopicSuggestionsLoading={isTopicSuggestionsLoading}
                  onTopicChange={(nextTopic) => {
                    setIsTopicDirty(true);
                    setTopic(nextTopic);
                  }}
                  onDepthChange={setDepth}
                  onFocusChange={setFocus}
                  onTargetAudienceChange={setTargetAudience}
                  onNext={() => setActiveStep("generate")}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  depth={depth}
                  targetAudience={targetAudience}
                  focusLabel={focusLabel}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  tree={tree}
                  selectedId={selectedId}
                  selectedNodeLabel={selectedNodeLabel}
                  totalNodeCount={totalNodeCount}
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                  onSelectNode={setSelectedId}
                  onRegenerate={() => setActiveStep("generate")}
                  onInjectChildren={() =>
                    setTree((prev) => injectChildren(prev, selectedId))
                  }
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
