"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { studioCardsApi } from "@/lib/sdk/studio-cards";
import { cn } from "@/lib/utils";
import { useProjectStore, GENERATION_TOOLS } from "@/stores/projectStore";
import { startCoursewarePptRun } from "@/stores/project-store/courseware-run";
import { resolveReadySelectedFileIds } from "@/stores/project-store/source-scope";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import { STUDIO_TOOL_COMPONENTS } from "../tools";
import type { StudioToolKey, ToolDraftState, ToolFlowContext } from "../tools";
import {
  getToolDisplayModel,
  TOOL_COLORS,
  TOOL_ICONS,
  TOOL_LABELS,
} from "../constants";
import { useStudioWorkflowHistory } from "../history/useStudioWorkflowHistory";
import { useStudioCapabilityState } from "./useStudioCapabilityState";
import { useStudioExecutionHandlers } from "./useStudioExecutionHandlers";
import { useStudioHistoryHandlers } from "./useStudioHistoryHandlers";
import { usePptHistoryStatusSync } from "./usePptHistoryStatusSync";
import { useManagedHistoryStatusSync } from "./useManagedHistoryStatusSync";
import {
  doesArtifactMatchResolvedTarget,
  isManagedLifecycleTool,
} from "./managed-target-resolver";
import { shouldForcePreviewChatStep } from "./chat-preview-step";
import type { ManagedWorkbenchState, StudioPanelProps } from "./types";
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
import type { StudioHistoryItem, StudioHistoryStatus } from "../history/types";
import type {
  CapabilityStatus,
  StudioGovernanceRubric,
  StudioWorkflowState,
} from "../tools";

function getBindingStatus(
  binding?: { status?: string | null } | null
): "ready" | "partial" | "pending" {
  if (binding?.status === "ready") return "ready";
  if (binding?.status === "partial") return "partial";
  return "pending";
}

function supportsRefineMode(
  modes: string[] | undefined,
  target: "chat_refine" | "structured_refine" | "follow_up_turn"
): boolean {
  if (!Array.isArray(modes) || modes.length === 0) return false;
  return modes.includes(target);
}

function getAuthorityBoundaryRisk(cardId: string | null): "low" | "medium" | "high" {
  switch (cardId) {
    case "courseware_ppt":
    case "word_document":
    case "interactive_games":
    case "demonstration_animations":
      return "high";
    case "speaker_notes":
    case "classroom_qa_simulator":
      return "medium";
    case "interactive_quick_quiz":
    case "knowledge_mindmap":
      return "low";
    default:
      return "medium";
  }
}

