"use client";

import { useEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { createMachine } from "xstate";
import { useShallow } from "zustand/react/shallow";
import { Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { ragApi } from "@/lib/sdk";
import { useProjectStore } from "@/stores/projectStore";
import { WorkflowStepper } from "@/components/project/shared";
import { TOOL_COLORS } from "../constants";
import type { ToolPanelProps } from "./types";
import {
  FOCUS_OPTIONS,
  getReadinessLabel,
  MINDMAP_STEPS,
} from "./mindmap/constants";
import { ConfigStep } from "./mindmap/ConfigStep";
import { GenerateStep } from "./mindmap/GenerateStep";
import { PreviewStep } from "./mindmap/PreviewStep";
import { createBaseTree } from "./mindmap/tree-utils";
import type { MindmapFocus, MindmapStep } from "./mindmap/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

const mindmapWorkflowMachine = createMachine({
  id: "mindmapWorkflow",
  initial: "idle",
  states: {
    idle: {},
    preview_ready: {},
    running: {},
    result_available: {},
    failed: {},
  },
  on: {
    PREVIEW: ".preview_ready",
    RUN: ".running",
    RESULT: ".result_available",
    FAIL: ".failed",
    RESET: ".idle",
  },
});

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
  const [tree, setTree] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [, workflowSend] = useMachine(mindmapWorkflowMachine);

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

  useEffect(() => {
    onDraftChange?.({
      topic,
      depth: Number(depth),
      focus,
      focus_scope: flowContext?.selectedSourceId
        ? "current_session"
        : "full_project",
      target_audience: targetAudience,
      selected_id: selectedId,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    depth,
    flowContext?.selectedSourceId,
    focus,
    onDraftChange,
    selectedId,
    targetAudience,
    topic,
  ]);

  const focusLabel =
    FOCUS_OPTIONS.find((item) => item.value === focus)?.label ?? "概念关系";

  useEffect(() => {
    if (isGenerating) {
      workflowSend({ type: "RUN" });
      return;
    }
    if (flowContext?.resolvedArtifact?.artifactId) {
      workflowSend({ type: "RESULT" });
      return;
    }
    if (activeStep === "generate" || activeStep === "preview") {
      workflowSend({ type: "PREVIEW" });
      return;
    }
    workflowSend({ type: "RESET" });
  }, [activeStep, flowContext?.resolvedArtifact?.artifactId, isGenerating, workflowSend]);

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
    setActiveStep("preview");
    try {
      const executed = await flowContext.onExecute();
      if (!executed) {
        setActiveStep("generate");
        return;
      }
      setLastGeneratedAt(new Date().toISOString());
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrepareGenerate = async () => {
    if (!flowContext?.onPrepareGenerate) {
      setActiveStep("generate");
      return;
    }
    const prepared = await flowContext.onPrepareGenerate();
    if (!prepared) return;
    setActiveStep("generate");
  };

  const colors = TOOL_COLORS.mindmap;

  return (
    <div
      className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/80 backdrop-blur-xl shadow-2xl shadow-zinc-200/30 group/workbench"
      style={{
        ["--project-tool-accent" as any]: colors.primary,
        ["--project-tool-accent-soft" as any]: colors.glow,
        ["--project-tool-surface" as any]: colors.soft,
      }}
    >
      {/* Tool Accent Tip */}
      <div className={cn("h-1 w-full bg-gradient-to-r", colors.gradient)} />

      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-100/80 px-5 py-4 bg-zinc-50/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white shadow-sm border border-zinc-100 group-hover/workbench:scale-110 transition-transform duration-500">
                <Network
                  className="w-5 h-5"
                  style={{ color: colors.primary }}
                />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-900 tracking-tight">
                  {toolName}智能工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  三步生成知识脉络图 · 交互式探索教学结构
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-zinc-100 bg-white px-2.5 py-1 text-[10px] font-bold text-zinc-600 shadow-sm uppercase tracking-wider">
                {getReadinessLabel(flowContext?.readiness)}
              </span>
            </div>
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
                  onNext={() => {
                    void handlePrepareGenerate();
                  }}
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
                  selectedId={selectedId}
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                  onSelectNode={setSelectedId}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
