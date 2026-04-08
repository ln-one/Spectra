import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { ApiError } from "@/lib/sdk/client";
import type {
  ArtifactHistoryItem,
  GenerationToolType,
} from "@/lib/project-space/artifact-history";
import { toast } from "@/hooks/use-toast";
import type { StudioToolKey, ToolDraftState } from "../tools";
import { TOOL_LABELS } from "../constants";
import type { StudioExecutionResult, StudioSourceOption } from "./types";

interface UseStudioExecutionHandlersArgs {
  project: { id: string } | null;
  expandedTool: GenerationToolType | null;
  currentCardId: string | null;
  seedRunId: string | null;
  currentToolDraft: ToolDraftState;
  selectedSourceId: string | null;
  selectedFileIds: string[];
  draftSourceArtifactId: string | null;
  activeSessionId: string | null;
  activeRunId: string | null;
  generationSession: unknown;
  isProtocolPending: boolean;
  requiresSourceArtifact: boolean;
  hasSourceBinding: boolean;
  canRefine: boolean;
  setActiveSessionId: (sessionId: string | null) => void;
  fetchArtifactHistory: (
    projectId: string,
    sessionId: string | null
  ) => Promise<void>;
  focusChatComposer: () => void;
  syncStudioChatContextByStep: (
    toolType: GenerationToolType,
    step: "config" | "generate" | "preview",
    sessionId?: string | null
  ) => void;
  upsertCurrentCardSources: (sources: StudioSourceOption[]) => void;
  appendRuntimeArtifact: (
    toolKey: StudioToolKey,
    runtimeItem: ArtifactHistoryItem
  ) => void;
}

function resolveExecutionRunNo(
  run: Record<string, unknown> | null
): number | null {
  if (typeof run?.run_no === "number" && Number.isFinite(run.run_no)) {
    return Math.trunc(run.run_no);
  }
  return null;
}

function resolveEffectiveRagSourceIds(selectedFileIds: string[]): string[] {
  const normalized = selectedFileIds.filter(
    (id) => typeof id === "string" && id.trim().length > 0
  );
  return Array.from(new Set(normalized));
}

function isRestrictedRagModeEnabled(draft: ToolDraftState): boolean {
  const draftRecord = draft as Record<string, unknown>;
  const value = [draftRecord.rag_mode, draftRecord.source_mode].find(
    (item) => typeof item === "string"
  );
  if (typeof value !== "string") return false;
  const normalized = value.toLowerCase();
  return (
    normalized === "restricted" ||
    normalized === "selected_only" ||
    normalized === "selected" ||
    normalized === "strict"
  );
}

