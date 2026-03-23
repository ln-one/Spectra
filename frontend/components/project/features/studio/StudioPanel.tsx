"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArchiveRestore, Sparkles, X } from "lucide-react";
import { useProjectStore, GENERATION_TOOLS } from "@/stores/projectStore";
import type { StudioManagedTool } from "@/stores/project-store/types";
import { useShallow } from "zustand/react/shallow";
import { generateApi, projectSpaceApi, studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import type {
  ArtifactHistoryItem,
  GenerationToolType,
} from "@/lib/project-space/artifact-history";
import type {
  StudioCardCapability,
  StudioCardExecutionPlan,
} from "@/lib/sdk/studio-cards";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { GenerationConfigPanel } from "@/components/project";
import { STUDIO_TOOL_COMPONENTS } from "./tools";
import type { StudioToolKey, ToolDraftState, ToolFlowContext } from "./tools";
import {
  ICON_LAYOUT_TRANSITION,
  TOOL_COLORS,
  TOOL_ICONS,
  TOOL_LABELS,
  type StudioTool,
} from "./constants";
import { useStudioWorkflowHistory } from "./history/useStudioWorkflowHistory";
import type { StudioHistoryItem, StudioHistoryStep } from "./history/types";
import { SessionArtifacts } from "./components/SessionArtifacts";
import { ToolGrid } from "./components/ToolGrid";
import {
  buildCapabilityWithoutArtifact,
  resolveCapabilityFromArtifact,
  type CapabilityResolution,
} from "./tools/capability-resolver";

interface StudioPanelProps {
  onToolClick?: (tool: StudioTool) => void;
}

const STUDIO_CARD_BY_TOOL: Partial<Record<StudioToolKey, string>> = {
  word: "word_document",
  mindmap: "knowledge_mindmap",
  outline: "interactive_games",
  quiz: "interactive_quick_quiz",
  summary: "speaker_notes",
  animation: "demonstration_animations",
  handout: "classroom_qa_simulator",
};

const DEFAULT_CAPABILITY_PENDING_REASON =
  "正在检测后端能力状态，当前先展示前端示意内容。";
const STUDIO_RUNTIME_ARTIFACTS_STORAGE_PREFIX =
  "spectra:studio:runtime-artifacts";

function isDraftStateEqual(
  left: ToolDraftState | undefined,
  right: ToolDraftState
): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every((key) => {
    const lv = left[key];
    const rv = right[key];
    if (Array.isArray(lv) && Array.isArray(rv)) {
      if (lv.length !== rv.length) return false;
      return lv.every((item, idx) => item === rv[idx]);
    }
    return lv === rv;
  });
}

function normalizeHistoryStep(
  stepId: string | null | undefined
): StudioHistoryStep {
  if (
    stepId === "config" ||
    stepId === "generate" ||
    stepId === "preview" ||
    stepId === "outline"
  ) {
    return stepId;
  }
  return "config";
}

