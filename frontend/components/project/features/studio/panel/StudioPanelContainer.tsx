"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGroup } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardContent } from "@/components/ui/card";
import { studioCardsApi } from "@/lib/sdk/studio-cards";
import { cn } from "@/lib/utils";
import { useProjectStore, GENERATION_TOOLS } from "@/stores/projectStore";
import { resolveReadySelectedFileIds } from "@/stores/project-store/source-scope";
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
  isPptStep2Stage,
  normalizeHistoryStep,
  toStudioManagedTool,
} from "./utils";
import { StudioPanelHeader } from "./components/StudioPanelHeader";
import { StudioCollapsedView } from "./components/StudioCollapsedView";
import { StudioExpandedView } from "./components/StudioExpandedView";
import { StudioArchiveHistoryDialog } from "./components/StudioArchiveHistoryDialog";
import type { StudioHistoryItem } from "../history/types";

function extractSessionIdFromExecutionResult(
  executionResult: Record<string, unknown>
): string | null {
  const session =
    typeof executionResult.session === "object" &&
    executionResult.session !== null
      ? (executionResult.session as Record<string, unknown>)
      : null;
  return (
    (typeof session?.session_id === "string" && session.session_id) ||
    (typeof session?.id === "string" && session.id) ||
    null
  );
}

function extractRunIdFromExecutionResult(
  executionResult: Record<string, unknown>
): string | null {
  const directRunId = executionResult.run_id;
  if (typeof directRunId === "string" && directRunId.trim()) {
    return directRunId;
  }

  const run =
    typeof executionResult.run === "object" && executionResult.run !== null
      ? (executionResult.run as Record<string, unknown>)
      : null;
  const runRunId =
    (typeof run?.run_id === "string" && run.run_id) ||
    (typeof run?.id === "string" && run.id) ||
    null;
  if (runRunId && runRunId.trim()) {
    return runRunId;
  }

  const currentRun =
    typeof executionResult.current_run === "object" &&
    executionResult.current_run !== null
      ? (executionResult.current_run as Record<string, unknown>)
      : null;
  const currentRunId =
    (typeof currentRun?.run_id === "string" && currentRun.run_id) ||
    (typeof currentRun?.id === "string" && currentRun.id) ||
    null;
  if (currentRunId && currentRunId.trim()) {
    return currentRunId;
  }

  const session =
    typeof executionResult.session === "object" &&
    executionResult.session !== null
      ? (executionResult.session as Record<string, unknown>)
      : null;
  const sessionCurrentRun =
    typeof session?.current_run === "object" && session.current_run !== null
      ? (session.current_run as Record<string, unknown>)
      : null;
  const sessionCurrentRunId =
    (typeof sessionCurrentRun?.run_id === "string" &&
      sessionCurrentRun.run_id) ||
    (typeof sessionCurrentRun?.id === "string" && sessionCurrentRun.id) ||
    null;
  return sessionCurrentRunId && sessionCurrentRunId.trim()
    ? sessionCurrentRunId
    : null;
}

function mapVisualStyleToDiegoPreset(styleId: string): string {
  const normalized = String(styleId || "")
    .trim()
    .toLowerCase();
  const mapping: Record<string, string> = {
    free: "auto",
    wabi: "wabi-sabi",
    brutalist: "neo-brutalism",
    electro: "electro-pop",
    geometric: "geo-bold",
    modernacademic: "contemporary-academic",
    curatorial: "academic-curation",
    warmvc: "warm-vc",
    coolblue: "rational-blue",
    nordic: "nordic-research",
    fluid: "emotional-flow",
    cinema: "cinema-minimal",
    "8bit": "8bit",
  };
  return mapping[normalized] || normalized || "auto";
}