function formatStudioExecutionError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.code || "UNKNOWN_ERROR";
    const message = error.message || "Request failed";
    const details = error.details ?? {};
    const phase =
      typeof details.phase === "string" ? String(details.phase) : null;
    const reason =
      typeof details.failure_reason === "string"
        ? String(details.failure_reason)
        : null;
    const hints = [
      phase ? `phase=${phase}` : "",
      reason ? `reason=${reason}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    return hints ? `[${code}] ${message} (${hints})` : `[${code}] ${message}`;
  }
  return getErrorMessage(error);
}

export function useStudioExecutionHandlers({
  project,
  expandedTool,
  currentCardId,
  seedRunId,
  currentToolDraft,
  selectedSourceId,
  selectedFileIds,
  draftSourceArtifactId,
  activeSessionId,
  activeRunId,
  generationSession,
  isProtocolPending,
  requiresSourceArtifact,
  hasSourceBinding,
  canRefine,
  setActiveSessionId,
  fetchArtifactHistory,
  focusChatComposer,
  syncStudioChatContextByStep,
  upsertCurrentCardSources,
  appendRuntimeArtifact,
}: UseStudioExecutionHandlersArgs) {
  const [runningActionsByCardId, setRunningActionsByCardId] = useState<
    Record<string, number>
  >({});
  const artifactRefreshTimersRef = useRef<number[]>([]);
  const draftRunIdRef = useRef<string | null>(null);
  const startCardAction = useCallback((cardId: string) => {
    setRunningActionsByCardId((prev) => ({
      ...prev,
      [cardId]: (prev[cardId] ?? 0) + 1,
    }));
  }, []);
  const endCardAction = useCallback((cardId: string) => {
    setRunningActionsByCardId((prev) => {
      const current = prev[cardId] ?? 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[cardId];
        return next;
      }
      return {
        ...prev,
        [cardId]: current - 1,
      };
    });
  }, []);
  const isStudioActionRunning = useMemo(() => {
    if (!currentCardId) return false;
    return (runningActionsByCardId[currentCardId] ?? 0) > 0;
  }, [currentCardId, runningActionsByCardId]);

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

  useEffect(() => {
    return () => {
      for (const timer of artifactRefreshTimersRef.current) {
        window.clearTimeout(timer);
      }
      artifactRefreshTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    draftRunIdRef.current = seedRunId ?? null;
  }, [activeSessionId, currentCardId, project?.id, seedRunId]);

  const buildStudioExecutionRequest = useCallback(() => {
    if (!project || !currentCardId) return null;
    const effectiveRagSourceIds = resolveEffectiveRagSourceIds(selectedFileIds);
    return {
      project_id: project.id,
      client_session_id: activeSessionId ?? undefined,
      source_artifact_id:
        selectedSourceId || draftSourceArtifactId || undefined,
      rag_source_ids: effectiveRagSourceIds,
      config: currentToolDraft,
    };
  }, [
    activeSessionId,
    currentCardId,
    currentToolDraft,
    draftSourceArtifactId,
    project,
    selectedFileIds,
    selectedSourceId,
  ]);

  const ensureActiveSession = useCallback(() => {
    if (activeSessionId) return true;
    toast({
      title: "Create session first",
      description:
        "Create a session from Session Switcher > New Session before running tools.",
      variant: "destructive",
    });
    return false;
  }, [activeSessionId]);

  const handleStudioLoadSources = useCallback(async () => {
    const cardId = currentCardId;
    if (!project || !cardId || isStudioActionRunning) return;
    try {
      startCardAction(cardId);
      const response = await studioCardsApi.getSources(cardId, project.id);
      const normalizedSources = (response?.data?.sources ?? []).map((item) => ({
        id: item.id,
        projectId: item.project_id ?? project.id,
        title: item.title,
        type: item.type,
        sessionId: item.session_id ?? null,
      }));
      const sources =
        cardId === "demonstration_animations"
          ? normalizedSources.filter(
              (item) =>
                item.projectId === project.id &&
                String(item.type || "").toLowerCase() === "pptx"
            )
          : normalizedSources;
      upsertCurrentCardSources(sources);
      toast({
        title: "Sources refreshed",
        description: `Loaded ${sources.length} source artifacts.`,
      });
    } catch (error) {
      toast({
        title: "Failed to load sources",
        description: formatStudioExecutionError(error),
        variant: "destructive",
      });
    } finally {
      endCardAction(cardId);
    }
  }, [
    currentCardId,
    endCardAction,
    isStudioActionRunning,
    project,
    startCardAction,
    upsertCurrentCardSources,
  ]);

  const handleStudioPreviewExecution = useCallback(async () => {
    const cardId = currentCardId;
    if (!cardId || isStudioActionRunning) return null;
    const requestBody = buildStudioExecutionRequest();
    if (!requestBody) return null;
    if (
      isRestrictedRagModeEnabled(currentToolDraft) &&
      requestBody.rag_source_ids.length === 0
    ) {
      toast({
        title: "Missing constrained sources",
        description: "Restricted mode requires at least one selected source.",
        variant: "destructive",
      });
      return null;
    }
    try {
      startCardAction(cardId);
      const response = await studioCardsApi.getExecutionPreview(
        cardId,
        requestBody
      );
      if (response?.data?.execution_preview) {
        console.info(
          "[studio.preview.request_preview]",
          response.data.execution_preview
        );
      }
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
        title: "Execution preview generated",
        description: endpoint,
      });
      return preview;
    } catch (error) {
      toast({
        title: "Execution preview failed",
        description: formatStudioExecutionError(error),
        variant: "destructive",
      });
      return null;
    } finally {
      endCardAction(cardId);
    }
  }, [
    buildStudioExecutionRequest,
    currentCardId,
    currentToolDraft,
    endCardAction,
    isStudioActionRunning,
    startCardAction,
  ]);

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

  const handleStudioPrepareDraft =
    useCallback(async (): Promise<StudioExecutionResult> => {
      if (!project || !currentCardId) {
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      if (!ensureActiveSession()) {
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      if (isProtocolPending) {
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      if (requiresSourceArtifact && !hasSourceBinding) {
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      const requestBody = buildStudioExecutionRequest();
      if (!requestBody) {
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      if (
        isRestrictedRagModeEnabled(currentToolDraft) &&
        requestBody.rag_source_ids.length === 0
      ) {
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      try {
        startCardAction(currentCardId);
        const response = await studioCardsApi.createDraft(
          currentCardId,
          requestBody
        );
        const executionResult = response?.data?.execution_result ?? {};
        const resourceKind =
          typeof executionResult.resource_kind === "string"
            ? executionResult.resource_kind
            : null;
        const session =
          typeof executionResult.session === "object" &&
          executionResult.session !== null
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
        const runNo = resolveExecutionRunNo(run);
        if (sessionId) setActiveSessionId(sessionId);
        draftRunIdRef.current = runId ?? null;
        return {
          ok: true,
          sessionId,
          effectiveSessionId: sessionId ?? activeSessionId ?? null,
          resourceKind,
          runId,
          runNo,
        };
      } catch (error) {
        toast({
          title: "Create draft failed",
          description: formatStudioExecutionError(error),
          variant: "destructive",
        });
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      } finally {
        endCardAction(currentCardId);
      }
    }, [
      activeSessionId,
      buildStudioExecutionRequest,
      currentCardId,
      currentToolDraft,
      endCardAction,
      ensureActiveSession,
      hasSourceBinding,
      isProtocolPending,
      project,
      requiresSourceArtifact,
      setActiveSessionId,
      startCardAction,
    ]);

  const handleStudioExecute =
    useCallback(async (): Promise<StudioExecutionResult> => {
      if (!project || !currentCardId) {
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      if (!ensureActiveSession()) {
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      if (isProtocolPending) {
        toast({
          title: "Card protocol pending",
          description:
            "Current card protocol is still pending and cannot execute yet.",
          variant: "destructive",
        });
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      if (requiresSourceArtifact && !hasSourceBinding) {
        toast({
          title: "Missing source artifact",
          description: "Bind a source artifact before executing this card.",
          variant: "destructive",
        });
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      const requestBody = buildStudioExecutionRequest();
      if (!requestBody) {
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }
      if (
        isRestrictedRagModeEnabled(currentToolDraft) &&
        requestBody.rag_source_ids.length === 0
      ) {
        toast({
          title: "Missing constrained sources",
          description:
            "Restricted mode is enabled and requires selected source files.",
          variant: "destructive",
        });
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: null,
          runNo: null,
        };
      }

      const requestRunId = draftRunIdRef.current ?? null;
      try {
        startCardAction(currentCardId);
        const requestPayload = {
          ...requestBody,
          run_id: requestRunId ?? undefined,
        };
        const response = await studioCardsApi.execute(
          currentCardId,
          requestPayload
        );
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
        const runNo = resolveExecutionRunNo(run);
        const responseData = (response?.data ?? {}) as {
          request_preview?: unknown;
        };
        if (responseData.request_preview) {
          console.info(
            "[studio.execute.request_preview]",
            responseData.request_preview
          );
        }

        if (sessionId) setActiveSessionId(sessionId);
        if (
          runId &&
          (requestRunId === null || draftRunIdRef.current === requestRunId)
        ) {
          draftRunIdRef.current = runId;
        }

        const effectiveSessionId = sessionId ?? activeSessionId;

        if (
          resourceKind === "artifact" &&
          expandedTool &&
          expandedTool !== "ppt" &&
          typeof executionResult.artifact === "object" &&
          executionResult.artifact !== null
        ) {
          const artifactPayload = executionResult.artifact as Record<
            string,
            unknown
          >;
          const artifactId =
            (artifactPayload.id as string | undefined) ||
            (artifactPayload.artifact_id as string | undefined);
          const artifactType =
            (artifactPayload.type as
              | ArtifactHistoryItem["artifactType"]
              | undefined) ?? "summary";

          if (artifactId) {
            appendRuntimeArtifact(expandedTool as StudioToolKey, {
              artifactId,
              sessionId:
                (artifactPayload.session_id as string | undefined) ??
                effectiveSessionId ??
                null,
              toolType: expandedTool,
              artifactType,
              artifactKind: undefined,
              title:
                (artifactPayload.title as string | undefined) ||
                TOOL_LABELS[expandedTool] + " - Generating",
              status: "completed",
              createdAt:
                (artifactPayload.updated_at as string | undefined) ||
                (artifactPayload.created_at as string | undefined) ||
                new Date().toISOString(),
              basedOnVersionId: null,
              runId,
              runNo,
            });
          }
        }

        await fetchArtifactHistory(project.id, effectiveSessionId);
        if (resourceKind === "session") {
          scheduleArtifactRefresh(project.id, effectiveSessionId);
        }

        toast({
          title: "Studio execution succeeded",
          description:
            resourceKind === "session" && sessionId
              ? `Started session flow ${sessionId.slice(0, 8)}`
              : sessionId
                ? `Generated session ${sessionId.slice(0, 8)}`
                : "Generation submitted and artifacts refreshed.",
        });

        return {
          ok: true,
          sessionId,
          effectiveSessionId,
          resourceKind,
          runId,
          runNo,
        };
      } catch (error) {
        toast({
          title: "Studio execution failed",
          description: formatStudioExecutionError(error),
          variant: "destructive",
        });
        const fallbackRunId = requestRunId ?? activeRunId ?? null;
        return {
          ok: false,
          sessionId: null,
          effectiveSessionId: activeSessionId ?? null,
          resourceKind: null,
          runId: fallbackRunId,
          runNo: null,
        };
      } finally {
        endCardAction(currentCardId);
      }
    }, [
      activeSessionId,
      activeRunId,
      appendRuntimeArtifact,
      buildStudioExecutionRequest,
      currentCardId,
      currentToolDraft,
      endCardAction,
      ensureActiveSession,
      expandedTool,
      fetchArtifactHistory,
      hasSourceBinding,
      isProtocolPending,
      project,
      requiresSourceArtifact,
      scheduleArtifactRefresh,
      setActiveSessionId,
      startCardAction,
    ]);

  const handleOpenChatRefine = useCallback(() => {
    if (!project || !currentCardId || !activeSessionId) return;
    if (!expandedTool || expandedTool === "ppt") return;

    syncStudioChatContextByStep(expandedTool, "preview", activeSessionId);

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
    activeSessionId,
    canRefine,
    currentCardId,
    expandedTool,
    focusChatComposer,
    project,
    syncStudioChatContextByStep,
  ]);

  const openPptPreviewPage = useCallback(
    (
      sessionId?: string | null,
      artifactId?: string | null,
      runId?: string | null
    ) => {
      if (!project) return null;
      const query = new URLSearchParams();
      if (sessionId) query.set("session", sessionId);
      if (artifactId) query.set("artifact_id", artifactId);
      if (runId) query.set("run", runId);
      return `/projects/${project.id}/generate${query.toString() ? `?${query.toString()}` : ""}`;
    },
    [project]
  );

  return {
    isStudioActionRunning,
    handleStudioLoadSources,
    handleStudioPreviewExecution,
    handleStudioPrepareDraft,
    handleStudioExecute,
    handleOpenChatRefine,
    openPptPreviewPage,
    resolvePptRunId,
  };
}