function buildWorkflowTitleSource(
  toolType: GenerationToolType,
  draft: ToolDraftState
): string {
  if (toolType === "word") {
    const topic = typeof draft.topic === "string" ? draft.topic.trim() : "";
    const outputRequirements =
      typeof draft.output_requirements === "string"
        ? draft.output_requirements.trim()
        : "";
    return JSON.stringify({
      topic,
      output_requirements: outputRequirements,
    });
  }
  if (toolType === "mindmap") {
    const topic = typeof draft.topic === "string" ? draft.topic.trim() : "";
    const outputRequirements =
      typeof draft.output_requirements === "string"
        ? draft.output_requirements.trim()
        : "";
    const sourceArtifactId =
      typeof draft.source_artifact_id === "string"
        ? draft.source_artifact_id.trim()
        : "";
    return JSON.stringify({
      topic,
      output_requirements: outputRequirements,
      source_artifact_id: sourceArtifactId,
    });
  }
  return JSON.stringify(draft);
}

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
    selectedLibraryIds,
    selectedArtifactSourceIds,
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
      selectedLibraryIds: state.selectedLibraryIds,
      selectedArtifactSourceIds: state.selectedArtifactSourceIds,
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
  const [wordViewMode, setWordViewMode] = useState<"edit" | "preview">(
    "preview"
  );
  const [mindmapViewMode, setMindmapViewMode] = useState<"edit" | "preview">(
    "preview"
  );
  const [quizViewMode, setQuizViewMode] = useState<"browse" | "edit">(
    "browse"
  );
  const [quizFocusedQuestion, setQuizFocusedQuestion] = useState<{
    index: number;
    total: number;
  } | null>(null);
  const [managedToolRunSeedByType, setManagedToolRunSeedByType] = useState<
    Partial<
      Record<StudioToolKey, { runId: string | null; sessionId: string | null }>
    >
  >({});
  const managedToolRunSeedRef = useRef<
    Partial<
      Record<StudioToolKey, { runId: string | null; sessionId: string | null }>
    >
  >({});
  const [managedWorkbenchState, setManagedWorkbenchState] =
    useState<ManagedWorkbenchState>({
      mode: "draft",
      target: null,
      draftAnchors: {},
    });
  const [wordSaveState, setWordSaveState] = useState<"idle" | "saving">("idle");

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
    deleteArchivedHistoryItem,
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

  useEffect(() => {
    managedToolRunSeedRef.current = managedToolRunSeedByType;
  }, [managedToolRunSeedByType]);
  const managedActiveRunId =
    expandedTool && expandedTool !== "ppt" ? seededRunIdForManagedTool : null;
  const isWordExpanded = expandedTool === "word";
  const isManagedHistoryMode =
    Boolean(expandedTool) &&
    expandedTool !== "ppt" &&
    managedWorkbenchState.mode === "history" &&
    managedWorkbenchState.target?.toolType === expandedTool;
  const isWordHistoryMode = isWordExpanded && isManagedHistoryMode;

  const doesManagedArtifactMatchTarget = useCallback(
    (item: {
      toolType?: string | null;
      artifactId?: string | null;
      sessionId?: string | null;
      runId?: string | null;
    }) => {
      const target = managedWorkbenchState.target;
      if (!target) return false;
      if (target.toolType && item.toolType && item.toolType !== target.toolType) {
        return false;
      }
      const kind = target.kind ?? (target.artifactId ? "pinned_artifact" : "pinned_run");
      if (target.artifactId) {
        return item.artifactId === target.artifactId;
      }
      if (kind === "pinned_run" && target.runId && target.sessionId) {
        return item.runId === target.runId && item.sessionId === target.sessionId;
      }
      return false;
    },
    [managedWorkbenchState.target]
  );

  const resetManagedDraftAnchor = useCallback((toolType: StudioToolKey) => {
    setManagedWorkbenchState((prev) => ({
      mode: "draft",
      target: null,
      draftAnchors: {
        ...prev.draftAnchors,
        [toolType]: {
          sessionId: activeSessionId ?? null,
          artifactId: null,
          runId: null,
          status: null,
        },
      },
    }));
  }, [activeSessionId]);

  const updateManagedDraftAnchor = useCallback(
    (
      toolType: StudioToolKey,
      next: {
        sessionId?: string | null;
        artifactId?: string | null;
        runId?: string | null;
        status?: StudioHistoryStatus | null;
      }
    ) => {
      setManagedWorkbenchState((prev) => ({
        mode: "draft",
        target: prev.mode === "history" ? prev.target : null,
        draftAnchors: {
          ...prev.draftAnchors,
          [toolType]: {
            sessionId: next.sessionId ?? prev.draftAnchors[toolType]?.sessionId ?? null,
            artifactId:
              next.artifactId ?? prev.draftAnchors[toolType]?.artifactId ?? null,
            runId: next.runId ?? prev.draftAnchors[toolType]?.runId ?? null,
            status: next.status ?? prev.draftAnchors[toolType]?.status ?? null,
          },
        },
      }));
    },
    []
  );

  useEffect(() => {
    if (managedWorkbenchState.mode !== "history" || !managedWorkbenchState.target) {
      return;
    }
    const targetTool = managedWorkbenchState.target.toolType;
    if (!targetTool) return;
    const toolItems =
      groupedHistory.find(([toolType]) => toolType === targetTool)?.[1] ?? [];
    const matched = toolItems.find((item) =>
      doesManagedArtifactMatchTarget({
        toolType: item.toolType,
        artifactId: item.artifactId ?? null,
        sessionId: item.sessionId ?? null,
        runId: item.runId ?? null,
      })
    );
    if (!matched) return;
    setManagedWorkbenchState((prev) => {
      if (prev.mode !== "history" || !prev.target) return prev;
      const nextTarget = {
        toolType: matched.toolType as StudioToolKey,
        sessionId: matched.sessionId ?? prev.target.sessionId,
        runId: matched.runId ?? prev.target.runId,
        artifactId: matched.artifactId ?? prev.target.artifactId,
        status: matched.status,
      };
      if (
        prev.target.sessionId === nextTarget.sessionId &&
        prev.target.runId === nextTarget.runId &&
        prev.target.artifactId === nextTarget.artifactId &&
        prev.target.status === nextTarget.status
      ) {
        return prev;
      }
      return {
        mode: "history",
        target: nextTarget,
        draftAnchors: prev.draftAnchors,
      };
    });
  }, [
    doesManagedArtifactMatchTarget,
    groupedHistory,
    managedWorkbenchState.mode,
    managedWorkbenchState.target,
  ]);

  useEffect(() => {
    if (!expandedTool) return;
    trackStep(expandedTool as GenerationToolType, "config");
  }, [expandedTool, trackStep]);

  useEffect(() => {
    trackStep("ppt", "config");
  }, [trackStep]);

  useEffect(() => {
    const handleWordSaveState = (event: Event) => {
      const customEvent = event as CustomEvent<{ status?: "idle" | "saving" }>;
      setWordSaveState(customEvent.detail?.status === "saving" ? "saving" : "idle");
    };
    window.addEventListener(
      "spectra:word:save-state",
      handleWordSaveState as EventListener
    );
    return () => {
      window.removeEventListener(
        "spectra:word:save-state",
        handleWordSaveState as EventListener
      );
    };
  }, []);

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
    generationSession,
    artifactHistoryByTool,
    draftSourceArtifactId,
    managedWorkbenchState,
  });
  const resolvedManagedTarget = capability.resolvedManagedTarget;

  const effectiveSelectedSourceId =
    capability.currentCardId === "word_document"
      ? selectedArtifactSourceIds[0] ?? capability.selectedSourceId
      : capability.selectedSourceId;
  const effectiveHasSourceBinding =
    !capability.requiresSourceArtifact ||
    Boolean(effectiveSelectedSourceId || capability.draftSourceArtifactId);
  const allowSourcelessWordHistoryRefine =
    capability.currentCardId === "word_document" &&
    isWordHistoryMode &&
    capability.activeCapabilityState.status === "backend_ready" &&
    Boolean(capability.activeCapabilityState.resolvedArtifact?.artifactId);
  const canRefineBase =
    Boolean(capability.currentCardId) &&
    !capability.isProtocolPending &&
    getBindingStatus(capability.currentExecutionPlan?.refine_binding) !==
      "pending" &&
    Boolean(
      capability.currentExecutionPlan?.supported_refine_modes?.length ??
        capability.supportsChatRefine
    ) &&
    (allowSourcelessWordHistoryRefine ||
      !capability.requiresSourceArtifact ||
      effectiveHasSourceBinding);
  const supportedRefineModes =
    capability.currentExecutionPlan?.supported_refine_modes ??
    capability.currentCapability?.supported_refine_modes ??
    [];

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
      const isExplicitRunScoped = resolvedManagedTarget?.kind === "pinned_run";
      setStudioChatContext({
        projectId: project.id,
        sessionId: targetSessionId,
        toolType: managedTool,
        toolLabel: TOOL_LABELS[managedTool],
        cardId: capability.currentCardId,
        step,
        canRefine: canRefineBase,
        isRefineMode: step === "preview" && canRefineBase,
        targetArtifactId:
          resolvedManagedTarget?.artifactId ?? latestToolArtifact?.artifactId ?? null,
        targetRunId: isExplicitRunScoped
          ? resolvedManagedTarget?.runId ?? latestToolArtifact?.runId ?? null
          : null,
        sourceArtifactId:
          effectiveSelectedSourceId ?? capability.draftSourceArtifactId ?? null,
        configSnapshot: currentToolDraft,
      });
    },
    [
      activeSessionId,
      canRefineBase,
      capability.currentCardId,
      capability.currentToolArtifacts,
      capability.draftSourceArtifactId,
      effectiveSelectedSourceId,
      currentToolDraft,
      project,
      resolvedManagedTarget,
      setStudioChatContext,
    ]
  );

  const execution = useStudioExecutionHandlers({
    project: project ? { id: project.id } : null,
    expandedTool: (expandedTool as GenerationToolType | null) ?? null,
    currentCardId: capability.currentCardId,
    seedRunId: seededRunIdForManagedTool,
    currentToolDraft,
    selectedSourceId: effectiveSelectedSourceId,
    selectedFileIds,
    selectedLibraryIds,
    selectedArtifactSourceIds,
    draftSourceArtifactId: capability.draftSourceArtifactId,
    activeSessionId,
    activeRunId:
      expandedTool === "ppt" ? activeRunId : seededRunIdForManagedTool,
    generationSession,
    isProtocolPending: capability.isProtocolPending,
    requiresSourceArtifact: capability.requiresSourceArtifact,
    hasSourceBinding: effectiveHasSourceBinding,
    canRefine: canRefineBase,
    fetchArtifactHistory,
    focusChatComposer,
    syncStudioChatContextByStep,
    upsertCurrentCardSources: capability.upsertCurrentCardSources,
    appendRuntimeArtifact: capability.appendRuntimeArtifact,
  });
  const currentDisplayToolKey =
    expandedTool && expandedTool !== "ppt"
      ? (expandedTool as StudioToolKey)
      : null;

  const canExecute =
    Boolean(capability.currentCardId) &&
    !capability.isProtocolPending &&
    getBindingStatus(capability.currentExecutionPlan?.initial_binding) !==
      "pending" &&
    effectiveHasSourceBinding;
  const canRefine = canRefineBase;
  const canFollowUpTurn =
    supportsRefineMode(supportedRefineModes, "follow_up_turn") &&
    capability.activeCapabilityState.status === "backend_ready" &&
    Boolean(capability.activeCapabilityState.resolvedArtifact?.artifactId) &&
    getBindingStatus(capability.currentExecutionPlan?.follow_up_turn_binding) !==
      "pending";
  const canRecommendPlacement =
    capability.currentCapability?.placement_supported === true &&
    capability.activeCapabilityState.status === "backend_ready" &&
    Boolean(capability.activeCapabilityState.resolvedArtifact?.artifactId) &&
    getBindingStatus(capability.currentExecutionPlan?.placement_binding) !==
      "pending";
  const canConfirmPlacement = canRecommendPlacement && Boolean(capability.selectedSourceId);
  const protocolReady =
    !capability.isProtocolPending &&
    getBindingStatus(capability.currentExecutionPlan?.initial_binding) !==
      "pending";
  const surfaceReady = capability.activeCapabilityState.status === "backend_ready";
  const executeReady = canExecute;
  const refineReady = canRefine;
  const sourceBindingReady = effectiveHasSourceBinding;
  const governanceRubric: StudioGovernanceRubric | null =
    capability.currentCardId
      ? {
          protocol_ready: protocolReady,
          surface_ready: surfaceReady,
          execute_ready: executeReady,
          refine_ready: refineReady,
          source_binding_ready: sourceBindingReady,
          authority_boundary_risk: getAuthorityBoundaryRisk(
            capability.currentCardId
          ),
        }
      : null;
  const workflowState: StudioWorkflowState = capability.isLoadingCardProtocol
    ? "idle"
    : execution.isStudioActionRunning
      ? execution.currentCardActionKind === "follow_up_turn"
        ? "continuing"
        : execution.currentCardActionKind === "refine"
          ? "refining"
          : "executing"
      : capability.activeCapabilityState.status === "backend_error"
        ? "failed"
        : !sourceBindingReady
          ? "missing_requirements"
          : capability.activeCapabilityState.status === "backend_ready"
            ? "result_available"
            : protocolReady
              ? "ready_to_execute"
              : "idle";
  const effectiveCapabilityStatus: CapabilityStatus =
    execution.isStudioActionRunning
      ? workflowState === "continuing"
        ? "continuing"
        : capability.activeCapabilityState.status === "backend_ready" && canRefine
          ? "refining"
          : "executing"
      : capability.activeCapabilityState.status === "backend_error"
        ? "backend_error"
        : !sourceBindingReady
          ? "missing_requirements"
          : !protocolReady
            ? "protocol_limited"
            : capability.activeCapabilityState.status;

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
    onManagedOpenHistoryResult: (target) => {
      setManagedWorkbenchState((prev) => ({
        mode: "history",
        target,
        draftAnchors: prev.draftAnchors,
      }));
    },
    onManagedStartNewDraft: (toolType) => {
      resetManagedDraftAnchor(toolType as StudioToolKey);
    },
  });

  usePptHistoryStatusSync({
    activeSessionId,
    activeRunId,
    groupedHistory,
    resolvePptRunId: execution.resolvePptRunId,
    recordWorkflowEntry,
  });

  useManagedHistoryStatusSync({
    projectId: project?.id ?? null,
    activeSessionId,
    groupedHistory,
    resolvedTarget:
      expandedTool && expandedTool !== "ppt" && isManagedLifecycleTool(expandedTool as StudioToolKey)
        ? resolvedManagedTarget
        : isManagedHistoryMode
          ? resolvedManagedTarget
          : null,
    fetchArtifactHistory,
    recordWorkflowEntry,
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

  const handleArchiveHistoryItem = useCallback(
    (item: Parameters<typeof archiveHistoryItem>[0]) => {
      archiveHistoryItem(item);
      if (
        item.toolType !== "ppt" &&
        managedWorkbenchState.mode === "history" &&
        doesManagedArtifactMatchTarget({
          toolType: item.toolType,
          artifactId: item.artifactId ?? null,
          sessionId: item.sessionId ?? null,
          runId: item.runId ?? null,
        })
      ) {
        setManagedWorkbenchState((prev) => ({
          mode: "draft",
          target: null,
          draftAnchors: prev.draftAnchors,
        }));
        setManagedToolRunSeedByType((prev) => ({
          ...prev,
          [item.toolType as StudioToolKey]: {
            runId: null,
            sessionId: activeSessionId ?? null,
          },
        }));
        requestStep(item.toolType as GenerationToolType, "config");
        trackStep(item.toolType as GenerationToolType, "config");
      }
    },
    [
      activeSessionId,
      archiveHistoryItem,
      doesManagedArtifactMatchTarget,
      requestStep,
      trackStep,
      managedWorkbenchState.mode,
    ]
  );

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
    const shouldForcePreviewStep = shouldForcePreviewChatStep({
      toolType: currentManagedToolType,
      isWordHistoryMode,
      isManagedHistoryMode,
      expandedTool,
      resolvedArtifactId:
        capability.activeCapabilityState.resolvedArtifact?.artifactId ?? null,
      managedTargetArtifactId: resolvedManagedTarget?.artifactId ?? null,
      managedTargetStatus: resolvedManagedTarget?.status,
    });
    const normalizedStep = shouldForcePreviewStep
      ? "preview"
      : trackedStep === "preview"
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
    capability.activeCapabilityState.resolvedArtifact?.artifactId,
    currentStepByTool,
    expandedTool,
    isExpanded,
    isManagedHistoryMode,
    isWordHistoryMode,
    project,
    pushStudioStageHint,
    resolvedManagedTarget?.artifactId,
    resolvedManagedTarget?.status,
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
  const effectiveManagedArtifacts = isManagedHistoryMode
    ? capability.currentToolArtifacts.filter((item) =>
        doesArtifactMatchResolvedTarget(item, resolvedManagedTarget)
      )
    : [];
  const effectiveResolvedArtifact =
    isManagedHistoryMode &&
    capability.activeCapabilityState.resolvedArtifact &&
    !doesArtifactMatchResolvedTarget(
      {
        toolType: expandedTool as GenerationToolType,
        artifactId: capability.activeCapabilityState.resolvedArtifact.artifactId,
        sessionId: resolvedManagedTarget?.sessionId ?? activeSessionId,
        runId: resolvedManagedTarget?.runId ?? managedActiveRunId,
      },
      resolvedManagedTarget
    )
      ? null
      : capability.activeCapabilityState.resolvedArtifact;
  const resolvedArtifactMetadata =
    effectiveResolvedArtifact?.artifactMetadata ?? null;
  const resolvedLatestRunnableState =
    resolvedArtifactMetadata &&
    typeof resolvedArtifactMetadata.latest_runnable_state === "object"
      ? (resolvedArtifactMetadata.latest_runnable_state as Record<string, unknown>)
      : null;
  const resolvedProvenance =
    resolvedArtifactMetadata &&
    typeof resolvedArtifactMetadata.provenance === "object"
      ? (resolvedArtifactMetadata.provenance as Record<string, unknown>)
      : null;
  const resolvedSourceBinding =
    resolvedArtifactMetadata &&
    typeof resolvedArtifactMetadata.source_binding === "object"
      ? (resolvedArtifactMetadata.source_binding as Record<string, unknown>)
      : null;
  const toolFlowContext: ToolFlowContext = {
    display:
      currentDisplayToolKey
        ? getToolDisplayModel(currentDisplayToolKey)
        : undefined,
    cardCapability: capability.currentCapability,
    readiness: capability.currentReadiness,
    workflowState,
    governanceRubric,
    isLoadingProtocol: capability.isLoadingCardProtocol,
    isActionRunning: execution.isStudioActionRunning,
    isProtocolPending: capability.isProtocolPending,
    requiresSourceArtifact: capability.requiresSourceArtifact,
    supportsChatRefine: capability.supportsChatRefine,
    canExecute,
    canRefine,
    canFollowUpTurn,
    canRecommendPlacement,
    canConfirmPlacement,
    followUpTurnLabel: canFollowUpTurn ? "继续追问" : undefined,
    capabilityStatus: effectiveCapabilityStatus,
    capabilityReason:
      !sourceBindingReady && capability.requiresSourceArtifact
        ? "当前卡片要求先在右侧资料来源中选择一个来源成果。"
        : !protocolReady
          ? "当前卡片协议仍有缺口，Studio 只允许显示真实可走的正式链路。"
          : capability.activeCapabilityState.reason,
    isCapabilityLoading: capability.activeCapabilityState.isLoading,
    resolvedArtifact: effectiveResolvedArtifact,
    sourceOptions: capability.sourceOptions,
    selectedSourceId: effectiveSelectedSourceId,
    requestedStep: requestedHistoryStep,
    latestArtifacts: (
      isManagedHistoryMode ? effectiveManagedArtifacts : capability.currentToolArtifacts
    ).map((item) => ({
      artifactId: item.artifactId,
      title: item.title,
      status: item.status,
      createdAt: item.createdAt,
      sourceArtifactId: item.sourceArtifactId ?? null,
      runId: item.runId ?? null,
      runNo: item.runNo ?? null,
    })),
    latestRunnableState: resolvedLatestRunnableState,
    provenance: resolvedProvenance,
    sourceBinding: resolvedSourceBinding,
    currentDraft: currentToolDraft,
    managedWorkbenchMode: isManagedHistoryMode ? "history" : "draft",
    managedResultTarget: isManagedHistoryMode ? managedWorkbenchState.target : null,
    resolvedTarget: resolvedManagedTarget,
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
        titleSource: buildWorkflowTitleSource(toolType, currentToolDraft),
        toolLabel: TOOL_LABELS[toolType],
      });
      setManagedToolRunSeedByType((prev) => ({
        ...prev,
        [toolType as StudioToolKey]: {
          runId: result.runId ?? null,
          sessionId: resolvedSessionId,
        },
      }));
      if (isManagedLifecycleTool(toolType as StudioToolKey)) {
        updateManagedDraftAnchor(toolType as StudioToolKey, {
          sessionId: resolvedSessionId,
          runId: result.runId ?? null,
          artifactId: null,
          status: "draft",
        });
      }
      managedToolRunSeedRef.current = {
        ...managedToolRunSeedRef.current,
        [toolType as StudioToolKey]: {
          runId: result.runId ?? null,
          sessionId: resolvedSessionId,
        },
      };
      syncStudioChatContextByStep(toolType, "generate", resolvedSessionId);
      return true;
    },
    onExecute: async () => {
      if (!expandedTool || expandedTool === "ppt") return false;
      const toolType = expandedTool as GenerationToolType;
      const contextSessionId = activeSessionId ?? null;
      const seededRun =
        managedToolRunSeedRef.current[toolType as StudioToolKey] ?? null;
      const seededRunId =
        seededRun?.sessionId === contextSessionId
          ? seededRun.runId
          : null;
      syncStudioChatContextByStep(toolType, "generate", contextSessionId);
      if (contextSessionId) {
        recordWorkflowEntry({
          toolType,
          title: TOOL_LABELS[toolType] + " - Generating",
          status: "processing",
          step: "preview",
          sessionId: contextSessionId,
          runId: seededRunId ?? undefined,
          titleSource: buildWorkflowTitleSource(toolType, currentToolDraft),
          toolLabel: TOOL_LABELS[toolType],
        });
      }
      const result = await execution.handleStudioExecute();
      const isLifecycleTool = isManagedLifecycleTool(toolType as StudioToolKey);
      if (result.ok) {
        const resolvedSessionId = result.effectiveSessionId ?? contextSessionId;
        const resolvedStatus =
          result.status ??
          (result.artifactId ? "previewing" : result.resourceKind === "session"
            ? "processing"
            : "previewing");
        if (isLifecycleTool) {
          updateManagedDraftAnchor(toolType as StudioToolKey, {
            sessionId: resolvedSessionId ?? null,
            runId: result.runId ?? seededRunId ?? null,
            artifactId: result.artifactId ?? null,
            status: resolvedStatus,
          });
        } else {
          setManagedWorkbenchState((prev) => ({
            mode: "history",
            target: {
              toolType: toolType as StudioToolKey,
              sessionId: resolvedSessionId ?? null,
              runId: result.runId ?? seededRunId ?? null,
              artifactId: result.artifactId ?? null,
              status: resolvedStatus,
            },
            draftAnchors: prev.draftAnchors,
          }));
        }
        if (resolvedSessionId) {
          if (!isLifecycleTool || !result.artifactId) {
            recordWorkflowEntry({
              toolType,
              title: TOOL_LABELS[toolType] + " - Preview",
              status: resolvedStatus,
              step: "preview",
              sessionId: resolvedSessionId,
              artifactId: result.artifactId ?? undefined,
              runId: result.runId ?? seededRunId ?? undefined,
              runNo: result.runNo ?? undefined,
              titleSource: buildWorkflowTitleSource(toolType, currentToolDraft),
              toolLabel: TOOL_LABELS[toolType],
            });
          }
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
      if (contextSessionId || fallbackRunId) {
        if (isLifecycleTool) {
          updateManagedDraftAnchor(toolType as StudioToolKey, {
            sessionId: contextSessionId,
            runId: fallbackRunId,
            artifactId: result.artifactId ?? null,
            status: result.status ?? "failed",
          });
        } else {
          setManagedWorkbenchState((prev) => ({
            mode: "history",
            target: {
              toolType: toolType as StudioToolKey,
              sessionId: contextSessionId,
              runId: fallbackRunId,
              artifactId: result.artifactId ?? null,
              status: result.status ?? "failed",
            },
            draftAnchors: prev.draftAnchors,
          }));
        }
      }
      if (contextSessionId && fallbackRunId) {
        recordWorkflowEntry({
          toolType,
          title: TOOL_LABELS[toolType] + " - Failed",
          status: result.status ?? "failed",
          step: "preview",
          sessionId: contextSessionId,
          artifactId: result.artifactId ?? undefined,
          runId: fallbackRunId ?? undefined,
          titleSource: buildWorkflowTitleSource(toolType, currentToolDraft),
          toolLabel: TOOL_LABELS[toolType],
        });
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
          titleSource: buildWorkflowTitleSource(toolType, currentToolDraft),
          toolLabel: TOOL_LABELS[toolType],
        });
      }
      return false;
    },
    onRefine: () => execution.handleOpenChatRefine(),
    onFollowUpTurn: (payload) =>
      execution.handleFollowUpTurn({
        artifactId: payload.artifactId,
        teacherAnswer: payload.teacherAnswer,
        turnAnchor: payload.turnAnchor,
        config: payload.config,
      }),
    onStructuredRefine: async (payload) => {
      const result = await execution.handleStructuredRefineArtifact({
        artifactId: payload.artifactId,
        message: payload.message ?? "",
        config: payload.config,
      });
      if (result.ok) {
        toast({
          title: "动画 refine 已提交",
          description: "新的动画 artifact 正在刷新。",
        });
      }
      return result.ok;
    },
    onStructuredRefineArtifact: async (payload) => {
      const result = await execution.handleStructuredRefineArtifact(payload);
      if (
        result.ok &&
        expandedTool &&
        expandedTool !== "ppt" &&
        isManagedLifecycleTool(expandedTool as StudioToolKey)
      ) {
        updateManagedDraftAnchor(expandedTool as StudioToolKey, {
          sessionId: result.effectiveSessionId ?? activeSessionId ?? null,
          artifactId: result.artifactId ?? payload.artifactId,
          runId:
            managedToolRunSeedRef.current[expandedTool as StudioToolKey]?.runId ??
            null,
          status: "previewing",
        });
      }
      return result;
    },
    onRecommendAnimationPlacement: async (payload) => {
      if (!project) return null;
      try {
        const response = await studioCardsApi.recommendAnimationPlacement({
          project_id: project.id,
          artifact_id: payload.artifactId,
          ppt_artifact_id: payload.pptArtifactId,
        });
        toast({
          title: "已生成推荐页",
          description: "你可以直接采用推荐，也可以改选其他页。",
        });
        return response?.data?.recommendation ?? null;
      } catch (error) {
        toast({
          title: "获取推荐页失败",
          description: error instanceof Error ? error.message : "请稍后重试。",
          variant: "destructive",
        });
        return null;
      }
    },
    onConfirmAnimationPlacement: async (payload) => {
      if (!project) return null;
      try {
        const response = await studioCardsApi.confirmAnimationPlacement({
          project_id: project.id,
          artifact_id: payload.artifactId,
          ppt_artifact_id: payload.pptArtifactId,
          page_numbers: payload.pageNumbers,
          slot: payload.slot,
        });
        const responseData = response?.data ?? null;
        const pptArtifact =
          responseData &&
          typeof responseData.ppt_artifact === "object" &&
          responseData.ppt_artifact
            ? (responseData.ppt_artifact as Record<string, unknown>)
            : null;
        const refreshSessionId =
          (typeof pptArtifact?.session_id === "string" &&
            pptArtifact.session_id.trim()) ||
          activeSessionId;
        if (refreshSessionId) {
          await fetchArtifactHistory(project.id, refreshSessionId);
        }
        toast({
          title: "已记录插入关系",
          description: "动画 artifact 与 PPT 页面绑定关系已更新。",
        });
        return responseData;
      } catch (error) {
        toast({
          title: "记录插入关系失败",
          description: error instanceof Error ? error.message : "请稍后重试。",
          variant: "destructive",
        });
        return null;
      }
    },
    onExportArtifact: (artifactId) => exportArtifact(artifactId),
  };

  const isWordProcessingTarget = Boolean(
    expandedTool === "word" &&
      resolvedManagedTarget?.status === "processing" &&
      !resolvedManagedTarget?.artifactId
  );
  const isMindmapExpanded = expandedTool === "mindmap";
  const isMindmapHistoryMode = isMindmapExpanded && isManagedHistoryMode;
  const isMindmapProcessingTarget = Boolean(
    expandedTool === "mindmap" &&
      resolvedManagedTarget?.status === "processing" &&
      !resolvedManagedTarget?.artifactId
  );
  const hasWordResultAnchor = Boolean(
    expandedTool === "word" && resolvedManagedTarget?.artifactId
  );
  const hasMindmapResultAnchor = Boolean(
    expandedTool === "mindmap" && resolvedManagedTarget?.artifactId
  );
  const isQuizExpanded = expandedTool === "quiz";
  const isQuizHistoryMode = isQuizExpanded && isManagedHistoryMode;
  const isQuizProcessingTarget = Boolean(
    expandedTool === "quiz" &&
      resolvedManagedTarget?.status === "processing" &&
      !resolvedManagedTarget?.artifactId
  );
  const hasQuizResultAnchor = Boolean(
    expandedTool === "quiz" && resolvedManagedTarget?.artifactId
  );
  const hasMindmapRenderableResult = hasRenderableMindmapResult(toolFlowContext);
  const hasQuizRenderableResult = Boolean(
    expandedTool === "quiz" &&
      toolFlowContext.resolvedArtifact?.contentKind === "json" &&
      Array.isArray(
        (toolFlowContext.resolvedArtifact.content as Record<string, unknown> | undefined)
          ?.questions
      ) &&
      (
        (toolFlowContext.resolvedArtifact.content as Record<string, unknown>).questions as unknown[]
      ).length > 0
  );
  const isWordHeaderActionsVisible =
    isExpanded &&
    expandedTool === "word" &&
    (isWordHistoryMode || hasWordResultAnchor) &&
    !isWordProcessingTarget;
  const isWordHeaderGenerateVisible =
    isExpanded &&
    expandedTool === "word" &&
    (!hasWordResultAnchor || isWordProcessingTarget);
  useEffect(() => {
    if (!isWordHeaderActionsVisible && !isWordHeaderGenerateVisible) return;
    setWordViewMode("preview");
    window.dispatchEvent(
      new CustomEvent("spectra:word:set-mode", {
        detail: { mode: "preview" },
      })
    );
  }, [isWordHeaderActionsVisible, isWordHeaderGenerateVisible]);
  const isMindmapHeaderModeVisible = Boolean(
    isExpanded &&
      expandedTool === "mindmap" &&
      !isMindmapProcessingTarget &&
      (isMindmapHistoryMode || hasMindmapResultAnchor || hasMindmapRenderableResult)
  );
  const isMindmapHeaderGenerateVisible = Boolean(
    isExpanded &&
      expandedTool === "mindmap" &&
      !isMindmapHeaderModeVisible
  );
  useEffect(() => {
    if (!isMindmapHeaderModeVisible && !isMindmapHeaderGenerateVisible) return;
    setMindmapViewMode("preview");
    window.dispatchEvent(
      new CustomEvent("spectra:mindmap:set-mode", {
        detail: { mode: "preview" },
      })
    );
  }, [isMindmapHeaderGenerateVisible, isMindmapHeaderModeVisible]);
  const isQuizHeaderModeVisible = Boolean(
    isExpanded &&
      expandedTool === "quiz" &&
      !isQuizProcessingTarget &&
      (isQuizHistoryMode || hasQuizResultAnchor || hasQuizRenderableResult)
  );
  const isQuizHeaderGenerateVisible = Boolean(
    isExpanded &&
      expandedTool === "quiz" &&
      !isQuizHeaderModeVisible
  );
  useEffect(() => {
    if (!isQuizHeaderModeVisible && !isQuizHeaderGenerateVisible) return;
    setQuizViewMode("browse");
    window.dispatchEvent(
      new CustomEvent("spectra:quiz:set-mode", {
        detail: { mode: "browse" },
      })
    );
  }, [isQuizHeaderGenerateVisible, isQuizHeaderModeVisible]);
  useEffect(() => {
    const handleQuizQuestionFocus = (
      event: Event
    ) => {
      const customEvent = event as CustomEvent<{ index?: number; total?: number }>;
      const index =
        typeof customEvent.detail?.index === "number" ? customEvent.detail.index : 0;
      const total =
        typeof customEvent.detail?.total === "number" ? customEvent.detail.total : 0;
      setQuizFocusedQuestion(
        index > 0 && total > 0
          ? {
              index,
              total,
            }
          : null
      );
    };
    window.addEventListener(
      "spectra:quiz:question-focus",
      handleQuizQuestionFocus as EventListener
    );
    return () => {
      window.removeEventListener(
        "spectra:quiz:question-focus",
        handleQuizQuestionFocus as EventListener
      );
    };
  }, []);

  const resolvedWordTitleFromContent = (() => {
    if (expandedTool !== "word") return null;
    const content = toolFlowContext.resolvedArtifact?.content;
    if (!content || typeof content !== "object") return null;
    const value = (content as Record<string, unknown>).title;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  })();
  const resolvedWordHeaderTitle =
    expandedTool === "word"
      ? isWordProcessingTarget
        ? "教学文档（生成中）"
        : isWordHistoryMode || hasWordResultAnchor
          ? toolFlowContext.latestArtifacts?.[0]?.title ||
            resolvedWordTitleFromContent ||
            "教学文档"
          : "教学文档"
      : null;
  const canWordHeaderSave = Boolean(
    expandedTool === "word" && toolFlowContext.resolvedArtifact?.artifactId
  );
  const canWordHeaderExport = Boolean(
    expandedTool === "word" && toolFlowContext.latestArtifacts?.[0]?.artifactId
  );
  const canWordHeaderGenerate = Boolean(
    expandedTool === "word" &&
      (effectiveSelectedSourceId ||
        (typeof currentToolDraft.output_requirements === "string" &&
          currentToolDraft.output_requirements.trim())) &&
      !isWordProcessingTarget &&
      !execution.isStudioActionRunning
  );
  const isWordHeaderGenerating = Boolean(
    expandedTool === "word" &&
      isWordHeaderGenerateVisible &&
      execution.isStudioActionRunning
  );
  const canMindmapHeaderGenerate = Boolean(
    expandedTool === "mindmap" &&
      (effectiveSelectedSourceId ||
        (typeof currentToolDraft.output_requirements === "string" &&
          currentToolDraft.output_requirements.trim())) &&
      !isMindmapProcessingTarget &&
      !execution.isStudioActionRunning
  );
  const isMindmapHeaderGenerating = Boolean(
    expandedTool === "mindmap" &&
      isMindmapHeaderGenerateVisible &&
      execution.isStudioActionRunning
  );
  const resolvedMindmapTitle =
    expandedTool === "mindmap"
      ? isMindmapProcessingTarget
        ? "思维导图（生成中）"
        : isMindmapHistoryMode || hasMindmapResultAnchor
          ? toolFlowContext.latestArtifacts?.[0]?.title || "思维导图"
          : "思维导图"
      : null;
  const resolvedQuizTitleFromContent = (() => {
    if (expandedTool !== "quiz") return null;
    const content = toolFlowContext.resolvedArtifact?.content;
    if (!content || typeof content !== "object") return null;
    const value = (content as Record<string, unknown>).title;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  })();
  const resolvedQuizTitle =
    expandedTool === "quiz"
      ? isQuizProcessingTarget
        ? "随堂小测（生成中）"
        : isQuizHistoryMode || hasQuizResultAnchor || hasQuizRenderableResult
          ? toolFlowContext.latestArtifacts?.[0]?.title ||
            resolvedQuizTitleFromContent ||
            "随堂小测"
          : "随堂小测"
      : null;
  const resolvedQuizHeaderTitle =
    expandedTool === "quiz" && quizFocusedQuestion
      ? `${resolvedQuizTitle ?? "随堂小测"} · 第 ${quizFocusedQuestion.index} / ${quizFocusedQuestion.total} 题`
      : resolvedQuizTitle;
  const canQuizHeaderGenerate = Boolean(
    expandedTool === "quiz" &&
      (effectiveSelectedSourceId ||
        (typeof currentToolDraft.scope === "string" &&
          currentToolDraft.scope.trim())) &&
      !isQuizProcessingTarget &&
      !execution.isStudioActionRunning
  );
  const isQuizHeaderGenerating = Boolean(
    expandedTool === "quiz" &&
      isQuizHeaderGenerateVisible &&
      execution.isStudioActionRunning
  );
  const resolvedHeaderTitle =
    expandedTool === "word"
      ? resolvedWordHeaderTitle
      : expandedTool === "mindmap"
        ? resolvedMindmapTitle
        : expandedTool === "quiz"
          ? resolvedQuizHeaderTitle
        : null;

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
            customTitle={resolvedHeaderTitle}
            showHeaderActions={
              isWordHeaderActionsVisible ||
              isMindmapHeaderModeVisible ||
              isQuizHeaderModeVisible
            }
            showHeaderPrimaryAction={
              isWordHeaderGenerateVisible ||
              isMindmapHeaderGenerateVisible ||
              isQuizHeaderGenerateVisible
            }
            showHeaderPersistenceActions={isWordHeaderActionsVisible}
            headerModeActionLabel={
              expandedTool === "word"
                ? wordViewMode === "preview"
                  ? "编辑"
                  : "预览"
                : expandedTool === "quiz"
                  ? quizViewMode === "browse"
                    ? "编辑"
                    : "浏览"
                : mindmapViewMode === "preview"
                  ? "编辑"
                  : "完成"
            }
            primaryActionLabel={
              expandedTool === "mindmap"
                ? isMindmapHeaderGenerating
                  ? "生成中"
                  : "一键生成导图"
                : expandedTool === "quiz"
                  ? isQuizHeaderGenerating
                    ? "生成中"
                    : "一键生成小测"
                : isWordHeaderGenerating
                  ? "生成中"
                  : "生成"
            }
            primaryActionState={
              isWordHeaderGenerating ||
              isMindmapHeaderGenerating ||
              isQuizHeaderGenerating
                ? "loading"
                : "idle"
            }
            primaryActionDisabled={
              expandedTool === "mindmap"
                ? !canMindmapHeaderGenerate
                : expandedTool === "quiz"
                  ? !canQuizHeaderGenerate
                : expandedTool === "word"
                  ? !canWordHeaderGenerate
                  : true
            }
            onHeaderSwitchMode={() => {
              if (expandedTool === "word") {
                const nextMode =
                  wordViewMode === "preview" ? "edit" : "preview";
                setWordViewMode(nextMode);
                window.dispatchEvent(
                  new CustomEvent("spectra:word:set-mode", {
                    detail: { mode: nextMode },
                  })
                );
                return;
              }
              if (expandedTool === "mindmap") {
                const nextMode =
                  mindmapViewMode === "preview" ? "edit" : "preview";
                setMindmapViewMode(nextMode);
                window.dispatchEvent(
                  new CustomEvent("spectra:mindmap:set-mode", {
                    detail: { mode: nextMode },
                  })
                );
                return;
              }
              if (expandedTool === "quiz") {
                const nextMode = quizViewMode === "browse" ? "edit" : "browse";
                setQuizViewMode(nextMode);
                window.dispatchEvent(
                  new CustomEvent("spectra:quiz:set-mode", {
                    detail: { mode: nextMode },
                  })
                );
              }
            }}
            onHeaderPrimaryAction={() => {
              if (expandedTool === "word") {
                window.dispatchEvent(new CustomEvent("spectra:word:generate"));
                return;
              }
              if (expandedTool === "mindmap") {
                window.dispatchEvent(
                  new CustomEvent("spectra:mindmap:generate")
                );
                return;
              }
              if (expandedTool === "quiz") {
                window.dispatchEvent(new CustomEvent("spectra:quiz:generate"));
              }
            }}
            canWordSave={canWordHeaderSave}
            canWordExport={canWordHeaderExport}
            wordSaveState={wordSaveState}
            onWordSave={() => {
              window.dispatchEvent(new CustomEvent("spectra:word:save"));
            }}
            onWordExport={() => {
              window.dispatchEvent(new CustomEvent("spectra:word:export"));
            }}
          />
          <CardContent
            className={cn(
              "relative h-[calc(100%-52px)] overflow-hidden p-0"
            )}
          >
            <StudioCollapsedView
              isExpanded={isExpanded}
              hoveredToolId={hoveredToolId}
              onHoveredToolIdChange={setHoveredToolId}
              onToolClick={historyHandlers.handleToolClick}
              hasHistory={hasHistory}
              groupedHistory={groupedHistory}
              currentCardId={capability.currentCardId}
              selectedSourceId={effectiveSelectedSourceId}
              latestArtifacts={toolFlowContext.latestArtifacts ?? []}
              projectId={project?.id ?? null}
              activeSessionId={activeSessionId}
              fetchArtifactHistory={fetchArtifactHistory}
              onOpenHistoryItem={historyHandlers.handleOpenHistoryItem}
              onArchiveHistoryItem={handleArchiveHistoryItem}
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
                  if (!runId) return;
                  trackStep("ppt", "outline");
                  acknowledgeStep("ppt", "outline");
                  recordWorkflowEntry({
                    toolType: "ppt",
                    title: "课件大纲",
                    status: "draft",
                    step: "outline",
                    ppt_status: "outline_generating",
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
                  const runId = payload?.runId || undefined;
                  if (!runId) return;
                  trackStep("ppt", "preview");
                  acknowledgeStep("ppt", "preview");
                  recordWorkflowEntry({
                    toolType: "ppt",
                    title: "课件生成",
                    status: "processing",
                    step: "preview",
                    ppt_status: "slides_generating",
                    sessionId: resolvedSessionId,
                    runId,
                    toolLabel: TOOL_LABELS.ppt,
                  });
                  return;
                }
                trackStep("ppt", "outline");
                acknowledgeStep("ppt", "outline");
                const runId = payload?.runId || undefined;
                if (!runId) return;
                recordWorkflowEntry({
                  toolType: "ppt",
                  title: "课件大纲",
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
	                if (!liveSessionId) {
	                  toast({
	                    title: "请先选择会话",
	                    description:
	                      "执行 Studio 卡片前，请先在会话选择器中创建或切换到目标会话。",
	                    variant: "destructive",
	                  });
	                  throw new Error("Missing active session for courseware execution");
	                }
	                const liveRunId =
	                  liveStoreState.activeRunId ?? activeRunId ?? undefined;
                const readySelectedFileIds = resolveReadySelectedFileIds(
                  files,
                  selectedFileIds
                );
                const execution = await startCoursewarePptRun({
                  projectId: project.id,
                  clientSessionId: liveSessionId,
                  runId: liveRunId,
                  ragSourceIds: readySelectedFileIds,
                  selectedLibraryIds,
                  config,
                  teachingBrief: generationSession?.teaching_brief ?? undefined,
                });
                sessionId = execution.sessionId;
                runId = execution.runId;

	                if (!sessionId) {
	                  throw new Error(
	                    "Missing session_id in courseware execution result"
	                  );
	                }
	                if (sessionId !== liveSessionId) {
	                  console.warn("[studio.session_mismatch]", {
	                    card_id: "courseware_ppt",
	                    action: "execute",
	                    expected_session_id: liveSessionId,
	                    returned_session_id: sessionId,
	                    mismatch_reason:
	                      "response_session_differs_from_active_session",
	                  });
	                  toast({
	                    title: "会话不一致，已阻断执行",
	                    description: "返回会话与当前会话不一致，请刷新后重试。",
	                    variant: "destructive",
	                  });
	                  throw new Error("Session mismatch in courseware execution result");
	                }

	                if (!runId) {
	                  throw new Error(
	                    "Missing run.run_id in courseware execution result"
	                  );
	                }
	                const resolvedRunId = runId;

	                useProjectStore.setState({
	                  activeRunId: resolvedRunId,
	                });
                recordWorkflowEntry({
                  toolType: "ppt",
                  title: "课件大纲",
                  status: "draft",
                  step: "outline",
                  ppt_status: "outline_generating",
                  sessionId,
                  runId: resolvedRunId,
                  toolLabel: TOOL_LABELS.ppt,
                });
                void fetchArtifactHistory(project.id, sessionId);
                return {
                  sessionId,
                  runId: resolvedRunId,
                };
              }}
              isCardManagedFlowExpanded={isCardManagedFlowExpanded}
              currentCardId={capability.currentCardId}
              isStudioActionRunning={execution.isStudioActionRunning}
              isLoadingCardProtocol={capability.isLoadingCardProtocol}
              sourceOptions={capability.sourceOptions}
              selectedSourceId={effectiveSelectedSourceId}
              onSelectedSourceChange={
                capability.setSelectedSourceForCurrentCard
              }
              canRefine={canRefine}
              canExecute={canExecute}
              onOpenChatRefine={execution.handleOpenChatRefine}
              onPreviewExecution={async () => {
                await execution.handleStudioPreviewExecution();
              }}
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
        onDeleteHistoryItem={deleteArchivedHistoryItem}
      />
    </div>
  );
}
