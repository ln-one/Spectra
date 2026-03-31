import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateApi } from "@/lib/sdk";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import { useProjectStore } from "@/stores/projectStore";
import type { StudioChatContext } from "@/stores/project-store/types";
import { TOOL_LABELS, type StudioTool } from "../constants";
import type { StudioHistoryItem, StudioHistoryStep } from "../history/types";
import type { StudioToolKey } from "../tools";
import { normalizeHistoryStep } from "./utils";

interface UseStudioHistoryHandlersArgs {
  projectId: string | null;
  isExpanded: boolean;
  expandedTool: GenerationToolType | null;
  activeSessionId: string | null;
  resolvePptRunId: (fallback?: string | null) => string | null;
  openPptPreviewPage: (
    sessionId?: string | null,
    artifactId?: string | null,
    runId?: string | null
  ) => string | null;
  setLayoutMode: (mode: "normal" | "expanded") => void;
  setExpandedTool: (tool: GenerationToolType | null) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  setActiveRunId: (runId: string | null) => void;
  setPptResumeStage: (stage: "config" | "outline") => void;
  bumpPptResumeSignal: () => void;
  setHoveredToolId: (toolId: string | null) => void;
  setStudioChatContext: (context: StudioChatContext | null) => void;
  setManagedToolRunSeed: (
    tool: StudioToolKey,
    runId: string | null,
    sessionId: string | null
  ) => void;
  onToolClick?: (tool: StudioTool) => void;
  trackStep: (tool: GenerationToolType, step: StudioHistoryStep) => void;
  requestStep: (tool: GenerationToolType, step: StudioHistoryStep) => void;
  acknowledgeStep: (tool: GenerationToolType, step?: StudioHistoryStep) => void;
  recordWorkflowEntry: (payload: {
    toolType: GenerationToolType;
    title: string;
    status:
      | "pending"
      | "draft"
      | "processing"
      | "previewing"
      | "completed"
      | "failed";
    step: StudioHistoryStep;
    sessionId?: string | null;
    runId?: string;
    runNo?: number;
    titleSource?: string;
    toolLabel?: string;
  }) => void;
  syncStudioChatContextByStep: (
    toolType: GenerationToolType,
    step: "config" | "generate" | "preview",
    sessionId?: string | null
  ) => void;
  pushStudioStageHint: (
    toolType: GenerationToolType,
    stage: "generate" | "preview",
    sessionId: string | null
  ) => void;
}

