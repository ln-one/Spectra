"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGroup } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProjectStore, GENERATION_TOOLS } from "@/stores/projectStore";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import { STUDIO_TOOL_COMPONENTS } from "../tools";
import type { StudioToolKey, ToolDraftState, ToolFlowContext } from "../tools";
import { TOOL_COLORS, TOOL_ICONS, TOOL_LABELS } from "../constants";
import { useStudioWorkflowHistory } from "../history/useStudioWorkflowHistory";
import { useStudioCapabilityState } from "./useStudioCapabilityState";
import { useStudioExecutionHandlers } from "./useStudioExecutionHandlers";
import { useStudioHistoryHandlers } from "./useStudioHistoryHandlers";
import type { StudioPanelProps } from "./types";
import {
  isDraftStateEqual,
  normalizeHistoryStep,
  toStudioManagedTool,
} from "./utils";
import { StudioPanelHeader } from "./components/StudioPanelHeader";
import { StudioCollapsedView } from "./components/StudioCollapsedView";
import { StudioExpandedView } from "./components/StudioExpandedView";
import { StudioArchiveHistoryDialog } from "./components/StudioArchiveHistoryDialog";

export function StudioPanelContainer({
  onToolClick,
  className,
  style,
  ...props
}: StudioPanelProps) {
  const {
    project,
    layoutMode,
    expandedTool,
    artifactHistoryByTool,
    selectedFileIds,
    activeSessionId,
    activeRunId,
    generationSession,
    setActiveSessionId,
    setActiveRunId,
    fetchArtifactHistory,
    exportArtifact,
    setLayoutMode,
    setExpandedTool,
    startGeneration,
    setStudioChatContext,
    pushStudioHintMessage,
    focusChatComposer,
  } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      layoutMode: state.layoutMode,
      expandedTool: state.expandedTool,
      artifactHistoryByTool: state.artifactHistoryByTool,
      selectedFileIds: state.selectedFileIds,
      activeSessionId: state.activeSessionId,
      activeRunId: state.activeRunId,
      generationSession: state.generationSession,
      setActiveSessionId: state.setActiveSessionId,
      setActiveRunId: state.setActiveRunId,
      fetchArtifactHistory: state.fetchArtifactHistory,
      exportArtifact: state.exportArtifact,
      setLayoutMode: state.setLayoutMode,
      setExpandedTool: state.setExpandedTool,
      startGeneration: state.startGeneration,
      setStudioChatContext: state.setStudioChatContext,
      pushStudioHintMessage: state.pushStudioHintMessage,
      focusChatComposer: state.focusChatComposer,
    }))
  );

  const [hoveredToolId, setHoveredToolId] = useState<string | null>(null);
  const [toolDrafts, setToolDrafts] = useState<
    Partial<Record<StudioToolKey, ToolDraftState>>
  >({});
  const [pptResumeStage, setPptResumeStage] = useState<"config" | "outline">(
    "config"
  );
  const [pptResumeSignal, setPptResumeSignal] = useState(0);
  const [isArchiveHistoryPanelOpen, setIsArchiveHistoryPanelOpen] =
    useState(false);

  const isExpanded = layoutMode === "expanded";
  const {
    groupedHistory,
    archivedHistory,
    currentStepByTool,
    requestedStepByTool,
    trackStep,
    requestStep,
    acknowledgeStep,
    recordWorkflowEntry,
    archiveHistoryItem,
    unarchiveHistoryItem,
  } = useStudioWorkflowHistory(
    artifactHistoryByTool,
    activeSessionId,
    project?.id ?? null
  );
  const hasHistory = groupedHistory.length > 0;

  useEffect(() => {
    if (!expandedTool) return;
    trackStep(expandedTool as GenerationToolType, "config");
  }, [expandedTool, trackStep]);

  useEffect(() => {
    trackStep("ppt", "config");
  }, [trackStep]);

  useEffect(() => {
    const handleOpenArchiveHistory = () => {
      setIsArchiveHistoryPanelOpen(true);
    };
    window.addEventListener(
      "spectra:open-archive-history",
      handleOpenArchiveHistory
    );
    return () => {
      window.removeEventListener(
        "spectra:open-archive-history",
        handleOpenArchiveHistory
      );
    };
  }, []);

  const currentTool = GENERATION_TOOLS.find(
    (tool) => tool.type === expandedTool
  );
  const CurrentIcon = currentTool ? TOOL_ICONS[currentTool.id] : Sparkles;
  const currentColor = currentTool
    ? TOOL_COLORS[currentTool.id]
    : TOOL_COLORS.ppt;
  const expandedToolComponent =
    expandedTool && expandedTool !== "ppt"
      ? STUDIO_TOOL_COMPONENTS[expandedTool as StudioToolKey]
      : null;
  const currentToolDraft = useMemo(
    () =>
      expandedTool && expandedTool !== "ppt"
        ? toolDrafts[expandedTool as StudioToolKey] || {}
        : {},
    [expandedTool, toolDrafts]
  );
  const draftSourceArtifactId =
    typeof currentToolDraft.source_artifact_id === "string"
      ? currentToolDraft.source_artifact_id
      : null;

  const capability = useStudioCapabilityState({
    projectId: project?.id ?? null,
    activeSessionId,
    expandedTool: (expandedTool as GenerationToolType | null) ?? null,
    artifactHistoryByTool,
    draftSourceArtifactId,
  });

  const canRefineBase =
    Boolean(capability.currentCardId) &&
    !capability.isProtocolPending &&
    capability.supportsChatRefine &&
    (!capability.requiresSourceArtifact || capability.hasSourceBinding);

  const syncStudioChatContextByStep = useCallback(
    (
      toolType: GenerationToolType,
      step: "config" | "generate" | "preview",
      sessionId?: string | null
    ) => {
      if (!project) {
        setStudioChatContext(null);
        return;
      }
      const managedTool = toStudioManagedTool(toolType);
      if (!managedTool || !capability.currentCardId) {
        setStudioChatContext(null);
        return;
      }
      const targetSessionId = sessionId ?? activeSessionId ?? null;
      if (!targetSessionId) {
        setStudioChatContext(null);
        return;
      }
      setStudioChatContext({
        projectId: project.id,
        sessionId: targetSessionId,
        toolType: managedTool,
        toolLabel: TOOL_LABELS[managedTool],
        cardId: capability.currentCardId,
        step,
        canRefine: canRefineBase,
        isRefineMode: step === "preview" && canRefineBase,
        sourceArtifactId:
          capability.selectedSourceId ??
          capability.draftSourceArtifactId ??
          null,
        configSnapshot: currentToolDraft,
      });
    },
    [
      activeSessionId,
      canRefineBase,
      capability.currentCardId,
      capability.draftSourceArtifactId,
      capability.selectedSourceId,
      currentToolDraft,
      project,
      setStudioChatContext,
    ]
  );

  const execution = useStudioExecutionHandlers({
    project: project ? { id: project.id } : null,
    expandedTool: (expandedTool as GenerationToolType | null) ?? null,
    currentCardId: capability.currentCardId,
    currentToolDraft,
    selectedSourceId: capability.selectedSourceId,
    selectedFileIds,
    draftSourceArtifactId: capability.draftSourceArtifactId,
    activeSessionId,
    activeRunId,
    generationSession,
    isProtocolPending: capability.isProtocolPending,
    requiresSourceArtifact: capability.requiresSourceArtifact,
    hasSourceBinding: capability.hasSourceBinding,
    canRefine: canRefineBase,
    setActiveSessionId,
    setActiveRunId,
    fetchArtifactHistory,
    focusChatComposer,
    syncStudioChatContextByStep,
    upsertCurrentCardSources: capability.upsertCurrentCardSources,
    appendRuntimeArtifact: capability.appendRuntimeArtifact,
  });

  const canExecute =
    Boolean(capability.currentCardId) &&
    !execution.isStudioActionRunning &&
    !capability.isProtocolPending &&
    (!capability.requiresSourceArtifact || capability.hasSourceBinding);
  const canRefine = canRefineBase && !execution.isStudioActionRunning;

  const requestedHistoryStep = expandedTool
    ? (requestedStepByTool[expandedTool as GenerationToolType] ?? null)
    : null;

  const pushStudioStageHint = useCallback(
    (
      toolType: GenerationToolType,
      stage: "generate" | "preview",
      sessionId: string | null
    ) => {
      if (!project || !sessionId) return;
      const managedTool = toStudioManagedTool(toolType);
      if (!managedTool) return;
      pushStudioHintMessage({
        projectId: project.id,
        sessionId,
        toolType: managedTool,
        stage,
        dedupeKey: `${sessionId}:${managedTool}:${stage}`,
        toolLabel: TOOL_LABELS[managedTool],
      });
    },
    [project, pushStudioHintMessage]
  );

  const historyHandlers = useStudioHistoryHandlers({
    projectId: project?.id ?? null,
    isExpanded,
    expandedTool: (expandedTool as GenerationToolType | null) ?? null,
    activeSessionId,
    currentToolDraft,
    resolvePptRunId: execution.resolvePptRunId,
    openPptPreviewPage: execution.openPptPreviewPage,
    setLayoutMode,
    setExpandedTool,
    setActiveSessionId,
    setActiveRunId,
    setPptResumeStage,
    bumpPptResumeSignal: () => setPptResumeSignal((prev) => prev + 1),
    setHoveredToolId,
    setStudioChatContext,
    onToolClick,
    trackStep,
    requestStep,
    acknowledgeStep,
    recordWorkflowEntry,
    syncStudioChatContextByStep,
    pushStudioStageHint,
  });

  const handleExpandedToolDraftChange = useMemo(() => {
    if (!expandedTool || expandedTool === "ppt") {
      return undefined;
    }
    const toolKey = expandedTool as StudioToolKey;
    return (draft: ToolDraftState) => {
      setToolDrafts((prev) => {
        const current = prev[toolKey];
        if (isDraftStateEqual(current, draft)) {
          return prev;
        }
        return {
          ...prev,
          [toolKey]: draft,
        };
      });
    };
  }, [expandedTool]);

  useEffect(() => {
    const currentManagedToolType =
      expandedTool && expandedTool !== "ppt"
        ? toStudioManagedTool(expandedTool as GenerationToolType)
        : null;
    if (
      !project ||
      !isExpanded ||
      !currentManagedToolType ||
      !capability.currentCardId
    ) {
      setStudioChatContext(null);
      return;
    }

    const trackedStep = normalizeHistoryStep(
      currentStepByTool[currentManagedToolType] ?? "config"
    );
    const normalizedStep =
      trackedStep === "preview"
        ? "preview"
        : trackedStep === "generate"
          ? "generate"
          : "config";

    syncStudioChatContextByStep(
      currentManagedToolType,
      normalizedStep,
      activeSessionId
    );
    if (normalizedStep === "preview") {
      pushStudioStageHint(currentManagedToolType, "preview", activeSessionId);
    }
  }, [
    activeSessionId,
    capability.currentCardId,
    currentStepByTool,
    expandedTool,
    isExpanded,
    project,
    pushStudioStageHint,
    setStudioChatContext,
    syncStudioChatContextByStep,
  ]);

  const isCardManagedFlowExpanded =
    expandedTool === "word" ||
    expandedTool === "mindmap" ||
    expandedTool === "outline" ||
    expandedTool === "quiz" ||
    expandedTool === "summary" ||
    expandedTool === "animation" ||
    expandedTool === "handout";

  const toolFlowContext: ToolFlowContext = {
    readiness: capability.currentReadiness,
    isLoadingProtocol: capability.isLoadingCardProtocol,
    isActionRunning: execution.isStudioActionRunning,
    isProtocolPending: capability.isProtocolPending,
    requiresSourceArtifact: capability.requiresSourceArtifact,
    supportsChatRefine: capability.supportsChatRefine,
    canExecute,
    canRefine,
    capabilityStatus: capability.activeCapabilityState.status,
    capabilityReason: capability.activeCapabilityState.reason,
    isCapabilityLoading: capability.activeCapabilityState.isLoading,
    resolvedArtifact: capability.activeCapabilityState.resolvedArtifact,
    sourceOptions: capability.sourceOptions,
    selectedSourceId: capability.selectedSourceId,
    requestedStep: requestedHistoryStep,
    latestArtifacts: capability.currentToolArtifacts.map((item) => ({
      artifactId: item.artifactId,
      title: item.title,
      status: item.status,
      createdAt: item.createdAt,
    })),
    onStepChange: historyHandlers.handleManagedToolStepChange,
    onSelectedSourceChange: (sourceId) => {
      capability.setSelectedSourceForCurrentCard(sourceId);
    },
    onLoadSources: () => execution.handleStudioLoadSources(),
    onPreviewExecution: () => execution.handleStudioPreviewExecution(),
    onExecute: async () => {
      if (!expandedTool || expandedTool === "ppt") return false;
      const toolType = expandedTool as GenerationToolType;
      const contextSessionId = activeSessionId ?? null;
      recordWorkflowEntry({
        toolType,
        title: TOOL_LABELS[toolType] + " - Generating",
        status: "processing",
        step: "generate",
        sessionId: contextSessionId,
        titleSource: JSON.stringify(currentToolDraft),
        toolLabel: TOOL_LABELS[toolType],
      });
      pushStudioStageHint(toolType, "generate", contextSessionId);
      syncStudioChatContextByStep(toolType, "generate", contextSessionId);
      const result = await execution.handleStudioExecute();
      if (result.ok) {
        const resolvedSessionId = result.effectiveSessionId ?? contextSessionId;
        if (resolvedSessionId) {
          recordWorkflowEntry({
            toolType,
            title: TOOL_LABELS[toolType] + " - Preview",
            status: "previewing",
            step: "preview",
            sessionId: resolvedSessionId,
            runId: result.runId ?? undefined,
            runNo: result.runNo ?? undefined,
            titleSource: JSON.stringify(currentToolDraft),
            toolLabel: TOOL_LABELS[toolType],
          });
          syncStudioChatContextByStep(toolType, "preview", resolvedSessionId);
          pushStudioStageHint(toolType, "preview", resolvedSessionId);
        }
        return true;
      }
      return false;
    },
    onRefine: () => execution.handleOpenChatRefine(),
    onExportArtifact: (artifactId) => exportArtifact(artifactId),
  };

  return (
    <div
      className={cn("project-panel-root h-full bg-transparent", className)}
      style={{ transform: "translateZ(0)", ...style }}
      {...props}
    >
      <Card className="project-panel-card project-studio-panel h-full overflow-hidden rounded-2xl border border-[var(--project-border)] bg-[var(--project-surface)] text-[var(--project-text-primary)] shadow-lg backdrop-blur-xl will-change-[box-shadow,transform]">
        <LayoutGroup id="studio-layout">
          <StudioPanelHeader
            isExpanded={isExpanded}
            expandedTool={(expandedTool as GenerationToolType | null) ?? null}
            onClose={historyHandlers.handleClose}
            currentIcon={CurrentIcon}
            currentColor={currentColor}
          />
          <CardContent className="relative h-[calc(100%-52px)] overflow-hidden p-0">
            <StudioCollapsedView
              isExpanded={isExpanded}
              hoveredToolId={hoveredToolId}
              onHoveredToolIdChange={setHoveredToolId}
              onToolClick={historyHandlers.handleToolClick}
              hasHistory={hasHistory}
              groupedHistory={groupedHistory}
              projectId={project?.id ?? null}
              activeSessionId={activeSessionId}
              fetchArtifactHistory={fetchArtifactHistory}
              onOpenHistoryItem={historyHandlers.handleOpenHistoryItem}
              onArchiveHistoryItem={archiveHistoryItem}
            />
            <StudioExpandedView
              isExpanded={isExpanded}
              expandedTool={(expandedTool as GenerationToolType | null) ?? null}
              expandedToolComponent={expandedToolComponent}
              pptResumeStage={pptResumeStage}
              pptResumeSignal={pptResumeSignal}
              onPptWorkflowStageChange={(stage, payload) => {
                if (stage === "config") {
                  trackStep("ppt", "config");
                  acknowledgeStep("ppt", "config");
                  return;
                }
                if (stage === "generating_outline") {
                  const resolvedSessionId =
                    payload?.sessionId ?? activeSessionId ?? null;
                  if (!resolvedSessionId) return;
                  const runId =
                    payload?.runId || execution.resolvePptRunId() || undefined;
                  trackStep("ppt", "outline");
                  acknowledgeStep("ppt", "outline");
                  recordWorkflowEntry({
                    toolType: "ppt",
                    title: "PPT Outline Draft",
                    status: "draft",
                    step: "outline",
                    sessionId: resolvedSessionId,
                    runId,
                    titleSource: "PPT Outline Draft",
                    toolLabel: TOOL_LABELS.ppt,
                  });
                  return;
                }
                if (stage === "preview") {
                  const resolvedSessionId =
                    payload?.sessionId ?? activeSessionId ?? null;
                  if (!resolvedSessionId) return;
                  trackStep("ppt", "preview");
                  acknowledgeStep("ppt", "preview");
                  const runId =
                    payload?.runId || execution.resolvePptRunId() || undefined;
                  recordWorkflowEntry({
                    toolType: "ppt",
                    title: "PPT Generating",
                    status: "processing",
                    step: "preview",
                    sessionId: resolvedSessionId,
                    runId,
                    toolLabel: TOOL_LABELS.ppt,
                  });
                  return;
                }
                trackStep("ppt", "outline");
                acknowledgeStep("ppt", "outline");
                const runId =
                  payload?.runId || execution.resolvePptRunId() || undefined;
                recordWorkflowEntry({
                  toolType: "ppt",
                  title: "PPT Outline Draft",
                  status: "draft",
                  step: "outline",
                  sessionId: payload?.sessionId ?? activeSessionId ?? null,
                  runId,
                  titleSource: "PPT Outline Draft",
                  toolLabel: TOOL_LABELS.ppt,
                });
              }}
              onPptGenerate={async (config) => {
                const tool = GENERATION_TOOLS.find(
                  (item) => item.type === expandedTool
                );
                if (!project || !tool) return null;
                const sessionId = await startGeneration(project.id, tool, {
                  template: "default",
                  show_page_number: true,
                  include_animations: false,
                  include_games: false,
                  use_text_to_image: false,
                  pages: Number(config.pageCount) || 15,
                  audience: "intermediate",
                  system_prompt_tone: [
                    `[outline_style=${config.outlineStyle}]`,
                    config.prompt,
                    "Keep a clear teaching structure and slide pacing.",
                  ].join("\n"),
                });
                if (sessionId) {
                  setActiveSessionId(sessionId);
                }
                return sessionId;
              }}
              isCardManagedFlowExpanded={isCardManagedFlowExpanded}
              currentCardId={capability.currentCardId}
              isStudioActionRunning={execution.isStudioActionRunning}
              isLoadingCardProtocol={capability.isLoadingCardProtocol}
              sourceOptions={capability.sourceOptions}
              selectedSourceId={capability.selectedSourceId}
              onSelectedSourceChange={
                capability.setSelectedSourceForCurrentCard
              }
              canRefine={canRefine}
              canExecute={canExecute}
              onOpenChatRefine={execution.handleOpenChatRefine}
              onPreviewExecution={execution.handleStudioPreviewExecution}
              onLoadSources={execution.handleStudioLoadSources}
              onExecute={async () => {
                await execution.handleStudioExecute();
              }}
              currentReadiness={capability.currentReadiness}
              currentCapability={capability.currentCapability}
              supportsChatRefine={capability.supportsChatRefine}
              requiresSourceArtifact={capability.requiresSourceArtifact}
              hasSourceBinding={capability.hasSourceBinding}
              onDraftChange={handleExpandedToolDraftChange}
              toolFlowContext={toolFlowContext}
            />
          </CardContent>
        </LayoutGroup>
      </Card>

      <StudioArchiveHistoryDialog
        isOpen={isArchiveHistoryPanelOpen}
        onClose={() => setIsArchiveHistoryPanelOpen(false)}
        archivedHistory={archivedHistory}
        onUnarchiveHistoryItem={unarchiveHistoryItem}
      />
    </div>
  );
}
