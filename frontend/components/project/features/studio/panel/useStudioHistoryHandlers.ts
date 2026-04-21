import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateApi } from "@/lib/sdk";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import { useProjectStore } from "@/stores/projectStore";
import type { StudioChatContext } from "@/stores/project-store/types";
import { TOOL_LABELS, type StudioTool } from "../constants";
import type {
  StudioHistoryItem,
  StudioHistoryStep,
  StudioPptHistoryStatus,
} from "../history/types";
import type { ManagedResultTarget, StudioToolKey } from "../tools";
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
    workflowId?: string | null;
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
    ppt_status?: StudioPptHistoryStatus;
    sessionId?: string | null;
    runId?: string;
    runNo?: number;
    titleSource?: string;
    toolLabel?: string;
  }) => string;
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
  onManagedOpenHistoryResult?: (payload: ManagedResultTarget) => void;
  onManagedStartNewDraft?: (toolType: GenerationToolType) => void;
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
  onManagedOpenHistoryResult,
  onManagedStartNewDraft,
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
      const shouldOptimisticallyOpenOutline =
        item.toolType === "ppt" &&
        (item.step === "outline" ||
          item.ppt_status === "outline_generating" ||
          item.ppt_status === "outline_pending_confirm" ||
          item.status === "draft" ||
          item.status === "pending");

      if (shouldOptimisticallyOpenOutline) {
        setLayoutMode("expanded");
        setExpandedTool("ppt");
        setPptResumeStage("outline");
        bumpPptResumeSignal();
        requestStep("ppt", "outline");
      }

      if (
        item.toolType === "ppt" &&
        sessionId
      ) {
        try {
          const targetRunId = item.runId ?? null;
          const snapshotResponse = await generateApi.getSessionSnapshot(
            sessionId,
            targetRunId ? { run_id: targetRunId } : undefined
          );
          const latestSession = snapshotResponse?.data ?? null;
          const latestState = latestSession?.session?.state ?? null;
          const latestCurrentRun = (
            latestSession as {
              current_run?: {
                run_id?: string | null;
                run_step?: string | null;
                run_status?: string | null;
              } | null;
            }
          )?.current_run ?? null;
          const latestCurrentRunId = latestCurrentRun?.run_id ?? null;
          const latestRunId = targetRunId || latestCurrentRunId || null;
          let runStep = String(latestCurrentRun?.run_step ?? "").toLowerCase();
          let runStatus = String(latestCurrentRun?.run_status ?? "").toLowerCase();
          if (latestRunId) {
            try {
              const runResponse = await generateApi.getRun(sessionId, latestRunId);
              const runRecord = runResponse?.data?.run as
                | { run_step?: unknown; run_status?: unknown }
                | null
                | undefined;
              runStep =
                (typeof runRecord?.run_step === "string"
                  ? runRecord.run_step
                  : runStep
                ).toLowerCase();
              runStatus =
                (typeof runRecord?.run_status === "string"
                  ? runRecord.run_status
                  : runStatus
                ).toLowerCase();
            } catch {
              // Keep snapshot run fields if run detail fetch fails.
            }
          }
          if (latestRunId) {
            setActiveRunId(latestRunId);
          }
          if (latestSession) {
            useProjectStore.setState({
              generationSession: latestSession,
              activeRunId: latestRunId,
            });
          }

          if (latestState === "AWAITING_OUTLINE_CONFIRM") {
            trackStep("ppt", "outline");
            acknowledgeStep("ppt", "outline");
            recordWorkflowEntry({
              toolType: "ppt",
              title: item.title || "课件大纲",
              status: "draft",
              step: "outline",
              ppt_status: "outline_pending_confirm",
              sessionId,
              runId: latestRunId || undefined,
              toolLabel: TOOL_LABELS.ppt,
            });
            setLayoutMode("expanded");
            setExpandedTool("ppt");
            setPptResumeStage("outline");
            bumpPptResumeSignal();
            requestStep("ppt", "outline");
            return;
          }

          const isRunDraftingOutline =
            runStep === "outline" &&
            (runStatus === "processing" || runStatus === "pending");
          if (
            isRunDraftingOutline ||
            (!latestRunId && latestState === "DRAFTING_OUTLINE")
          ) {
            trackStep("ppt", "outline");
            acknowledgeStep("ppt", "outline");
            recordWorkflowEntry({
              toolType: "ppt",
              title: item.title || "课件大纲",
              status: "draft",
              step: "outline",
              ppt_status: "outline_generating",
              sessionId,
              runId: latestRunId || undefined,
              toolLabel: TOOL_LABELS.ppt,
            });
            setLayoutMode("expanded");
            setExpandedTool("ppt");
            setPptResumeStage("outline");
            bumpPptResumeSignal();
            requestStep("ppt", "outline");
            return;
          }

          const isRunPreviewState =
            runStep === "generate" ||
            runStep === "preview" ||
            runStep === "completed" ||
            runStatus === "completed" ||
            runStatus === "failed";
          const isSessionPreviewStateWithoutRun =
            !latestRunId &&
            (latestState === "GENERATING_CONTENT" ||
              latestState === "RENDERING" ||
              latestState === "SUCCESS" ||
              latestState === "FAILED");
          if (isRunPreviewState || isSessionPreviewStateWithoutRun) {
            trackStep("ppt", "preview");
            acknowledgeStep("ppt", "preview");
            const isFinished =
              runStatus === "completed" ||
              runStep === "completed" ||
              (!latestRunId && latestState === "SUCCESS");
            const isFailed =
              runStatus === "failed" || (!latestRunId && latestState === "FAILED");
            recordWorkflowEntry({
              toolType: "ppt",
              title: item.title || "课件生成",
              status: isFailed
                ? "failed"
                : isFinished
                  ? "completed"
                  : "processing",
              step: "preview",
              ppt_status:
                !isFinished && !isFailed ? "slides_generating" : undefined,
              sessionId,
              runId: latestRunId || undefined,
              toolLabel: TOOL_LABELS.ppt,
            });
            const previewHref = openPptPreviewPage(
              sessionId,
              item.artifactId,
              latestRunId || undefined
            );
            if (previewHref) router.push(previewHref);
            return;
          }
        } catch {
          // If snapshot sync fails, keep existing routing behavior below.
        }
      }

      if (item.toolType === "ppt") {
        const hasPinnedPreviewAnchor = Boolean(item.artifactId || item.runId);
        const shouldPreferPinnedPreview =
          sessionId &&
          hasPinnedPreviewAnchor &&
          (item.origin === "artifact" ||
            item.step === "preview" ||
            item.status === "previewing" ||
            item.status === "completed" ||
            item.status === "failed");
        if (shouldPreferPinnedPreview) {
          const previewHref = openPptPreviewPage(
            sessionId,
            item.artifactId,
            item.runId || undefined
          );
          if (previewHref) {
            router.push(previewHref);
            return;
          }
        }
        const canOpenPreviewDirectly =
          Boolean(item.artifactId) ||
          item.status === "previewing" ||
          item.status === "completed" ||
          item.status === "failed";
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
      onManagedOpenHistoryResult?.({
        kind: "pinned_artifact",
        toolType: item.toolType as StudioToolKey,
        sessionId: item.sessionId ?? null,
        runId: item.runId ?? null,
        artifactId: item.artifactId ?? null,
        status: item.status,
      });
      setManagedToolRunSeed(
        item.toolType as StudioToolKey,
        item.runId ?? null,
        item.sessionId ?? null
      );
      const targetStep: StudioHistoryStep =
        item.status === "processing" ||
        item.status === "previewing" ||
        item.status === "completed" ||
        item.status === "failed" ||
        item.origin === "artifact" ||
        item.step === "preview"
          ? "preview"
          : item.status === "draft" || item.status === "pending"
            ? "generate"
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
      onManagedOpenHistoryResult,
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
      onManagedStartNewDraft?.(tool.type as GenerationToolType);
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
      onManagedStartNewDraft,
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