export function useStudioHistoryHandlers({
  projectId,
  isExpanded,
  expandedTool,
  activeSessionId,
  resolvePptRunId,
  openPptPreviewPage,
  setLayoutMode,
  setExpandedTool,
  setActiveSessionId,
  setActiveRunId,
  setPptResumeStage,
  bumpPptResumeSignal,
  setHoveredToolId,
  setStudioChatContext,
  setManagedToolRunSeed,
  onToolClick,
  trackStep,
  requestStep,
  acknowledgeStep,
  recordWorkflowEntry,
  syncStudioChatContextByStep,
  pushStudioStageHint,
}: UseStudioHistoryHandlersArgs) {
  const router = useRouter();

  const handleOpenHistoryItem = useCallback(
    async (item: StudioHistoryItem) => {
      if (!projectId) return;

      if (item.sessionId) setActiveSessionId(item.sessionId);
      if (item.toolType === "ppt" && item.runId) {
        setActiveRunId(item.runId);
      }
      const sessionId = item.sessionId ?? null;

      if (
        item.toolType === "ppt" &&
        (item.step === "outline" || item.step === "preview") &&
        sessionId &&
        item.runId
      ) {
        try {
          const sessionResponse = await generateApi.getSessionByRun(sessionId, {
            run_id: item.runId,
          });
          const latestSession = sessionResponse?.data ?? null;
          let latestRunId: string | null = null;
          if (latestSession) {
            latestRunId =
              (latestSession as { current_run?: { run_id?: string } })
                .current_run?.run_id ?? null;
            const pinnedRunId = item.runId || latestRunId;
            useProjectStore.setState({
              generationSession: latestSession,
              activeRunId: pinnedRunId,
            });
          }
          const latestState = latestSession?.session?.state;
          const latestCurrentRun = (latestSession as any)?.current_run ?? null;
          const latestCurrentRunId = latestCurrentRun?.run_id ?? null;
          const latestCurrentRunStep = String(
            latestCurrentRun?.run_step ?? ""
          ).toLowerCase();
          const latestCurrentRunStatus = String(
            latestCurrentRun?.run_status ?? ""
          ).toLowerCase();
          const isSameRun =
            Boolean(item.runId) &&
            Boolean(latestCurrentRunId) &&
            item.runId === latestCurrentRunId;
          const isSessionPreviewState =
            latestState === "GENERATING_CONTENT" ||
            latestState === "RENDERING" ||
            latestState === "SUCCESS";
          const isRunPreviewState =
            latestCurrentRunStep === "generate" ||
            latestCurrentRunStep === "preview" ||
            latestCurrentRunStep === "completed" ||
            latestCurrentRunStatus === "processing" ||
            latestCurrentRunStatus === "completed";
          if (isSessionPreviewState && isRunPreviewState && isSameRun) {
            trackStep("ppt", "preview");
            acknowledgeStep("ppt", "preview");
            const runId =
              item.runId || resolvePptRunId(latestRunId) || undefined;
            const isFinished = latestState === "SUCCESS";
            recordWorkflowEntry({
              toolType: "ppt",
              title: isFinished ? "PPT Ready" : "PPT Generating",
              status: isFinished ? "previewing" : "processing",
              step: "preview",
              sessionId,
              runId,
              toolLabel: TOOL_LABELS.ppt,
            });
            const previewHref = openPptPreviewPage(
              sessionId,
              item.artifactId,
              runId
            );
            if (previewHref) router.push(previewHref);
            return;
          }
        } catch {
          // If session state sync fails, keep existing routing behavior below.
        }
      }

      if (item.toolType === "ppt") {
        const canOpenPreviewDirectly =
          Boolean(item.artifactId) ||
          item.status === "previewing" ||
          item.status === "completed";
        if (
          (item.origin === "artifact" || item.step === "preview") &&
          canOpenPreviewDirectly
        ) {
          const runId = item.runId || resolvePptRunId() || undefined;
          const previewHref = openPptPreviewPage(
            sessionId,
            item.artifactId,
            runId
          );
          if (previewHref) router.push(previewHref);
          return;
        }
        const shouldOpenOutlineStage =
          item.step === "outline" ||
          item.status === "draft" ||
          item.status === "pending";
        setLayoutMode("expanded");
        setExpandedTool("ppt");
        setPptResumeStage(shouldOpenOutlineStage ? "outline" : "config");
        bumpPptResumeSignal();
        requestStep("ppt", shouldOpenOutlineStage ? "outline" : "config");
        return;
      }

      setLayoutMode("expanded");
      setExpandedTool(item.toolType as StudioToolKey);
      setManagedToolRunSeed(
        item.toolType as StudioToolKey,
        item.runId ?? null,
        item.sessionId ?? null
      );
      const targetStep: StudioHistoryStep =
        item.status === "failed" ||
        item.status === "draft" ||
        item.status === "pending"
          ? "generate"
          : item.status === "processing" ||
              item.status === "previewing" ||
              item.status === "completed" ||
              item.origin === "artifact" ||
              item.step === "preview"
            ? "preview"
            : normalizeHistoryStep(item.step);
      requestStep(item.toolType, targetStep);
    },
    [
      acknowledgeStep,
      bumpPptResumeSignal,
      openPptPreviewPage,
      projectId,
      recordWorkflowEntry,
      requestStep,
      resolvePptRunId,
      router,
      setActiveRunId,
      setActiveSessionId,
      setExpandedTool,
      setLayoutMode,
      setManagedToolRunSeed,
      setPptResumeStage,
      trackStep,
    ]
  );

  const handleManagedToolStepChange = useCallback(
    (stepId: string) => {
      if (!expandedTool || expandedTool === "ppt") return;
      const toolType = expandedTool;
      const step = normalizeHistoryStep(stepId);
      const normalizedStep =
        step === "preview"
          ? "preview"
          : step === "generate"
            ? "generate"
            : "config";

      trackStep(toolType, step);
      acknowledgeStep(toolType);
      syncStudioChatContextByStep(toolType, normalizedStep, activeSessionId);

      if (normalizedStep === "preview") {
        pushStudioStageHint(toolType, "preview", activeSessionId);
      }
    },
    [
      acknowledgeStep,
      activeSessionId,
      expandedTool,
      pushStudioStageHint,
      syncStudioChatContextByStep,
      trackStep,
    ]
  );

  const handleToolClick = useCallback(
    (tool: StudioTool) => {
      setLayoutMode("expanded");
      setExpandedTool(tool.type);
      requestStep(tool.type as GenerationToolType, "config");
      if (tool.type !== "ppt") {
        setManagedToolRunSeed(
          tool.type as StudioToolKey,
          null,
          activeSessionId ?? null
        );
      } else {
        setActiveRunId(null);
        setPptResumeStage("config");
        bumpPptResumeSignal();
      }
      trackStep(tool.type as GenerationToolType, "config");
      onToolClick?.(tool);
    },
    [
      activeSessionId,
      onToolClick,
      requestStep,
      setExpandedTool,
      setLayoutMode,
      setActiveRunId,
      setManagedToolRunSeed,
      setPptResumeStage,
      bumpPptResumeSignal,
      trackStep,
    ]
  );

  const handleClose = useCallback(() => {
    setLayoutMode("normal");
    setExpandedTool(null);
    setHoveredToolId(null);
    setStudioChatContext(null);
  }, [setExpandedTool, setHoveredToolId, setLayoutMode, setStudioChatContext]);

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleClose, isExpanded]);

  return {
    handleOpenHistoryItem,
    handleManagedToolStepChange,
    handleToolClick,
    handleClose,
  };
}

