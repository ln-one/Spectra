import { useCallback, useEffect, useRef, useState } from "react";
import { generateApi, studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
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
  setActiveRunId: (runId: string | null) => void;
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

export function useStudioExecutionHandlers({
  project,
  expandedTool,
  currentCardId,
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
  setActiveRunId,
  fetchArtifactHistory,
  focusChatComposer,
  syncStudioChatContextByStep,
  upsertCurrentCardSources,
  appendRuntimeArtifact,
}: UseStudioExecutionHandlersArgs) {
  const [isStudioActionRunning, setIsStudioActionRunning] = useState(false);
  const artifactRefreshTimersRef = useRef<number[]>([]);

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

  const buildStudioExecutionRequest = useCallback(() => {
    if (!project || !currentCardId) return null;
    return {
      project_id: project.id,
      client_session_id: activeSessionId ?? undefined,
      source_artifact_id:
        selectedSourceId || draftSourceArtifactId || undefined,
      rag_source_ids: selectedFileIds,
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
    if (!project || !currentCardId || isStudioActionRunning) return;
    try {
      setIsStudioActionRunning(true);
      const response = await studioCardsApi.getSources(
        currentCardId,
        project.id
      );
      const sources = (response?.data?.sources ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
      }));
      upsertCurrentCardSources(sources);
      toast({
        title: "Sources refreshed",
        description: `Loaded ${sources.length} source artifacts.`,
      });
    } catch (error) {
      toast({
        title: "Failed to load sources",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsStudioActionRunning(false);
    }
  }, [currentCardId, isStudioActionRunning, project, upsertCurrentCardSources]);

  const handleStudioPreviewExecution = useCallback(async () => {
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
        title: "Execution preview generated",
        description: endpoint,
      });
    } catch (error) {
      toast({
        title: "Execution preview failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsStudioActionRunning(false);
    }
  }, [buildStudioExecutionRequest, currentCardId, isStudioActionRunning]);

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

  const handleStudioExecute =
    useCallback(async (): Promise<StudioExecutionResult> => {
      if (!project || !currentCardId || isStudioActionRunning) {
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

      try {
        setIsStudioActionRunning(true);
        const response = await studioCardsApi.execute(
          currentCardId,
          requestBody
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

        if (sessionId) setActiveSessionId(sessionId);
        if (runId) setActiveRunId(runId);

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
        scheduleArtifactRefresh(project.id, effectiveSessionId);

        if (expandedTool === "word" && sessionId) {
          void (async () => {
            let hasConfirmedOutline = false;
            for (let index = 0; index < 28; index += 1) {
              try {
                const sessionPayload = await generateApi.getSession(sessionId);
                const sessionState = (
                  (sessionPayload?.data as { session?: { state?: string } })
                    ?.session?.state ??
                  (sessionPayload?.data as { state?: string })?.state ??
                  ""
                ).toUpperCase();
                if (
                  !hasConfirmedOutline &&
                  sessionState === "AWAITING_OUTLINE_CONFIRM"
                ) {
                  await generateApi.confirmOutline(sessionId, {
                    continue_from_retrieval: false,
                  });
                  hasConfirmedOutline = true;
                  continue;
                }
                if (sessionState === "SUCCESS" || sessionState === "FAILED") {
                  break;
                }
              } catch {
                // Ignore transient polling failures and keep retrying.
              }
              await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 1800);
              });
            }
            await fetchArtifactHistory(project.id, sessionId);
          })();
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
          description: getErrorMessage(error),
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
        setIsStudioActionRunning(false);
      }
    }, [
      activeSessionId,
      appendRuntimeArtifact,
      buildStudioExecutionRequest,
      currentCardId,
      ensureActiveSession,
      expandedTool,
      fetchArtifactHistory,
      hasSourceBinding,
      isProtocolPending,
      isStudioActionRunning,
      project,
      requiresSourceArtifact,
      scheduleArtifactRefresh,
      setActiveRunId,
      setActiveSessionId,
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
    handleStudioExecute,
    handleOpenChatRefine,
    openPptPreviewPage,
    resolvePptRunId,
  };
}