export function StudioPanelContainer({
  onToolClick,
  onPptStep2LayoutChange,
  className,
  style,
  ...props
}: StudioPanelProps) {
  const {
    project,
    files,
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
    setStudioChatContext,
    pushStudioHintMessage,
    focusChatComposer,
  } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      files: state.files,
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
  const [managedToolRunSeedByType, setManagedToolRunSeedByType] = useState<
    Partial<
      Record<StudioToolKey, { runId: string | null; sessionId: string | null }>
    >
  >({});

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
  const seededRunIdForManagedTool = useMemo(() => {
    if (!expandedTool || expandedTool === "ppt") return null;
    const explicitSeed =
      managedToolRunSeedByType[expandedTool as StudioToolKey];
    if (
      explicitSeed?.sessionId === activeSessionId &&
      typeof explicitSeed.runId === "string" &&
      explicitSeed.runId.trim()
    ) {
      return explicitSeed.runId;
    }
    return null;
  }, [activeSessionId, expandedTool, managedToolRunSeedByType]);
  const managedActiveRunId =
    expandedTool && expandedTool !== "ppt" ? seededRunIdForManagedTool : null;

  useEffect(() => {
    if (!expandedTool) return;
    trackStep(expandedTool as GenerationToolType, "config");
  }, [expandedTool, trackStep]);

  useEffect(() => {
    trackStep("ppt", "config");
  }, [trackStep]);

  useEffect(() => {
    if (!onPptStep2LayoutChange) return;
    if (!isExpanded || expandedTool !== "ppt") {
      onPptStep2LayoutChange(false);
    }
  }, [expandedTool, isExpanded, onPptStep2LayoutChange]);

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
    activeRunId: managedActiveRunId,
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
      const latestToolArtifact = capability.currentToolArtifacts[0];
      setStudioChatContext({
        projectId: project.id,
        sessionId: targetSessionId,
        toolType: managedTool,
        toolLabel: TOOL_LABELS[managedTool],
        cardId: capability.currentCardId,
        step,
        canRefine: canRefineBase,
        isRefineMode: step === "preview" && canRefineBase,
        targetArtifactId: latestToolArtifact?.artifactId ?? null,
        targetRunId: latestToolArtifact?.runId ?? null,
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
      capability.currentToolArtifacts,
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
    seedRunId: seededRunIdForManagedTool,
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
    fetchArtifactHistory,
    focusChatComposer,
    syncStudioChatContextByStep,
    upsertCurrentCardSources: capability.upsertCurrentCardSources,
    appendRuntimeArtifact: capability.appendRuntimeArtifact,
  });

  const canExecute =
    Boolean(capability.currentCardId) &&
    !capability.isProtocolPending &&
    (!capability.requiresSourceArtifact || capability.hasSourceBinding);
  const canRefine = canRefineBase;

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
    setManagedToolRunSeed: (tool, runId, sessionId) => {
      setManagedToolRunSeedByType((prev) => ({
        ...prev,
        [tool]: {
          runId,
          sessionId: sessionId ?? activeSessionId ?? null,
        },
      }));
    },
    onToolClick,
    trackStep,
    requestStep,
    acknowledgeStep,
    recordWorkflowEntry,
    syncStudioChatContextByStep,
    pushStudioStageHint,
  });

  useEffect(() => {
    const handleOpenHistoryItemFromChat = (event: Event) => {
      const customEvent = event as CustomEvent<StudioHistoryItem>;
      const item = customEvent.detail;
      if (!item || typeof item !== "object") return;
      void historyHandlers.handleOpenHistoryItem(item);
    };
    window.addEventListener(
      "spectra:open-history-item",
      handleOpenHistoryItemFromChat as EventListener
    );
    return () => {
      window.removeEventListener(
        "spectra:open-history-item",
        handleOpenHistoryItemFromChat as EventListener
      );
    };
  }, [historyHandlers]);

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
      sourceArtifactId: item.sourceArtifactId ?? null,
      runId: item.runId ?? null,
      runNo: item.runNo ?? null,
    })),
    onStepChange: historyHandlers.handleManagedToolStepChange,
    onSelectedSourceChange: (sourceId) => {
      capability.setSelectedSourceForCurrentCard(sourceId);
    },
    onLoadSources: () => execution.handleStudioLoadSources(),
    onPreviewExecution: () => execution.handleStudioPreviewExecution(),
    onPrepareGenerate: async () => {
      if (!expandedTool || expandedTool === "ppt") return false;
      const toolType = expandedTool as GenerationToolType;
      const contextSessionId = activeSessionId ?? null;
      const result = await execution.handleStudioPrepareDraft();
      if (!result.ok) return false;
      const resolvedSessionId = result.effectiveSessionId ?? contextSessionId;
      if (!resolvedSessionId) return false;

      recordWorkflowEntry({
        toolType,
        title: TOOL_LABELS[toolType] + " - Draft",
        status: "draft",
        step: "generate",
        sessionId: resolvedSessionId,
        runId: result.runId ?? undefined,
        runNo: result.runNo ?? undefined,
        titleSource: JSON.stringify(currentToolDraft),
        toolLabel: TOOL_LABELS[toolType],
      });
      setManagedToolRunSeedByType((prev) => ({
        ...prev,
        [toolType as StudioToolKey]: {
          runId: result.runId ?? null,
          sessionId: resolvedSessionId,
        },
      }));
      syncStudioChatContextByStep(toolType, "generate", resolvedSessionId);
      return true;
    },
    onExecute: async () => {
      if (!expandedTool || expandedTool === "ppt") return false;
      const toolType = expandedTool as GenerationToolType;
      const contextSessionId = activeSessionId ?? null;
      const seededRun =
        managedToolRunSeedByType[toolType as StudioToolKey] ?? null;
      const seededRunId =
        seededRun?.sessionId === contextSessionId ? seededRun.runId : null;
      syncStudioChatContextByStep(toolType, "generate", contextSessionId);
      if (contextSessionId) {
        recordWorkflowEntry({
          toolType,
          title: TOOL_LABELS[toolType] + " - Generating",
          status: "processing",
          step: "preview",
          sessionId: contextSessionId,
          runId: seededRunId ?? undefined,
          titleSource: JSON.stringify(currentToolDraft),
          toolLabel: TOOL_LABELS[toolType],
        });
      }
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
            runId: result.runId ?? seededRunId ?? undefined,
            runNo: result.runNo ?? undefined,
            titleSource: JSON.stringify(currentToolDraft),
            toolLabel: TOOL_LABELS[toolType],
          });
          setManagedToolRunSeedByType((prev) => ({
            ...prev,
            [toolType as StudioToolKey]: {
              runId: result.runId ?? null,
              sessionId: resolvedSessionId,
            },
          }));
          syncStudioChatContextByStep(toolType, "preview", resolvedSessionId);
          pushStudioStageHint(toolType, "preview", resolvedSessionId);
        }
        return true;
      }
      const fallbackRunId = result.runId ?? seededRunId ?? null;
      if (contextSessionId && fallbackRunId) {
        syncStudioChatContextByStep(toolType, "preview", contextSessionId);
        pushStudioStageHint(toolType, "preview", contextSessionId);
        return true;
      }
      if (contextSessionId) {
        recordWorkflowEntry({
          toolType,
          title: TOOL_LABELS[toolType] + " - Failed",
          status: "failed",
          step: "generate",
          sessionId: contextSessionId,
          runId: seededRunId ?? undefined,
          titleSource: JSON.stringify(currentToolDraft),
          toolLabel: TOOL_LABELS[toolType],
        });
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
                onPptStep2LayoutChange?.(isPptStep2Stage(stage));
                if (stage === "config") {
                  trackStep("ppt", "config");
                  acknowledgeStep("ppt");
                  return;
                }
                if (stage === "generating_outline") {
                  const resolvedSessionId =
                    payload?.sessionId ?? activeSessionId ?? null;
                  if (!resolvedSessionId) return;
                  const runId = payload?.runId || undefined;
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
                    payload?.runId ||
                    useProjectStore.getState().activeRunId ||
                    execution.resolvePptRunId() ||
                    undefined;
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
                const runId = payload?.runId || undefined;
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

                let sessionId: string | null = null;
                let runId: string | null = null;
                const liveStoreState = useProjectStore.getState();
                const liveSessionId =
                  liveStoreState.activeSessionId ??
                  activeSessionId ??
                  undefined;
                const liveRunId = liveStoreState.activeRunId ?? undefined;
                const readySelectedFileIds = resolveReadySelectedFileIds(
                  files,
                  selectedFileIds
                );
                const generationMode =
                  config.layoutMode === "classic" ? "template" : "scratch";
                const templateId =
                  generationMode === "template"
                    ? (config.templateId ?? undefined)
                    : undefined;
                const stylePreset =
                  generationMode === "scratch"
                    ? mapVisualStyleToDiegoPreset(config.visualStyle)
                    : "auto";
                const executeResponse = await studioCardsApi.execute(
                  "courseware_ppt",
                  {
                    project_id: project.id,
                    client_session_id: liveSessionId,
                    run_id: liveRunId,
                    rag_source_ids:
                      readySelectedFileIds.length > 0
                        ? readySelectedFileIds
                        : undefined,
                    template_config: {
                      style: "teach",
                      template_id: "document-teaching",
                    },
                    config: {
                      topic: config.prompt,
                      template: "teach",
                      pages: Number(config.pageCount) || 15,
                      generation_mode: generationMode,
                      template_id: templateId,
                      style_preset: stylePreset,
                      visual_policy: config.visualPolicy,
                      audience: "intermediate",
                      include_animations: false,
                      include_games: false,
                      system_prompt_tone: [
                        `[outline_style=${config.outlineStyle}]`,
                        config.prompt,
                        "Keep a clear teaching structure and slide pacing.",
                      ].join("\n"),
                    },
                  }
                );
                const executionResult =
                  (executeResponse?.data?.execution_result as Record<
                    string,
                    unknown
                  >) ?? {};
                sessionId =
                  extractSessionIdFromExecutionResult(executionResult);
                runId = extractRunIdFromExecutionResult(executionResult);

                if (!sessionId) {
                  throw new Error(
                    "Missing session_id in courseware execution result"
                  );
                }

                if (sessionId) {
                  setActiveSessionId(sessionId);
                  if (runId) {
                    setActiveRunId(runId);
                  }
                  void fetchArtifactHistory(project.id, sessionId);
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
