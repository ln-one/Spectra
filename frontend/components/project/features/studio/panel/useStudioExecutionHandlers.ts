import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateApi, studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { ApiError } from "@/lib/sdk/client";
import { getArtifacts } from "@/lib/sdk/project-space/artifacts";
import type {
  ArtifactHistoryItem,
  GenerationToolType,
} from "@/lib/project-space/artifact-history";
import { toArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import { toast } from "@/hooks/use-toast";
import type { StudioToolKey, ToolDraftState } from "../tools";
import { TOOL_LABELS } from "../constants";
import type { StudioHistoryStatus } from "../history/types";
import type { StudioExecutionResult, StudioSourceOption } from "./types";

interface UseStudioExecutionHandlersArgs {
  project: { id: string } | null;
  expandedTool: GenerationToolType | null;
  currentCardId: string | null;
  seedRunId: string | null;
  currentToolDraft: ToolDraftState;
  selectedSourceId: string | null;
  selectedFileIds: string[];
  selectedLibraryIds: string[];
  selectedArtifactSourceIds: string[];
  draftSourceArtifactId: string | null;
  activeSessionId: string | null;
  activeRunId: string | null;
  generationSession: unknown;
  isProtocolPending: boolean;
  requiresSourceArtifact: boolean;
  hasSourceBinding: boolean;
  canRefine: boolean;
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

type StudioActionKind =
  | "prepare"
  | "preview"
  | "execute"
  | "refine"
  | "follow_up_turn"
  | "load_sources";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isUuidLike(value: string | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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

function resolveManagedArtifactForRun(
  artifacts: ArtifactHistoryItem[],
  toolType: StudioToolKey,
  sessionId: string,
  runId: string | null,
  artifactId: string | null
): ArtifactHistoryItem | null {
  const toolArtifacts = artifacts.filter(
    (item) => item.toolType === toolType && item.sessionId === sessionId
  );
  if (artifactId) {
    const matched = toolArtifacts.find((item) => item.artifactId === artifactId);
    if (matched) return matched;
  }
  if (runId) {
    const matched = toolArtifacts.find((item) => item.runId === runId);
    if (matched) return matched;
  }
  return toolArtifacts[0] ?? null;
}

export function useStudioExecutionHandlers({
  project,
  expandedTool,
  currentCardId,
  seedRunId,
  currentToolDraft,
  selectedSourceId,
  selectedFileIds,
  selectedLibraryIds,
  selectedArtifactSourceIds,
  draftSourceArtifactId,
  activeSessionId,
  activeRunId,
  generationSession,
  isProtocolPending,
  requiresSourceArtifact,
  hasSourceBinding,
  canRefine,
  fetchArtifactHistory,
  focusChatComposer,
  syncStudioChatContextByStep,
  upsertCurrentCardSources,
  appendRuntimeArtifact,
}: UseStudioExecutionHandlersArgs) {
  const [runningActionsByCardId, setRunningActionsByCardId] = useState<
    Record<string, number>
  >({});
  const [runningActionKindByCardId, setRunningActionKindByCardId] = useState<
    Record<string, StudioActionKind | null>
  >({});
  const artifactRefreshTimersRef = useRef<number[]>([]);
  const draftRunIdRef = useRef<string | null>(null);
  const startCardAction = useCallback((cardId: string, kind: StudioActionKind) => {
    setRunningActionsByCardId((prev) => ({
      ...prev,
      [cardId]: (prev[cardId] ?? 0) + 1,
    }));
    setRunningActionKindByCardId((prev) => ({
      ...prev,
      [cardId]: kind,
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
    setRunningActionKindByCardId((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  }, []);
  const isStudioActionRunning = useMemo(() => {
    if (!currentCardId) return false;
    return (runningActionsByCardId[currentCardId] ?? 0) > 0;
  }, [currentCardId, runningActionsByCardId]);
  const currentCardActionKind = useMemo(() => {
    if (!currentCardId) return null;
    return runningActionKindByCardId[currentCardId] ?? null;
  }, [currentCardId, runningActionKindByCardId]);

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
    const effectiveSelectedSourceIds = Array.from(
      new Set([...effectiveRagSourceIds, ...selectedArtifactSourceIds])
    );
    return {
      project_id: project.id,
      client_session_id: activeSessionId ?? undefined,
      primary_source_id: selectedSourceId || undefined,
      selected_source_ids: selectedArtifactSourceIds,
      source_artifact_id:
        selectedSourceId || draftSourceArtifactId || undefined,
      selected_file_ids: effectiveSelectedSourceIds,
      rag_source_ids: effectiveSelectedSourceIds,
      selected_library_ids: selectedLibraryIds,
      config: currentToolDraft,
    };
  }, [
    activeSessionId,
    currentCardId,
    currentToolDraft,
    draftSourceArtifactId,
    project,
    selectedFileIds,
    selectedLibraryIds,
    selectedArtifactSourceIds,
    selectedSourceId,
  ]);

  const ensureActiveSession = useCallback(() => {
    if (activeSessionId) return true;
    toast({
      title: "请先选择会话",
      description:
        "执行 Studio 卡片前，请先在会话选择器中创建或切换到目标会话。",
      variant: "destructive",
    });
    return false;
  }, [activeSessionId]);

  const assertSessionConsistency = useCallback(
    ({
      expectedSessionId,
      returnedSessionId,
      action,
    }: {
      expectedSessionId: string | null;
      returnedSessionId: string | null;
      action: "draft" | "execute" | "refine" | "follow_up_turn";
    }): boolean => {
      if (!expectedSessionId) return false;
      if (!returnedSessionId || returnedSessionId === expectedSessionId) {
        return true;
      }
      console.warn("[studio.session_mismatch]", {
        card_id: currentCardId,
        action,
        expected_session_id: expectedSessionId,
        returned_session_id: returnedSessionId,
        mismatch_reason: "response_session_differs_from_active_session",
      });
      toast({
        title: "会话不一致，已阻断执行",
        description: "返回会话与当前会话不一致，请刷新后重试。",
        variant: "destructive",
      });
      return false;
    },
    [currentCardId]
  );

  const handleStudioLoadSources = useCallback(async () => {
    const cardId = currentCardId;
    if (!project || !cardId || isStudioActionRunning) return;
    try {
      startCardAction(cardId, "load_sources");
      const response = await studioCardsApi.getSources(cardId, project.id);
      const sources = (response?.data?.sources ?? []).map((item) => ({
        id: item.id,
        title: (() => {
          const title = readString(item.title);
          return title && !isUuidLike(title) ? title : undefined;
        })(),
        type: item.type,
        sessionId: item.session_id ?? null,
      }));
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
      startCardAction(cardId, "preview");
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
      const explicitRunId =
        typeof fallback === "string" && fallback.trim() ? fallback : null;
      if (explicitRunId) return explicitRunId;
      const stateRunId = activeRunId;
      if (stateRunId) return stateRunId;
      const sessionRunId = (
        generationSession as { current_run?: { run_id?: string } } | null
      )?.current_run?.run_id;
      if (sessionRunId) return sessionRunId;
      return null;
    },
    [activeRunId, generationSession]
  );

  const reconcileManagedExecutionOutcome = useCallback(
    async ({
      toolType,
      sessionId,
      runId,
      artifactId,
    }: {
      toolType: StudioToolKey;
      sessionId: string | null;
      runId: string | null;
      artifactId?: string | null;
    }): Promise<StudioExecutionResult | null> => {
      if (!project?.id || !sessionId) return null;

      try {
        await fetchArtifactHistory(project.id, sessionId);
        const resolvedRunId = runId ?? null;
        const [runResponse, artifactsResponse] = await Promise.all([
          resolvedRunId
            ? generateApi.getRun(sessionId, resolvedRunId).catch(() => null)
            : null,
          getArtifacts(project.id, { session_id: sessionId }),
        ]);
        const runRecord =
          typeof runResponse?.data?.run === "object" && runResponse.data.run
            ? (runResponse.data.run as unknown as Record<string, unknown>)
            : null;
        const runNo = resolveExecutionRunNo(runRecord);
        const runStatus =
          readString(runRecord?.run_status) ?? null;
        const artifactItems = (artifactsResponse.artifacts ?? []).map(
          toArtifactHistoryItem
        );
        const matchedArtifact = resolveManagedArtifactForRun(
          artifactItems,
          toolType,
          sessionId,
          resolvedRunId,
          artifactId ?? null
        );

        if (matchedArtifact) {
          appendRuntimeArtifact(toolType, matchedArtifact);
          return {
            ok: true,
            sessionId,
            effectiveSessionId: sessionId,
            resourceKind: "artifact",
            runId: resolvedRunId ?? matchedArtifact.runId ?? null,
            runNo: runNo ?? matchedArtifact.runNo ?? null,
            artifactId: matchedArtifact.artifactId,
            status: runStatus === "completed" ? "completed" : "previewing",
            recovered: true,
          };
        }

        if (runStatus === "failed") {
          return {
            ok: false,
            sessionId,
            effectiveSessionId: sessionId,
            resourceKind: null,
            runId: resolvedRunId,
            runNo,
            artifactId: null,
            status: "failed",
            recovered: true,
          };
        }

        if (
          runStatus === "processing" ||
          runStatus === "pending"
        ) {
          return {
            ok: true,
            sessionId,
            effectiveSessionId: sessionId,
            resourceKind: "session",
            runId: resolvedRunId,
            runNo,
            artifactId: null,
            status: "processing",
            recovered: true,
          };
        }
      } catch {
        // Keep the original execution result when reconciliation cannot establish truth.
      }

      return null;
    },
    [appendRuntimeArtifact, fetchArtifactHistory, project?.id]
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
        startCardAction(currentCardId, "prepare");
        const expectedSessionId = activeSessionId;
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
        if (
          !assertSessionConsistency({
            expectedSessionId,
            returnedSessionId: sessionId,
            action: "draft",
          })
        ) {
          return {
            ok: false,
            sessionId: sessionId ?? null,
            effectiveSessionId: expectedSessionId,
            resourceKind: null,
            runId: null,
            runNo: null,
            status: "failed",
          };
        }
        draftRunIdRef.current = runId ?? null;
        return {
          ok: true,
          sessionId: sessionId ?? expectedSessionId,
          effectiveSessionId: expectedSessionId,
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
      assertSessionConsistency,
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
        startCardAction(currentCardId, "execute");
        const expectedSessionId = activeSessionId;
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
        let createdArtifactId: string | null = null;
        const responseData = (response?.data ?? {}) as {
          request_preview?: unknown;
        };
        if (responseData.request_preview) {
          console.info(
            "[studio.execute.request_preview]",
            responseData.request_preview
          );
        }
        if (
          !assertSessionConsistency({
            expectedSessionId,
            returnedSessionId: sessionId,
            action: "execute",
          })
        ) {
          return {
            ok: false,
            sessionId: sessionId ?? null,
            effectiveSessionId: expectedSessionId,
            resourceKind: null,
            runId: null,
            runNo: null,
            artifactId: null,
            status: "failed",
          };
        }
        if (
          runId &&
          (requestRunId === null || draftRunIdRef.current === requestRunId)
        ) {
          draftRunIdRef.current = runId;
        }

        const effectiveSessionId = expectedSessionId;
        const immediateResult: StudioExecutionResult = {
          ok: true,
          sessionId: sessionId ?? expectedSessionId,
          effectiveSessionId,
          resourceKind,
          runId,
          runNo,
          artifactId: null,
          status:
            resourceKind === "artifact"
              ? "previewing"
              : resourceKind === "session"
                ? "processing"
                : "previewing",
        };

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
          const artifactMetadata =
            artifactPayload.metadata &&
            typeof artifactPayload.metadata === "object"
              ? (artifactPayload.metadata as Record<string, unknown>)
              : null;
          const artifactSessionId =
            (artifactPayload.session_id as string | undefined) ?? null;
          if (
            !assertSessionConsistency({
              expectedSessionId,
              returnedSessionId: artifactSessionId,
              action: "execute",
            })
          ) {
            return {
              ok: false,
              sessionId: sessionId ?? artifactSessionId,
              effectiveSessionId: expectedSessionId,
              resourceKind: null,
              runId: null,
              runNo: null,
              artifactId: null,
              status: "failed",
            };
          }

          if (artifactId) {
            createdArtifactId = artifactId;
            appendRuntimeArtifact(expandedTool as StudioToolKey, {
              artifactId,
              sessionId: artifactSessionId ?? effectiveSessionId ?? null,
              toolType: expandedTool,
              artifactType,
              metadata: artifactMetadata,
              artifactKind: undefined,
              sourceArtifactId:
                selectedSourceId || draftSourceArtifactId || null,
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
            immediateResult.artifactId = artifactId;
          }
        }

        await fetchArtifactHistory(project.id, effectiveSessionId);

        const finalResult =
          expandedTool && expandedTool !== "ppt"
            ? (await reconcileManagedExecutionOutcome({
                toolType: expandedTool as StudioToolKey,
                sessionId: effectiveSessionId,
                runId: runId ?? requestRunId,
                artifactId: createdArtifactId,
              })) ?? immediateResult
            : immediateResult;
        if (
          finalResult.status === "processing" &&
          typeof effectiveSessionId === "string" &&
          effectiveSessionId.trim()
        ) {
          scheduleArtifactRefresh(project.id, effectiveSessionId);
        }

        toast({
          title:
            finalResult.recovered && finalResult.status === "processing"
              ? "Studio execution continues"
              : "Studio execution succeeded",
          description:
            finalResult.recovered && finalResult.status === "processing"
              ? "请求已发出，后端仍在继续处理本次教学文档。"
              : finalResult.resourceKind === "session" && finalResult.sessionId
                ? `Started session flow ${finalResult.sessionId.slice(0, 8)}`
                : finalResult.sessionId
                  ? `Generated session ${finalResult.sessionId.slice(0, 8)}`
                  : "Generation submitted and artifacts refreshed.",
        });

        return finalResult;
      } catch (error) {
        const reconciled =
          expandedTool && expandedTool !== "ppt"
            ? await reconcileManagedExecutionOutcome({
                toolType: expandedTool as StudioToolKey,
                sessionId: activeSessionId ?? null,
                runId: requestRunId ?? activeRunId ?? null,
                artifactId: null,
              })
            : null;
        if (reconciled) {
          toast({
            title:
              reconciled.ok && reconciled.status === "processing"
                ? "Studio execution continues"
                : reconciled.ok
                  ? "Studio execution recovered"
                  : "Studio execution failed",
            description:
              reconciled.ok && reconciled.status === "processing"
                ? "请求链路有抖动，但后端仍在继续处理本次教学文档。"
                : reconciled.ok
                  ? "请求链路有抖动，但后端结果已成功对账恢复。"
                  : "后端已确认本次教学文档执行失败。",
            variant: reconciled.ok ? undefined : "destructive",
          });
          return reconciled;
        }
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
          artifactId: null,
          status: "failed",
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
      draftSourceArtifactId,
      endCardAction,
      ensureActiveSession,
      expandedTool,
      fetchArtifactHistory,
      hasSourceBinding,
      isProtocolPending,
      project,
      reconcileManagedExecutionOutcome,
      requiresSourceArtifact,
      scheduleArtifactRefresh,
      selectedSourceId,
      assertSessionConsistency,
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

  const handleStructuredRefineArtifact = useCallback(
    async ({
      artifactId,
      message,
      refineMode,
      selectionAnchor,
      config,
    }: {
      artifactId: string;
      message: string;
      refineMode?: "chat_refine" | "structured_refine" | "follow_up_turn";
      selectionAnchor?: Record<string, unknown>;
      config?: Record<string, unknown>;
    }) => {
      if (!project || !currentCardId) {
        return {
          ok: false,
          artifactId: null,
          effectiveSessionId: activeSessionId ?? null,
          insertedNodeId: null,
        };
      }
      if (!activeSessionId) {
        return {
          ok: false,
          artifactId: null,
          effectiveSessionId: null,
          insertedNodeId: null,
        };
      }

      try {
        startCardAction(currentCardId, "refine");
        const effectiveSelectedSourceIds = Array.from(
          new Set([
            ...resolveEffectiveRagSourceIds(selectedFileIds),
            ...selectedArtifactSourceIds,
          ])
        );
        const response = await studioCardsApi.refineArtifact(currentCardId, {
          project_id: project.id,
          session_id: activeSessionId ?? undefined,
          artifact_id: artifactId,
          message,
          refine_mode: refineMode ?? "structured_refine",
          selection_anchor: selectionAnchor as any,
          config,
          selected_file_ids: effectiveSelectedSourceIds,
          rag_source_ids: effectiveSelectedSourceIds,
          selected_library_ids: selectedLibraryIds,
        });
        const executionResult = response?.data?.execution_result ?? {};
        const artifact =
          typeof executionResult.artifact === "object" &&
          executionResult.artifact !== null
            ? (executionResult.artifact as Record<string, unknown>)
            : null;
        const returnedSessionId =
          (typeof executionResult.session === "object" &&
          executionResult.session !== null
            ? ((executionResult.session as Record<string, unknown>)
                .session_id ??
              (executionResult.session as Record<string, unknown>).id)
            : null) ?? null;
        if (
          !assertSessionConsistency({
            expectedSessionId: activeSessionId,
            returnedSessionId:
              typeof returnedSessionId === "string" ? returnedSessionId : null,
            action: "refine",
          })
        ) {
          return {
            ok: false,
            artifactId: null,
            effectiveSessionId: activeSessionId,
            insertedNodeId: null,
          };
        }
        const effectiveSessionId = activeSessionId;

        if (effectiveSessionId) {
          void fetchArtifactHistory(project.id, String(effectiveSessionId));
        }

        return {
          ok: true,
          artifactId:
            (typeof artifact?.id === "string" && artifact.id) || artifactId,
          effectiveSessionId:
            typeof effectiveSessionId === "string" ? effectiveSessionId : null,
          insertedNodeId:
            (typeof artifact?.inserted_node_id === "string" &&
              artifact.inserted_node_id) ||
            null,
        };
      } catch (error) {
        toast({
          title: "Structured refine failed",
          description: formatStudioExecutionError(error),
          variant: "destructive",
        });
        return {
          ok: false,
          artifactId: null,
          effectiveSessionId: activeSessionId ?? null,
          insertedNodeId: null,
        };
      } finally {
        endCardAction(currentCardId);
      }
    },
    [
      activeSessionId,
      currentCardId,
      endCardAction,
      fetchArtifactHistory,
      project,
      scheduleArtifactRefresh,
      selectedFileIds,
      selectedLibraryIds,
      selectedArtifactSourceIds,
      startCardAction,
    ]
  );

  const handleFollowUpTurn = useCallback(
    async ({
      artifactId,
      teacherAnswer,
      turnAnchor,
      config,
    }: {
      artifactId: string;
      teacherAnswer: string;
      turnAnchor?: string;
      config?: Record<string, unknown>;
    }) => {
      if (!project || !currentCardId) {
        return {
          ok: false,
          artifactId: null,
          effectiveSessionId: activeSessionId ?? null,
          turnResult: null,
          latestRunnableState: null,
          nextFocus: null,
          turnAnchor: null,
          raw: null,
        };
      }
      if (!activeSessionId) {
        return {
          ok: false,
          artifactId: null,
          effectiveSessionId: null,
          turnResult: null,
          latestRunnableState: null,
          nextFocus: null,
          turnAnchor: null,
          raw: null,
        };
      }

      try {
        startCardAction(currentCardId, "follow_up_turn");
        const effectiveSelectedSourceIds = Array.from(
          new Set([
            ...resolveEffectiveRagSourceIds(selectedFileIds),
            ...selectedArtifactSourceIds,
          ])
        );
        const response = await studioCardsApi.turn({
          project_id: project.id,
          session_id: activeSessionId,
          artifact_id: artifactId,
          teacher_answer: teacherAnswer,
          turn_anchor: turnAnchor,
          config,
          selected_file_ids: effectiveSelectedSourceIds,
          rag_source_ids: effectiveSelectedSourceIds,
          selected_library_ids: selectedLibraryIds,
        });
        const payload = response?.data ?? null;
        const returnedSessionId =
          (typeof payload?.artifact?.session_id === "string" &&
            payload.artifact.session_id) ||
          null;
        if (
          !assertSessionConsistency({
            expectedSessionId: activeSessionId,
            returnedSessionId,
            action: "follow_up_turn",
          })
        ) {
          return {
            ok: false,
            artifactId: null,
            effectiveSessionId: activeSessionId,
            turnResult: null,
            latestRunnableState: null,
            nextFocus: null,
            turnAnchor: null,
            raw: null,
          };
        }
        if (activeSessionId) {
          await fetchArtifactHistory(project.id, activeSessionId);
        }
        return {
          ok: true,
          artifactId:
            (typeof payload?.artifact?.id === "string" && payload.artifact.id) ||
            artifactId,
          effectiveSessionId: activeSessionId ?? null,
          turnResult: payload?.turn_result ?? null,
          latestRunnableState: payload?.latest_runnable_state ?? null,
          nextFocus:
            typeof payload?.next_focus === "string" ? payload.next_focus : null,
          turnAnchor:
            typeof payload?.turn_anchor === "string" ? payload.turn_anchor : null,
          raw: payload,
        };
      } catch (error) {
        toast({
          title: "Follow-up turn failed",
          description: formatStudioExecutionError(error),
          variant: "destructive",
        });
        return {
          ok: false,
          artifactId: null,
          effectiveSessionId: activeSessionId ?? null,
          turnResult: null,
          latestRunnableState: null,
          nextFocus: null,
          turnAnchor: null,
          raw: null,
        };
      } finally {
        endCardAction(currentCardId);
      }
    },
    [
      activeSessionId,
      currentCardId,
      endCardAction,
      fetchArtifactHistory,
      project,
      scheduleArtifactRefresh,
      selectedFileIds,
      selectedLibraryIds,
      selectedArtifactSourceIds,
      startCardAction,
    ]
  );

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
    currentCardActionKind,
    handleStudioLoadSources,
    handleStudioPreviewExecution,
    handleStudioPrepareDraft,
    handleStudioExecute,
    handleOpenChatRefine,
    handleFollowUpTurn,
    handleStructuredRefineArtifact,
    openPptPreviewPage,
    resolvePptRunId,
  };
}