function toStudioManagedTool(
  toolType: GenerationToolType
): StudioManagedTool | null {
  if (toolType === "ppt") return null;
  return toolType as StudioManagedTool;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function StudioPanel({ onToolClick }: StudioPanelProps) {
  const router = useRouter();
  const {
    project,
    layoutMode,
    expandedTool,
    artifactHistoryByTool,
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
  const [isStudioActionRunning, setIsStudioActionRunning] = useState(false);
  const [selectedSourceByCard, setSelectedSourceByCard] = useState<
    Record<string, string | null>
  >({});
  const [sourceOptionsByCard, setSourceOptionsByCard] = useState<
    Record<string, Array<{ id: string; title?: string; type?: string }>>
  >({});
  const [cardCapabilitiesById, setCardCapabilitiesById] = useState<
    Record<string, StudioCardCapability>
  >({});
  const [executionPlanByCardId, setExecutionPlanByCardId] = useState<
    Record<string, StudioCardExecutionPlan>
  >({});
  const [isLoadingCardProtocol, setIsLoadingCardProtocol] = useState(false);
  const [capabilityStateByCardId, setCapabilityStateByCardId] = useState<
    Record<
      string,
      CapabilityResolution & {
        isLoading: boolean;
      }
    >
  >({});
  const [pptResumeStage, setPptResumeStage] = useState<"config" | "outline">(
    "config"
  );
  const [pptResumeSignal, setPptResumeSignal] = useState(0);
  const [isArchiveHistoryPanelOpen, setIsArchiveHistoryPanelOpen] =
    useState(false);
  const [runtimeArtifactsByTool, setRuntimeArtifactsByTool] = useState<
    Partial<Record<StudioToolKey, ArtifactHistoryItem[]>>
  >({});
  const workflowRunIdByToolRef = useRef<
    Partial<Record<GenerationToolType, string>>
  >({});
  const artifactRefreshTimersRef = useRef<number[]>([]);
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
  const runtimeArtifactStorageKey =
    project?.id && activeSessionId
      ? `${STUDIO_RUNTIME_ARTIFACTS_STORAGE_PREFIX}:${project.id}:${activeSessionId}`
      : null;
  const requestedHistoryStep = expandedTool
    ? (requestedStepByTool[expandedTool as GenerationToolType] ?? null)
    : null;

  const createWorkflowRunId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const startWorkflowRun = useCallback(
    (toolType: GenerationToolType) => {
      const runId = createWorkflowRunId();
      workflowRunIdByToolRef.current[toolType] = runId;
      return runId;
    },
    [createWorkflowRunId]
  );

  const getCurrentWorkflowRun = useCallback((toolType: GenerationToolType) => {
    return workflowRunIdByToolRef.current[toolType] ?? null;
  }, []);

  const scheduleArtifactRefresh = useCallback(
    (projectId: string, sessionId: string | null) => {
      if (!sessionId) return;
      for (const timer of artifactRefreshTimersRef.current) {
        window.clearTimeout(timer);
      }
      artifactRefreshTimersRef.current = [];
      const delays = [2000, 5000, 10000, 16000, 24000];
      for (const delay of delays) {
        const timerId = window.setTimeout(() => {
          void fetchArtifactHistory(projectId, sessionId);
        }, delay);
        artifactRefreshTimersRef.current.push(timerId);
      }
    },
    [fetchArtifactHistory]
  );

  const resolvePptRunId = useCallback(
    (fallback?: string | null) => {
      const stateRunId = activeRunId;
      if (stateRunId) return stateRunId;
      const sessionRunId = (
        generationSession as { current_run?: { run_id?: string } } | null
      )?.current_run?.run_id;
      if (sessionRunId) return sessionRunId;
      return fallback ?? null;
    },
    [activeRunId, generationSession]
  );

  useEffect(() => {
    if (!runtimeArtifactStorageKey) {
      setRuntimeArtifactsByTool({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(runtimeArtifactStorageKey);
      if (!raw) {
        setRuntimeArtifactsByTool({});
        return;
      }
      const parsed = JSON.parse(raw) as Partial<
        Record<StudioToolKey, ArtifactHistoryItem[]>
      >;
      setRuntimeArtifactsByTool(parsed ?? {});
    } catch {
      setRuntimeArtifactsByTool({});
    }
  }, [runtimeArtifactStorageKey]);

  useEffect(() => {
    if (!runtimeArtifactStorageKey) return;
    try {
      window.localStorage.setItem(
        runtimeArtifactStorageKey,
        JSON.stringify(runtimeArtifactsByTool)
      );
    } catch {
      // Ignore local storage persistence failures.
    }
  }, [runtimeArtifactStorageKey, runtimeArtifactsByTool]);

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
  useEffect(() => {
    return () => {
      for (const timer of artifactRefreshTimersRef.current) {
        window.clearTimeout(timer);
      }
      artifactRefreshTimersRef.current = [];
    };
  }, []);
  const currentTool = GENERATION_TOOLS.find(
    (tool) => tool.type === expandedTool
  );
  const CurrentIcon = currentTool ? TOOL_ICONS[currentTool.id] : Sparkles;
  const currentColor = currentTool
    ? TOOL_COLORS[currentTool.id]
    : TOOL_COLORS.ppt;
  const ExpandedToolComponent =
    expandedTool && expandedTool !== "ppt"
      ? STUDIO_TOOL_COMPONENTS[expandedTool as StudioToolKey]
      : null;
  const currentCardId =
    expandedTool && expandedTool !== "ppt"
      ? (STUDIO_CARD_BY_TOOL[expandedTool as StudioToolKey] ?? null)
      : null;
  const currentToolDraft = useMemo(
    () =>
      expandedTool && expandedTool !== "ppt"
        ? toolDrafts[expandedTool as StudioToolKey] || {}
        : {},
    [expandedTool, toolDrafts]
  );
  const currentCapability = currentCardId
    ? (cardCapabilitiesById[currentCardId] ?? null)
    : null;
  const currentExecutionPlan = currentCardId
    ? (executionPlanByCardId[currentCardId] ?? null)
    : null;
  const selectedSourceId = currentCardId
    ? (selectedSourceByCard[currentCardId] ?? null)
    : null;
  const draftSourceArtifactId =
    typeof currentToolDraft.source_artifact_id === "string"
      ? currentToolDraft.source_artifact_id
      : null;
  const requiresSourceArtifact =
    currentCapability?.requires_source_artifact ?? false;
  const supportsChatRefine = currentCapability?.supports_chat_refine ?? true;
  const currentReadiness =
    currentExecutionPlan?.readiness ?? currentCapability?.readiness ?? null;
  const isProtocolPending = currentReadiness === "protocol_pending";
  const hasSourceBinding = Boolean(selectedSourceId || draftSourceArtifactId);
  const canExecute =
    Boolean(currentCardId) &&
    !isStudioActionRunning &&
    !isProtocolPending &&
    (!requiresSourceArtifact || hasSourceBinding);
  const canRefine =
    Boolean(currentCardId) &&
    !isStudioActionRunning &&
    !isProtocolPending &&
    supportsChatRefine &&
    (!requiresSourceArtifact || hasSourceBinding);
  const currentToolArtifacts = useMemo(() => {
    if (!expandedTool || expandedTool === "ppt") {
      return [];
    }
    const fromStore =
      artifactHistoryByTool[
        expandedTool as keyof typeof artifactHistoryByTool
      ] ?? [];
    const fromRuntime = runtimeArtifactsByTool[expandedTool as StudioToolKey] ?? [];
    if (fromRuntime.length === 0) {
      return fromStore;
    }
    const mergedById = new Map<string, ArtifactHistoryItem>();
    for (const item of [...fromStore, ...fromRuntime]) {
      if (!mergedById.has(item.artifactId)) {
        mergedById.set(item.artifactId, item);
      }
    }
    return [...mergedById.values()].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  }, [artifactHistoryByTool, expandedTool, runtimeArtifactsByTool]);
  const currentCapabilityState = currentCardId
    ? capabilityStateByCardId[currentCardId]
    : undefined;
  const fallbackCapabilityState = useMemo(() => {
    if (!expandedTool || expandedTool === "ppt") {
      return {
        status: "backend_placeholder" as const,
        reason: DEFAULT_CAPABILITY_PENDING_REASON,
        resolvedArtifact: null,
        isLoading: false,
      };
    }
    const defaultResolution = buildCapabilityWithoutArtifact(
      expandedTool as StudioToolKey
    );
    return {
      ...defaultResolution,
      isLoading: defaultResolution.status !== "backend_not_implemented",
    };
  }, [expandedTool]);
  const activeCapabilityState = currentCapabilityState ?? fallbackCapabilityState;
  const currentManagedToolType =
    expandedTool && expandedTool !== "ppt"
      ? toStudioManagedTool(expandedTool as GenerationToolType)
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
      const dedupeKey = `${sessionId}:${managedTool}:${stage}`;
      pushStudioHintMessage({
        projectId: project.id,
        sessionId,
        toolType: managedTool,
        stage,
        dedupeKey,
        toolLabel: TOOL_LABELS[managedTool],
      });
    },
    [project, pushStudioHintMessage]
  );

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
      if (!managedTool || !currentCardId) {
        setStudioChatContext(null);
        return;
      }

      const targetSessionId = sessionId ?? activeSessionId ?? null;
      if (!targetSessionId) {
        setStudioChatContext(null);
        return;
      }

      const refineMode = step === "preview" && Boolean(canRefine);
      setStudioChatContext({
        projectId: project.id,
        sessionId: targetSessionId,
        toolType: managedTool,
        toolLabel: TOOL_LABELS[managedTool],
        cardId: currentCardId,
        step,
        canRefine: Boolean(canRefine),
        isRefineMode: refineMode,
        sourceArtifactId: selectedSourceId ?? draftSourceArtifactId ?? null,
        configSnapshot: currentToolDraft,
      });
    },
    [
      project,
      currentCardId,
      activeSessionId,
      canRefine,
      selectedSourceId,
      draftSourceArtifactId,
      currentToolDraft,
      setStudioChatContext,
    ]
  );
  useEffect(() => {
    if (!project || !isExpanded || !currentManagedToolType || !currentCardId) {
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
    project,
    isExpanded,
    currentManagedToolType,
    currentCardId,
    currentStepByTool,
    activeSessionId,
    syncStudioChatContextByStep,
    pushStudioStageHint,
    setStudioChatContext,
  ]);
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
    if (!currentCardId) return;
    if (currentCapability && currentExecutionPlan) {
      return;
    }

    let cancelled = false;
    const loadCardProtocol = async () => {
      try {
        setIsLoadingCardProtocol(true);
        const [detailResponse, planResponse] = await Promise.all([
          studioCardsApi.getCard(currentCardId),
          studioCardsApi.getExecutionPlan(currentCardId),
        ]);
        if (cancelled) return;
        if (detailResponse?.data?.studio_card) {
          setCardCapabilitiesById((prev) => ({
            ...prev,
            [currentCardId]: detailResponse.data.studio_card,
          }));
        }
        if (planResponse?.data?.execution_plan) {
          setExecutionPlanByCardId((prev) => ({
            ...prev,
            [currentCardId]: planResponse.data.execution_plan,
          }));
        }
      } catch (error) {
        if (cancelled) return;
        toast({
          title: "获取卡片协议失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) {
          setIsLoadingCardProtocol(false);
        }
      }
    };

    void loadCardProtocol();
    return () => {
      cancelled = true;
    };
  }, [currentCapability, currentCardId, currentExecutionPlan]);

  useEffect(() => {
    if (!currentCardId) return;
    if (selectedSourceId) return;
    if (!draftSourceArtifactId) return;
    setSelectedSourceByCard((prev) => ({
      ...prev,
      [currentCardId]: draftSourceArtifactId,
    }));
  }, [currentCardId, draftSourceArtifactId, selectedSourceId]);

  useEffect(() => {
    if (!currentCardId || !expandedTool || expandedTool === "ppt") return;

    const toolId = expandedTool as StudioToolKey;
    const latestArtifact = currentToolArtifacts[0];
    let cancelled = false;

    const applyResolution = (resolution: CapabilityResolution, isLoading = false) => {
      if (cancelled) return;
      setCapabilityStateByCardId((prev) => ({
        ...prev,
        [currentCardId]: {
          ...resolution,
          isLoading,
        },
      }));
    };

    const defaultResolution = buildCapabilityWithoutArtifact(toolId);
    if (defaultResolution.status === "backend_not_implemented") {
      applyResolution(defaultResolution);
      return () => {
        cancelled = true;
      };
    }

    if (!project?.id || !latestArtifact) {
      applyResolution(defaultResolution);
      return () => {
        cancelled = true;
      };
    }

    applyResolution(
      {
        status: defaultResolution.status,
        reason: defaultResolution.reason,
        resolvedArtifact: null,
      },
      true
    );

    const loadCapability = async () => {
      try {
        const blob = await projectSpaceApi.downloadArtifact(
          project.id,
          latestArtifact.artifactId
        );
        const resolved = await resolveCapabilityFromArtifact({
          toolId,
          artifact: latestArtifact,
          blob,
        });
        applyResolution(resolved);
      } catch (error) {
        applyResolution({
          status: "backend_error",
          reason: `读取后端成果失败：${getErrorMessage(error)}。已回退前端示意内容。`,
          resolvedArtifact: null,
        });
      }
    };

    void loadCapability();
    return () => {
      cancelled = true;
    };
  }, [currentCardId, currentToolArtifacts, expandedTool, project?.id]);

  const openPptPreviewPage = useCallback(
    (
      sessionId?: string | null,
      artifactId?: string | null,
      runId?: string | null
    ) => {
      if (!project) return;
      const query = new URLSearchParams();
      if (sessionId) {
        query.set("session", sessionId);
      }
      if (artifactId) {
        query.set("artifact_id", artifactId);
      }
      if (runId) {
        query.set("run", runId);
      }
      router.push(
        `/projects/${project.id}/generate${query.toString() ? `?${query.toString()}` : ""}`
      );
    },
    [project, router]
  );
  const handleOpenHistoryItem = useCallback(
    async (item: StudioHistoryItem) => {
      if (!project) return;

      if (item.sessionId) {
        setActiveSessionId(item.sessionId);
      }
      if (item.runId) {
        setActiveRunId(item.runId);
      }
      const sessionId = item.sessionId ?? null;

      if (item.toolType === "ppt" && item.step === "outline" && sessionId) {
        try {
          const sessionResponse = await generateApi.getSession(sessionId);
          const latestSession = sessionResponse?.data ?? null;
          let latestRunId: string | null = null;
          if (latestSession) {
            latestRunId = (
              latestSession as { current_run?: { run_id?: string } }
            ).current_run?.run_id ?? null;
            useProjectStore.setState({
              generationSession: latestSession,
              activeRunId: latestRunId,
            });
          }
          const latestState = latestSession?.session?.state;
          const isPreviewState =
            latestState === "GENERATING_CONTENT" ||
            latestState === "RENDERING" ||
            latestState === "SUCCESS";
          if (isPreviewState) {
            trackStep("ppt", "preview");
            acknowledgeStep("ppt", "preview");
            const runId = item.runId || resolvePptRunId(latestRunId) || undefined;
            recordWorkflowEntry({
              toolType: "ppt",
              title: "PPT 预览中",
              status: "previewing",
              step: "preview",
              sessionId,
              runId,
              toolLabel: TOOL_LABELS.ppt,
            });
            openPptPreviewPage(sessionId, item.artifactId, runId);
            return;
          }
        } catch {
          // If session state sync fails, keep existing routing behavior below.
        }
      }

      if (item.toolType === "ppt") {
        if (item.origin === "artifact" || item.step === "preview") {
          const runId = item.runId || resolvePptRunId() || undefined;
          openPptPreviewPage(sessionId, item.artifactId, runId);
          return;
        }
        const shouldOpenOutlineStage =
          item.step === "outline" || item.status === "processing";
        setLayoutMode("expanded");
        setExpandedTool("ppt");
        setPptResumeStage(shouldOpenOutlineStage ? "outline" : "config");
        setPptResumeSignal((prev) => prev + 1);
        requestStep("ppt", shouldOpenOutlineStage ? "outline" : "config");
        return;
      }

      setLayoutMode("expanded");
      setExpandedTool(item.toolType as StudioToolKey);
      const targetStep: StudioHistoryStep =
        item.status === "failed"
          ? "generate"
          : item.status === "processing" ||
              item.status === "previewing" ||
              item.status === "draft" ||
              item.origin === "artifact" ||
              item.step === "preview"
            ? "preview"
            : normalizeHistoryStep(item.step);
      requestStep(
        item.toolType,
        item.step === "outline" ? "preview" : targetStep
      );
    },
    [
      openPptPreviewPage,
      project,
      acknowledgeStep,
      recordWorkflowEntry,
      requestStep,
      resolvePptRunId,
      setActiveRunId,
      setActiveSessionId,
      setExpandedTool,
      setLayoutMode,
      trackStep,
    ]
  );

  const handleManagedToolStepChange = useCallback(
    (stepId: string) => {
      if (!expandedTool || expandedTool === "ppt") return;
      const toolType = expandedTool as GenerationToolType;
      const step = normalizeHistoryStep(stepId);
      const normalizedStep =
        step === "preview"
          ? "preview"
          : step === "generate"
            ? "generate"
            : "config";

      trackStep(toolType, step);
      acknowledgeStep(toolType, step);
      syncStudioChatContextByStep(toolType, normalizedStep, activeSessionId);

      if (normalizedStep === "preview") {
        pushStudioStageHint(toolType, "preview", activeSessionId);
      }
      if (step !== "generate" && step !== "preview") return;
      const runId =
        getCurrentWorkflowRun(toolType) ||
        (step === "generate" ? startWorkflowRun(toolType) : null);
      recordWorkflowEntry({
        toolType,
        title:
          step === "generate"
            ? `${TOOL_LABELS[toolType]}草稿中`
            : `${TOOL_LABELS[toolType]}预览草稿`,
        status: "draft",
        step,
        sessionId: activeSessionId,
        runId: runId || undefined,
        titleSource: JSON.stringify(currentToolDraft),
        toolLabel: TOOL_LABELS[toolType],
      });
    },
    [
      acknowledgeStep,
      activeSessionId,
      currentToolDraft,
      expandedTool,
      getCurrentWorkflowRun,
      pushStudioStageHint,
      recordWorkflowEntry,
      startWorkflowRun,
      syncStudioChatContextByStep,
      trackStep,
    ]
  );

  const handleToolClick = (tool: StudioTool) => {
    setLayoutMode("expanded");
    setExpandedTool(tool.type);
    trackStep(tool.type as GenerationToolType, "config");
    onToolClick?.(tool);
  };

  const handleClose = useCallback(() => {
    setLayoutMode("normal");
    setExpandedTool(null);
    setHoveredToolId(null);
    setStudioChatContext(null);
  }, [setExpandedTool, setLayoutMode, setStudioChatContext]);

  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, isExpanded]);

  const buildStudioExecutionRequest = () => {
    if (!project || !currentCardId) return null;
    const selectedSource = selectedSourceByCard[currentCardId] ?? undefined;
    const draftSourceArtifactId =
      typeof currentToolDraft.source_artifact_id === "string"
        ? currentToolDraft.source_artifact_id
        : undefined;
    return {
      project_id: project.id,
      client_session_id: activeSessionId ?? undefined,
      source_artifact_id: selectedSource || draftSourceArtifactId || undefined,
      config: currentToolDraft,
    };
  };

  const ensureActiveSession = useCallback(() => {
    if (activeSessionId) return true;
    toast({
      title: "Create session first",
      description: "Create a session from Session Switcher > New Session before running tools.",
      variant: "destructive",
    });
    return false;
  }, [activeSessionId]);

  const handleStudioLoadSources = async () => {
    if (!project || !currentCardId || isStudioActionRunning) return;
    try {
      setIsStudioActionRunning(true);
      const response = await studioCardsApi.getSources(
        currentCardId,
        project.id
      );
      const sources = response?.data?.sources ?? [];
      setSourceOptionsByCard((prev) => ({
        ...prev,
        [currentCardId]: sources.map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
        })),
      }));
      if (!selectedSourceByCard[currentCardId] && sources.length > 0) {
        setSelectedSourceByCard((prev) => ({
          ...prev,
          [currentCardId]: sources[0]?.id ?? null,
        }));
      }
      toast({
        title: "源成果已刷新",
        description: `获取到 ${sources.length} 条可绑定成果。`,
      });
    } catch (error) {
      toast({
        title: "获取源成果失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsStudioActionRunning(false);
    }
  };

  const handleStudioPreviewExecution = async () => {
    if (!currentCardId || isStudioActionRunning) return;
    const requestBody = buildStudioExecutionRequest();
    if (!requestBody) return;
    try {
      setIsStudioActionRunning(true);
      const response = await studioCardsApi.getExecutionPreview(
        currentCardId,
        requestBody
      );
      const preview = response?.data?.execution_preview ?? {};
      const endpoint =
        typeof preview.endpoint === "string"
          ? preview.endpoint
          : typeof preview.initial_request === "object" &&
              preview.initial_request &&
              "endpoint" in preview.initial_request
            ? String(
                (preview.initial_request as Record<string, unknown>).endpoint
              )
            : "unknown endpoint";
      toast({
        title: "执行预览已生成",
        description: endpoint,
      });
    } catch (error) {
      toast({
        title: "执行预览失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsStudioActionRunning(false);
    }
  };

  const handleStudioExecute = async (): Promise<{
    ok: boolean;
    sessionId: string | null;
    effectiveSessionId: string | null;
    resourceKind: string | null;
  }> => {
    if (!project || !currentCardId || isStudioActionRunning) {
      return {
        ok: false,
        sessionId: null,
        effectiveSessionId: activeSessionId ?? null,
        resourceKind: null,
      };
    }
    if (!ensureActiveSession()) {
      return {
        ok: false,
        sessionId: null,
        effectiveSessionId: activeSessionId ?? null,
        resourceKind: null,
      };
    }
    if (isProtocolPending) {
      toast({
        title: "卡片协议未就绪",
        description: "当前卡片仍在协议补齐中，暂不可执行。",
        variant: "destructive",
      });
      return {
        ok: false,
        sessionId: null,
        effectiveSessionId: activeSessionId ?? null,
        resourceKind: null,
      };
    }
    if (requiresSourceArtifact && !hasSourceBinding) {
      toast({
        title: "缺少源成果",
        description: "当前卡片需要先绑定 source artifact。",
        variant: "destructive",
      });
      return {
        ok: false,
        sessionId: null,
        effectiveSessionId: activeSessionId ?? null,
        resourceKind: null,
      };
    }
    const requestBody = buildStudioExecutionRequest();
    if (!requestBody) {
      return {
        ok: false,
        sessionId: null,
        effectiveSessionId: activeSessionId ?? null,
        resourceKind: null,
      };
    }
    try {
      setIsStudioActionRunning(true);
      const response = await studioCardsApi.execute(currentCardId, requestBody);
      const executionResult = response?.data?.execution_result ?? {};
      const resourceKind =
        typeof executionResult.resource_kind === "string"
          ? executionResult.resource_kind
          : null;
      const session =
        typeof executionResult.session === "object"
          ? (executionResult.session as Record<string, unknown>)
          : null;
      const sessionId =
        (session?.session_id as string | undefined) ||
        (session?.id as string | undefined) ||
        null;
      const run =
        typeof executionResult.run === "object" &&
        executionResult.run !== null
          ? (executionResult.run as Record<string, unknown>)
          : null;
      const runId =
        (run?.run_id as string | undefined) ||
        (run?.id as string | undefined) ||
        null;
      if (sessionId) {
        setActiveSessionId(sessionId);
      }
      if (runId) {
        setActiveRunId(runId);
      }
      const effectiveSessionId = sessionId ?? activeSessionId;
      if (
        resourceKind === "artifact" &&
        expandedTool &&
        expandedTool !== "ppt" &&
        typeof executionResult.artifact === "object" &&
        executionResult.artifact !== null
      ) {
        const artifactPayload = executionResult.artifact as Record<string, unknown>;
        const artifactId =
          (artifactPayload.id as string | undefined) ||
          (artifactPayload.artifact_id as string | undefined);
        const artifactType =
          (artifactPayload.type as ArtifactHistoryItem["artifactType"] | undefined) ??
          "summary";
        if (artifactId) {
          const runtimeItem: ArtifactHistoryItem = {
            artifactId,
            sessionId:
              (artifactPayload.session_id as string | undefined) ??
              effectiveSessionId ??
              null,
            toolType: expandedTool as GenerationToolType,
            artifactType,
            artifactKind: undefined,
            title:
              (artifactPayload.title as string | undefined) ||
              `${TOOL_LABELS[expandedTool]} ${artifactId.slice(0, 8)}`,
            status: "completed",
            createdAt:
              (artifactPayload.updated_at as string | undefined) ||
              (artifactPayload.created_at as string | undefined) ||
              new Date().toISOString(),
            basedOnVersionId: null,
            runId: null,
            runNo: null,
          };
          setRuntimeArtifactsByTool((prev) => {
            const existing = prev[expandedTool as StudioToolKey] ?? [];
            if (existing.some((item) => item.artifactId === artifactId)) {
              return prev;
            }
            return {
              ...prev,
              [expandedTool as StudioToolKey]: [runtimeItem, ...existing],
            };
          });
        }
      }
      await fetchArtifactHistory(project.id, effectiveSessionId);
      scheduleArtifactRefresh(project.id, effectiveSessionId);
      if (expandedTool === "word" && sessionId) {
        void (async () => {
          let hasConfirmedOutline = false;
          for (let index = 0; index < 28; index += 1) {
            try {
              const sessionPayload = await generateApi.getSession(sessionId);
              const sessionState =
                (
                  (sessionPayload?.data as { session?: { state?: string } })
                    ?.session?.state ??
                  (sessionPayload?.data as { state?: string })?.state ??
                  ""
                ).toUpperCase();
              if (
                !hasConfirmedOutline &&
                sessionState === "AWAITING_OUTLINE_CONFIRM"
              ) {
                await generateApi.confirmOutline(sessionId, {});
                hasConfirmedOutline = true;
                continue;
              }
              if (sessionState === "SUCCESS" || sessionState === "FAILED") {
                break;
              }
            } catch {
              // Ignore transient polling failures and keep retrying.
            }
            await waitFor(1800);
          }
          await fetchArtifactHistory(project.id, sessionId);
        })();
      }
      toast({
        title: "Studio 执行成功",
        description:
          resourceKind === "session" && sessionId
            ? `已启动文档生成流程 ${sessionId.slice(0, 8)}`
            : sessionId
              ? `已生成会话 ${sessionId.slice(0, 8)}`
              : "已提交生成并刷新成果列表",
      });
      return {
        ok: true,
        sessionId,
        effectiveSessionId,
        resourceKind,
      };
    } catch (error) {
      toast({
        title: "Studio 执行失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      return {
        ok: false,
        sessionId: null,
        effectiveSessionId: activeSessionId ?? null,
        resourceKind: null,
      };
    } finally {
      setIsStudioActionRunning(false);
    }
  };

  const handleOpenChatRefine = useCallback(() => {
    if (!project || !currentCardId || !activeSessionId) return;
    if (!expandedTool || expandedTool === "ppt") return;

    const toolType = expandedTool as GenerationToolType;
    const managedTool = toStudioManagedTool(toolType);
    if (!managedTool) return;

    syncStudioChatContextByStep(toolType, "preview", activeSessionId);

    if (!canRefine) {
      toast({
        title: "Refine is unavailable",
        description: "Enter preview mode first, then refine via Chat.",
        variant: "destructive",
      });
      return;
    }

    focusChatComposer();
  }, [
    project,
    currentCardId,
    activeSessionId,
    expandedTool,
    syncStudioChatContextByStep,
    canRefine,
    focusChatComposer,
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
    readiness: currentReadiness,
    isLoadingProtocol: isLoadingCardProtocol,
    isActionRunning: isStudioActionRunning,
    isProtocolPending,
    requiresSourceArtifact,
    supportsChatRefine,
    canExecute,
    canRefine,
    capabilityStatus: activeCapabilityState.status,
    capabilityReason: activeCapabilityState.reason,
    isCapabilityLoading: activeCapabilityState.isLoading,
    resolvedArtifact: activeCapabilityState.resolvedArtifact,
    sourceOptions: currentCardId
      ? (sourceOptionsByCard[currentCardId] ?? [])
      : [],
    selectedSourceId,
    requestedStep: requestedHistoryStep,
    latestArtifacts: currentToolArtifacts.map((item) => ({
      artifactId: item.artifactId,
      title: item.title,
      status: item.status,
      createdAt: item.createdAt,
    })),
    onStepChange: handleManagedToolStepChange,
    onSelectedSourceChange: (sourceId) => {
      if (!currentCardId) return;
      setSelectedSourceByCard((prev) => ({
        ...prev,
        [currentCardId]: sourceId,
      }));
    },
    onLoadSources: () => handleStudioLoadSources(),
    onPreviewExecution: () => handleStudioPreviewExecution(),
    onExecute: async () => {
      if (!expandedTool || expandedTool === "ppt") return;
      const toolType = expandedTool as GenerationToolType;
      const flowStep =
        normalizeHistoryStep(currentStepByTool[toolType]) === "preview"
          ? "preview"
          : "generate";
      const runId = startWorkflowRun(toolType);

      pushStudioStageHint(toolType, "generate", activeSessionId);
      syncStudioChatContextByStep(toolType, "generate", activeSessionId);

      recordWorkflowEntry({
        toolType,
        title: `${TOOL_LABELS[toolType]}生成中`,
        status: "processing",
        step: flowStep,
        sessionId: activeSessionId,
        runId,
        titleSource: JSON.stringify(currentToolDraft),
        toolLabel: TOOL_LABELS[toolType],
      });
      const execution = await handleStudioExecute();
      if (execution.ok) {
        const contextSessionId = execution.effectiveSessionId ?? activeSessionId;
        if (contextSessionId) {
          syncStudioChatContextByStep(toolType, "generate", contextSessionId);
          pushStudioStageHint(toolType, "generate", contextSessionId);
        }
        if (execution.resourceKind === "artifact") {
          trackStep(toolType, "preview");
          acknowledgeStep(toolType, "preview");
          recordWorkflowEntry({
            toolType,
            title: `${TOOL_LABELS[toolType]}草稿中`,
            status: "draft",
            step: "preview",
            sessionId: contextSessionId,
            runId,
            titleSource: JSON.stringify(currentToolDraft),
            toolLabel: TOOL_LABELS[toolType],
          });
        }
      } else if (activeSessionId) {
        recordWorkflowEntry({
          toolType,
          title: `${TOOL_LABELS[toolType]}生成失败`,
          status: "failed",
          step: flowStep,
          sessionId: activeSessionId,
          runId,
          titleSource: JSON.stringify(currentToolDraft),
          toolLabel: TOOL_LABELS[toolType],
        });
      }
    },
    onRefine: () => handleOpenChatRefine(),
    onExportArtifact: (artifactId) => exportArtifact(artifactId),
  };

  return (
    <div
      className="project-panel-root h-full bg-transparent"
      style={{ transform: "translateZ(0)" }}
    >
      <Card className="project-panel-card project-studio-panel h-full overflow-hidden rounded-2xl border border-[var(--project-border)] bg-[var(--project-surface)] text-[var(--project-text-primary)] shadow-lg backdrop-blur-xl will-change-[box-shadow,transform]">
        <CardHeader
          className="project-panel-header relative flex flex-row items-center justify-between px-4 py-0 shrink-0 space-y-0"
          style={{ height: "52px" }}
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            <LayoutGroup>
              <motion.div
                className="flex min-w-0 flex-col justify-center"
                layout
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <CardTitle className="truncate text-sm font-semibold leading-tight">
                  <motion.span
                    className="block truncate"
                    layout
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  >
                    {isExpanded ? TOOL_LABELS[expandedTool || "ppt"] : "Studio"}
                  </motion.span>
                </CardTitle>
                <CardDescription className="truncate text-xs leading-tight text-[var(--project-text-muted)]">
                  <motion.span
                    className="block truncate"
                    layout
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  >
                    {isExpanded ? "配置生成参数" : "AI 生成工具"}
                  </motion.span>
                </CardDescription>
              </motion.div>
            </LayoutGroup>
          </div>

          <AnimatePresence>
            {isExpanded ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="shrink-0 text-xs text-[var(--project-text-muted)] hover:text-[var(--project-text-primary)]"
                >
                  关闭
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {isExpanded && expandedTool ? (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
              <motion.div
                layoutId={`icon-${expandedTool}`}
                layout="position"
                className={cn(
                  "project-tool-icon-shell flex items-center justify-center rounded-[var(--project-chip-radius)] border border-white/40 backdrop-blur-md transform-gpu will-change-transform [backface-visibility:hidden]"
                )}
                style={{
                  width: 40,
                  height: 40,
                  background: `linear-gradient(135deg, ${currentColor.glow}, transparent)`,
                  boxShadow: `0 8px 22px ${currentColor.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
                }}
                transition={{ layout: ICON_LAYOUT_TRANSITION }}
              >
                <CurrentIcon
                  className="h-4.5 w-4.5"
                  style={{ color: currentColor.primary }}
                />
              </motion.div>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="relative h-[calc(100%-52px)] overflow-hidden p-0">
          <LayoutGroup>
            <motion.div
              className={cn(
                "absolute inset-0",
                isExpanded ? "pointer-events-none" : "pointer-events-auto"
              )}
              animate={{
                opacity: isExpanded ? 0 : 1,
                scale: isExpanded ? 0.985 : 1,
              }}
              transition={{ duration: 0.2 }}
            >
              <ScrollArea className="h-full">
                <div className="p-3">
                  <ToolGrid
                    isExpanded={isExpanded}
                    hoveredToolId={hoveredToolId}
                    onHoveredToolIdChange={setHoveredToolId}
                    onToolClick={handleToolClick}
                  />
                  {hasHistory && !isExpanded ? (
                    <SessionArtifacts
                      groupedHistory={groupedHistory}
                      toolLabels={TOOL_LABELS}
                      onRefresh={() => {
                        if (!project) return;
                        void fetchArtifactHistory(project.id, activeSessionId);
                      }}
                      onOpenHistoryItem={handleOpenHistoryItem}
                      onArchiveHistoryItem={archiveHistoryItem}
                    />
                  ) : null}
                </div>
              </ScrollArea>
            </motion.div>

            <AnimatePresence>
              {isExpanded && expandedTool ? (
                <motion.div
                  key={`${expandedTool}-expanded-content`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 p-3"
                >
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: 0.05, duration: 0.15 }}
                    className="h-full w-full"
                  >
                    {expandedTool === "ppt" ? (
                      <div className="h-full">
                        <GenerationConfigPanel
                          variant="compact"
                          resumeStage={pptResumeStage}
                          resumeSignal={pptResumeSignal}
                          onWorkflowStageChange={(stage, payload) => {
                            if (stage === "config") {
                              trackStep("ppt", "config");
                              acknowledgeStep("ppt", "config");
                              return;
                            }
                            if (stage === "generating_outline") {
                              const resolvedSessionId =
                                payload?.sessionId ?? activeSessionId ?? null;
                              if (!resolvedSessionId) {
                                return;
                              }
                              const runId = resolvePptRunId() || undefined;
                              trackStep("ppt", "generate");
                              recordWorkflowEntry({
                                toolType: "ppt",
                                title: "PPT 大纲生成中",
                                status: "processing",
                                step: "generate",
                                sessionId: resolvedSessionId,
                                runId,
                                toolLabel: TOOL_LABELS.ppt,
                              });
                              return;
                            }
                            if (stage === "preview") {
                              const resolvedSessionId =
                                payload?.sessionId ?? activeSessionId ?? null;
                              if (!resolvedSessionId) {
                                return;
                              }
                              trackStep("ppt", "preview");
                              acknowledgeStep("ppt", "preview");
                              const runId = resolvePptRunId() || undefined;
                              recordWorkflowEntry({
                                toolType: "ppt",
                                title: "PPT 预览中",
                                status: "previewing",
                                step: "preview",
                                sessionId: resolvedSessionId,
                                runId,
                                toolLabel: TOOL_LABELS.ppt,
                              });
                              return;
                            }
                            trackStep("ppt", "outline");
                            acknowledgeStep("ppt", "outline");
                            const runId = resolvePptRunId() || undefined;
                            recordWorkflowEntry({
                              toolType: "ppt",
                              title: "PPT 大纲配置中",
                              status: "draft",
                              step: "outline",
                              sessionId:
                                payload?.sessionId ?? activeSessionId ?? null,
                              runId,
                              titleSource: "PPT 大纲编辑",
                              toolLabel: TOOL_LABELS.ppt,
                            });
                          }}
                          onGenerate={async (config) => {
                            const tool = GENERATION_TOOLS.find(
                              (item) => item.type === expandedTool
                            );
                            if (!project || !tool) return;
                            const styleToneMap: Record<string, string> = {
                              structured: "严谨、逻辑清晰、层次分明",
                              story: "叙事化、生动、循序渐进",
                              problem: "问题驱动、启发式、强调思考",
                              workshop: "实操导向、案例化、可落地",
                            };
                            const sessionId = await startGeneration(
                              project.id,
                              tool,
                              {
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
                                  `【大纲风格】${styleToneMap[config.outlineStyle] || "逻辑清晰"}`,
                                  "【页面比例】16:9",
                                  "请在每页中给出明确教学目标与讲解节奏。",
                                ].join("\n"),
                              }
                            );
                            if (sessionId) {
                              setActiveSessionId(sessionId);
                            }
                            return sessionId;
                          }}
                        />
                      </div>
                    ) : ExpandedToolComponent ? (
                      <div className="h-full flex flex-col gap-2">
                        {!isCardManagedFlowExpanded ? (
                          <>
                            <div className="project-studio-protocol-bar rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-control-bg)] px-2 py-2 flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="project-studio-protocol-btn h-8 text-xs"
                                onClick={() => {
                                  void handleStudioPreviewExecution();
                                }}
                                disabled={
                                  !currentCardId ||
                                  isStudioActionRunning ||
                                  isLoadingCardProtocol
                                }
                              >
                                预览协议
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="project-studio-protocol-btn h-8 text-xs"
                                onClick={() => {
                                  void handleStudioLoadSources();
                                }}
                                disabled={
                                  !currentCardId ||
                                  isStudioActionRunning ||
                                  isLoadingCardProtocol
                                }
                              >
                                源成果
                              </Button>
                              {currentCardId &&
                              sourceOptionsByCard[currentCardId]?.length > 0 ? (
                                <select
                                  value={
                                    selectedSourceByCard[currentCardId] ?? ""
                                  }
                                  onChange={(event) =>
                                    setSelectedSourceByCard((prev) => ({
                                      ...prev,
                                      [currentCardId]:
                                        event.target.value || null,
                                    }))
                                  }
                                  className="project-studio-protocol-select h-8 rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-2 text-xs text-[var(--project-text-primary)]"
                                >
                                  {sourceOptionsByCard[currentCardId].map(
                                    (item) => (
                                      <option key={item.id} value={item.id}>
                                        {(item.title || item.id.slice(0, 8)) +
                                          (item.type ? ` (${item.type})` : "")}
                                      </option>
                                    )
                                  )}
                                </select>
                              ) : null}
                              <div className="ml-auto flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="project-studio-protocol-btn h-8 text-xs"
                                  onClick={() => {
                                    handleOpenChatRefine();
                                  }}
                                  disabled={!canRefine || isLoadingCardProtocol}
                                >
                                  Refine
                                </Button>
                                <Button
                                  size="sm"
                                  className="project-studio-protocol-btn project-studio-protocol-btn-primary h-8 text-xs"
                                  onClick={() => {
                                    void handleStudioExecute();
                                  }}
                                  disabled={
                                    !canExecute || isLoadingCardProtocol
                                  }
                                >
                                  执行
                                </Button>
                              </div>
                            </div>
                            {currentCardId ? (
                              <div className="project-studio-protocol-meta rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-muted)] px-3 py-2 text-[11px] text-[var(--project-control-muted)]">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                                    readiness: {currentReadiness ?? "loading"}
                                  </span>
                                  <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                                    context:{" "}
                                    {currentCapability?.context_mode ??
                                      "unknown"}
                                  </span>
                                  <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                                    mode:{" "}
                                    {currentCapability?.execution_mode ??
                                      "unknown"}
                                  </span>
                                  <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                                    refine: {supportsChatRefine ? "on" : "off"}
                                  </span>
                                  <span className="project-studio-meta-chip rounded-[var(--project-chip-radius)] bg-[var(--project-surface-elevated)] px-2 py-0.5 border border-[var(--project-control-border)]">
                                    source:{" "}
                                    {requiresSourceArtifact
                                      ? "required"
                                      : "optional"}
                                  </span>
                                </div>
                                {requiresSourceArtifact && !hasSourceBinding ? (
                                  <p className="mt-1 text-amber-700">
                                    当前卡片执行需要先绑定源成果。
                                  </p>
                                ) : null}
                                {isProtocolPending ? (
                                  <p className="mt-1 text-amber-700">
                                    当前卡片协议处于
                                    protocol_pending，执行/refine 已禁用。
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        <div className="min-h-0 flex-1">
                          <ExpandedToolComponent
                            toolId={expandedTool as StudioToolKey}
                            toolName={TOOL_LABELS[expandedTool] ?? expandedTool}
                            onDraftChange={handleExpandedToolDraftChange}
                            flowContext={toolFlowContext}
                          />
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </LayoutGroup>
        </CardContent>
      </Card>

      {isArchiveHistoryPanelOpen ? (
        <>
          <div
            className="fixed inset-0 z-[210] bg-[var(--project-overlay)] backdrop-blur-[2px]"
            onClick={() => setIsArchiveHistoryPanelOpen(false)}
          />
          <div className="fixed inset-0 z-[220] flex items-start justify-center px-4 pt-20 pb-8">
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="flex w-full max-w-2xl max-h-[min(72vh,820px)] flex-col overflow-hidden rounded-[var(--project-menu-radius)] border border-[var(--project-menu-border)] bg-[var(--project-menu-bg)] shadow-[var(--project-menu-shadow)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[var(--project-control-border)] px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--project-text-primary)]">
                    归档历史记录
                  </h3>
                  <p className="text-xs text-[var(--project-text-muted)]">
                    共 {archivedHistory.length} 条
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-[var(--project-chip-radius)] text-[var(--project-text-muted)] hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-text-primary)]"
                  onClick={() => setIsArchiveHistoryPanelOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {archivedHistory.length === 0 ? (
                  <p className="rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-3 py-3 text-xs text-[var(--project-text-muted)]">
                    暂无归档记录
                  </p>
                ) : (
                  <div className="space-y-2">
                    {archivedHistory.map((item) => (
                      <div
                        key={`archive-panel-${item.id}`}
                        className="flex items-center gap-3 rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--project-text-primary)]">
                            {item.title}
                          </p>
                          <p className="truncate text-xs text-[var(--project-text-muted)]">
                            {TOOL_LABELS[item.toolType] ?? item.toolType} ·{" "}
                            {new Date(item.createdAt).toLocaleString("zh-CN")}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 rounded-[var(--project-chip-radius)] border-[var(--project-control-border)] bg-[var(--project-surface)] text-xs text-[var(--project-text-muted)] hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-text-primary)]"
                          onClick={() => unarchiveHistoryItem(item.id)}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          取消归档
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export { StudioPanel as StudioExpandedPanel };













