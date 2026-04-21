import { generateApi, previewApi, projectSpaceApi } from "@/lib/sdk";
import { ApiError, createApiError, getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import { groupArtifactsByTool } from "@/lib/project-space/artifact-history";
import {
  buildArtifactDownloadFilename,
  inferArtifactDownloadExt,
} from "@/lib/project-space/download-filename";
import { mapSessionsToHistory } from "./generation-actions.helpers";
import type {
  Artifact,
  GenerationHistory,
  OutlineDocument,
  ProjectStoreContext,
  ProjectState,
  SessionStatePayload,
} from "./types";

function extractRunId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const runId = (payload as { run_id?: unknown }).run_id;
  return typeof runId === "string" && runId.trim() ? runId : null;
}

function extractCurrentRunId(
  sessionPayload: SessionStatePayload | null
): string | null {
  if (!sessionPayload || typeof sessionPayload !== "object") return null;
  return extractRunId(
    (sessionPayload as SessionStatePayload & { current_run?: unknown })
      .current_run
  );
}

function isTransientNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch")
  );
}

function isFallbackSessionTitle(title: string, sessionId: string): boolean {
  const normalized = title.trim();
  return normalized === `会话 ${sessionId.slice(-6)}`;
}

function areGenerationHistoriesEquivalent(
  currentHistory: GenerationHistory[],
  nextHistory: GenerationHistory[]
): boolean {
  if (currentHistory === nextHistory) return true;
  if (currentHistory.length !== nextHistory.length) return false;
  return currentHistory.every((currentItem, index) => {
    const nextItem = nextHistory[index];
    return (
      currentItem?.id === nextItem?.id &&
      currentItem?.toolId === nextItem?.toolId &&
      currentItem?.toolName === nextItem?.toolName &&
      currentItem?.status === nextItem?.status &&
      currentItem?.sessionState === nextItem?.sessionState &&
      currentItem?.createdAt === nextItem?.createdAt &&
      currentItem?.title === nextItem?.title &&
      currentItem?.titleSource === nextItem?.titleSource
    );
  });
}

function resolveOutlineBaseVersion(
  session: SessionStatePayload | null | undefined
): number {
  const parsed = extractOutlineVersion(session);
  if (parsed >= 1) return parsed;
  return 1;
}

function extractOutlineVersion(
  session: SessionStatePayload | null | undefined
): number {
  const rawVersion =
    session && typeof session === "object" ? session.outline?.version : null;
  const parsed =
    typeof rawVersion === "number"
      ? rawVersion
      : Number.parseInt(String(rawVersion ?? ""), 10);
  if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  return 0;
}

function readSessionSnapshotArtifacts(
  snapshotData: unknown,
  projectId: string,
  sessionId: string
): Artifact[] {
  if (!snapshotData || typeof snapshotData !== "object") return [];
  const rawArtifacts = (snapshotData as { session_artifacts?: unknown })
    .session_artifacts;
  if (!Array.isArray(rawArtifacts)) return [];

  const fallbackTimestamp = new Date().toISOString();
  const normalized: Artifact[] = [];
  const allowedArtifactTypes: Artifact["type"][] = [
    "summary",
    "html",
    "gif",
    "pptx",
    "docx",
    "mindmap",
    "exercise",
    "mp4",
  ];
  const normalizeArtifactType = (value: unknown): Artifact["type"] => {
    if (typeof value !== "string") return "summary";
    const normalizedValue = value.trim() as Artifact["type"];
    return allowedArtifactTypes.includes(normalizedValue)
      ? normalizedValue
      : "summary";
  };

  for (const raw of rawArtifacts) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.artifact_id === "string" ? row.artifact_id.trim() : "";
    if (!id) continue;

    const type = normalizeArtifactType(row.type);
    const createdAt =
      typeof row.created_at === "string" && row.created_at.trim()
        ? row.created_at.trim()
        : fallbackTimestamp;
    const updatedAt =
      typeof row.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at.trim()
        : createdAt;
    const basedOnVersionId =
      typeof row.based_on_version_id === "string" &&
      row.based_on_version_id.trim()
        ? row.based_on_version_id.trim()
        : null;
    const sourceMetadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    const metadata: Record<string, unknown> = {
      ...(sourceMetadata ?? {}),
    };

    if (
      typeof row.replaces_artifact_id === "string" &&
      row.replaces_artifact_id.trim() &&
      typeof metadata.replaces_artifact_id !== "string"
    ) {
      metadata.replaces_artifact_id = row.replaces_artifact_id.trim();
    }
    if (
      typeof row.superseded_by_artifact_id === "string" &&
      row.superseded_by_artifact_id.trim() &&
      typeof metadata.superseded_by_artifact_id !== "string"
    ) {
      metadata.superseded_by_artifact_id = row.superseded_by_artifact_id.trim();
    }
    if (
      typeof row.title === "string" &&
      row.title.trim() &&
      typeof metadata.title !== "string"
    ) {
      metadata.title = row.title.trim();
    }

    normalized.push({
      id,
      project_id: projectId,
      session_id: sessionId,
      based_on_version_id: basedOnVersionId,
      owner_user_id: null,
      type,
      visibility: "private",
      storage_path: undefined,
      metadata,
      created_at: createdAt,
      updated_at: updatedAt,
    });
  }

  return normalized;
}

function mergeArtifacts(projectArtifacts: Artifact[], snapshotArtifacts: Artifact[]): Artifact[] {
  if (snapshotArtifacts.length === 0) return projectArtifacts;
  if (projectArtifacts.length === 0) return snapshotArtifacts;

  const mergedById = new Map<string, Artifact>();
  for (const artifact of snapshotArtifacts) {
    mergedById.set(artifact.id, artifact);
  }
  for (const artifact of projectArtifacts) {
    mergedById.set(artifact.id, artifact);
  }
  return Array.from(mergedById.values());
}

export function createGenerationActions({
  set,
  get,
}: ProjectStoreContext): Pick<
  ProjectState,
  | "fetchGenerationHistory"
  | "fetchArtifactHistory"
  | "exportArtifact"
  | "setActiveSessionId"
  | "setActiveRunId"
  | "updateOutline"
  | "redraftOutline"
  | "confirmOutline"
> {
  return {
    fetchGenerationHistory: async (projectId: string) => {
      try {
        const response = await generateApi.listSessions({
          project_id: projectId,
          limit: 20,
        });
        const sessions = response?.data?.sessions ?? [];
        const previousHistory = get().generationHistory;
        const previousTitleById = new Map(
          previousHistory.map((item) => [item.id, item.title])
        );
        const history: GenerationHistory[] = mapSessionsToHistory(sessions).map(
          (item) => {
            const previousTitle = previousTitleById.get(item.id);
            if (!previousTitle) return item;
            if (!isFallbackSessionTitle(item.title, item.id)) return item;
            return {
              ...item,
              title: previousTitle,
            };
          }
        );
        const activeSessionId =
          get().activeSessionId ??
          get().generationSession?.session?.session_id ??
          (history.length > 0 ? history[0].id : null);
        const activeRunId =
          activeSessionId &&
          activeSessionId === get().generationSession?.session?.session_id
            ? extractCurrentRunId(get().generationSession)
            : null;
        const previousState = get();
        const historyChanged = !areGenerationHistoriesEquivalent(
          previousState.generationHistory,
          history
        );
        const activeSessionChanged =
          previousState.activeSessionId !== activeSessionId;
        const activeRunChanged = previousState.activeRunId !== activeRunId;

        if (historyChanged || activeSessionChanged || activeRunChanged) {
          set({
            generationHistory: history,
            activeSessionId,
            activeRunId,
          });
          await get().fetchArtifactHistory(projectId, activeSessionId);
        }
      } catch (error) {
        const message = getErrorMessage(error);
        toast({
          title: "获取最近生成失败",
          description: message,
          variant: "destructive",
        });
      }
    },

    fetchArtifactHistory: async (
      projectId: string,
      sessionId?: string | null
    ) => {
      try {
        const effectiveSessionId =
          sessionId ??
          get().activeSessionId ??
          get().generationSession?.session?.session_id ??
          null;

        if (!effectiveSessionId) {
          set({
            artifactHistoryByTool: groupArtifactsByTool([]),
            currentSessionArtifacts: [],
          });
          return;
        }

        const [artifactsResponse, sessionSnapshotResponse] = await Promise.all([
          projectSpaceApi.getArtifacts(projectId, {
            session_id: effectiveSessionId,
          }),
          generateApi
            .getSessionSnapshot(effectiveSessionId)
            .catch((error: unknown) => {
              console.warn(
                "Session snapshot fetch failed while loading artifact history:",
                getErrorMessage(error)
              );
              return null;
            }),
        ]);
        const projectArtifacts =
          ((artifactsResponse?.artifacts ?? []) as Artifact[]) || [];
        const snapshotArtifacts = readSessionSnapshotArtifacts(
          sessionSnapshotResponse?.data,
          projectId,
          effectiveSessionId
        );
        const artifacts = mergeArtifacts(projectArtifacts, snapshotArtifacts);
        const sessionHistoryByTool = groupArtifactsByTool(artifacts);
        const sessionArtifacts = Object.values(sessionHistoryByTool)
          .flat()
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

        set({
          artifactHistoryByTool: sessionHistoryByTool,
          currentSessionArtifacts: sessionArtifacts,
          generationSession:
            effectiveSessionId ===
              (get().activeSessionId ??
                get().generationSession?.session?.session_id ??
                null) && sessionSnapshotResponse?.data
              ? {
                  ...(get().generationSession ?? {}),
                  ...(sessionSnapshotResponse.data as SessionStatePayload),
                }
              : get().generationSession,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        set({
          artifactHistoryByTool: groupArtifactsByTool([]),
          currentSessionArtifacts: [],
        });
        if (isTransientNetworkFailure(error)) {
          console.warn("Artifact history fetch failed transiently:", message);
          return;
        }
        toast({
          title: "获取成果历史失败",
          description: message,
          variant: "destructive",
        });
      }
    },

    exportArtifact: async (artifactId: string) => {
      const artifact = get().currentSessionArtifacts.find(
        (item) => item.artifactId === artifactId
      );
      if (!artifact) {
        toast({
          title: "导出失败",
          description: "未找到对应成果",
          variant: "destructive",
        });
        return;
      }

      const projectId = get().project?.id;
      if (projectId) {
        try {
          const blob = await projectSpaceApi.downloadArtifact(
            projectId,
            artifactId
          );
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = buildArtifactDownloadFilename({
            title: artifact.title,
            artifactId: artifact.artifactId,
            artifactType: artifact.artifactType,
            ext: inferArtifactDownloadExt(
              artifact.artifactType as Artifact["type"]
            ),
          });
          link.click();
          URL.revokeObjectURL(url);
          toast({
            title: "导出成功",
            description: "文件已开始下载",
          });
          return;
        } catch {
          // Fallback to preview-export branch for virtual artifacts.
        }
      }

      const sessionId =
        artifact.sessionId ??
        get().activeSessionId ??
        get().generationSession?.session?.session_id ??
        null;
      if (!sessionId) {
        toast({
          title: "导出失败",
          description: "缺少会话上下文，无法导出",
          variant: "destructive",
        });
        return;
      }

      try {
        const format =
          artifact.toolType === "summary" || artifact.toolType === "outline"
            ? "markdown"
            : "json";
        const response = await previewApi.exportSessionPreview(sessionId, {
          artifact_id: artifact.artifactId,
          format,
          include_sources: true,
        });
        const content = response?.data?.content ?? "";
        if (!content) {
          toast({
            title: "导出失败",
            description: "服务端未返回可下载内容",
            variant: "destructive",
          });
          return;
        }
        const blob = new Blob([content], {
          type:
            format === "markdown"
              ? "text/markdown;charset=utf-8"
              : "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const ext = format === "markdown" ? "md" : "json";
        const link = document.createElement("a");
        link.href = url;
        link.download = buildArtifactDownloadFilename({
          title: artifact.title,
          artifactId: artifact.artifactId,
          artifactType: artifact.artifactType,
          ext,
        });
        link.click();
        URL.revokeObjectURL(url);
        toast({
          title: "导出成功",
          description: "文件已开始下载",
        });
      } catch (error) {
        const message = getErrorMessage(error);
        toast({
          title: "导出失败",
          description: message,
          variant: "destructive",
        });
      }
    },

    setActiveSessionId: (sessionId: string | null) =>
      set((state) => ({
        activeSessionId: sessionId,
        activeRunId:
          sessionId && sessionId === state.activeSessionId
            ? state.activeRunId
            : null,
      })),

    setActiveRunId: (runId: string | null) => set({ activeRunId: runId }),

    updateOutline: async (sessionId: string, outline: OutlineDocument) => {
      try {
        const currentRunId = get().activeRunId ?? undefined;
        const [runScopedBeforeUpdate, sessionScopedBeforeUpdate] =
          currentRunId
            ? await Promise.all([
                generateApi.getSessionSnapshot(sessionId, {
                  run_id: currentRunId,
                }),
                generateApi.getSessionSnapshot(sessionId),
              ])
            : [await generateApi.getSessionSnapshot(sessionId), null];
        const runScopedPayload = runScopedBeforeUpdate?.data ?? null;
        const sessionScopedPayload = sessionScopedBeforeUpdate?.data ?? null;
        const runScopedVersion = extractOutlineVersion(
          runScopedPayload as SessionStatePayload | null
        );
        const sessionScopedVersion = extractOutlineVersion(
          sessionScopedPayload as SessionStatePayload | null
        );
        const latestBeforePayload =
          sessionScopedVersion > runScopedVersion
            ? sessionScopedPayload
            : runScopedPayload;
        const baseVersion = resolveOutlineBaseVersion(
          latestBeforePayload as SessionStatePayload | null
        );

        await generateApi.sendCommand(sessionId, {
          command: {
            command_type: "UPDATE_OUTLINE",
            base_version: baseVersion,
            outline,
            run_id: currentRunId,
          },
        });
        const preferredRunId =
          extractCurrentRunId(latestBeforePayload) || get().activeRunId;
        const sessionResponse = await generateApi.getSessionSnapshot(
          sessionId,
          {
            run_id: preferredRunId,
          }
        );
        const latestSessionPayload = sessionResponse?.data ?? null;
        set({
          generationSession: latestSessionPayload,
          activeRunId:
            extractCurrentRunId(latestSessionPayload) || preferredRunId,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        set({
          error: createApiError({ code: "UPDATE_OUTLINE_FAILED", message }),
        });
        toast({
          title: "更新大纲失败",
          description: message,
          variant: "destructive",
        });
        throw error;
      }
    },

    redraftOutline: async (sessionId: string, instruction: string) => {
      const currentRunId = get().activeRunId;
      try {
        const latestBeforeRedraft = await generateApi.getSessionSnapshot(
          sessionId,
          {
            run_id: currentRunId || undefined,
          }
        );
        const latestBeforePayload = latestBeforeRedraft?.data ?? null;
        const preflightBaseVersion =
          resolveOutlineBaseVersion(
            latestBeforePayload as SessionStatePayload | null
          ) || 1;
        const redraftResponse = await generateApi.sendCommand(sessionId, {
          command: {
            command_type: "REDRAFT_OUTLINE",
            instruction,
            base_version: preflightBaseVersion,
            run_id: currentRunId || undefined,
          },
        });
        const redraftRunId = extractRunId(
          (redraftResponse as { data?: { run?: unknown } }).data?.run
        );
        const preferredRunId =
          currentRunId || redraftRunId || get().activeRunId;
        const sessionResponse = await generateApi.getSessionSnapshot(
          sessionId,
          {
            run_id: preferredRunId,
          }
        );
        const latestSessionPayload = sessionResponse?.data ?? null;
        set({
          generationSession: latestSessionPayload,
          activeRunId:
            extractCurrentRunId(latestSessionPayload) ||
            preferredRunId ||
            redraftRunId,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        set({
          error: createApiError({ code: "REDRAFT_OUTLINE_FAILED", message }),
        });
        toast({
          title: "重新生成大纲失败",
          description: message,
          variant: "destructive",
        });
        throw error;
      }
    },

    confirmOutline: async (sessionId: string) => {
      const requestedRunId = get().activeRunId ?? undefined;
      try {
        const confirmResponse = await generateApi.sendCommand(sessionId, {
          command: {
            command_type: "CONFIRM_OUTLINE",
            continue_from_retrieval: true,
            run_id: requestedRunId,
          },
        });
        const confirmedRunId = extractRunId(
          (confirmResponse as { data?: { run?: unknown } }).data?.run
        );
        const preferredRunId = confirmedRunId || get().activeRunId;
        const sessionResponse = await generateApi.getSessionSnapshot(
          sessionId,
          {
            run_id: preferredRunId,
          }
        );
        const latestSessionPayload = sessionResponse?.data ?? null;
        set({
          generationSession: latestSessionPayload,
          activeRunId:
            extractCurrentRunId(latestSessionPayload) ||
            preferredRunId ||
            confirmedRunId,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 502) {
          try {
            const sessionResponse = await generateApi.getSessionSnapshot(
              sessionId,
              {
                run_id: requestedRunId,
              }
            );
            const latestSessionPayload = sessionResponse?.data ?? null;
            const refreshedRunId =
              extractCurrentRunId(latestSessionPayload) || requestedRunId || null;
            set({
              generationSession: latestSessionPayload,
              activeRunId: refreshedRunId,
            });
            const latestState =
              typeof latestSessionPayload?.session?.state === "string"
                ? latestSessionPayload.session.state
                : "";
            if (
              latestState === "GENERATING_CONTENT" ||
              latestState === "RENDERING" ||
              latestState === "SUCCESS"
            ) {
              return;
            }
          } catch {
            // Preserve original 502 when snapshot refresh fails.
          }
        }
        const message = getErrorMessage(error);
        set({
          error: createApiError({ code: "CONFIRM_OUTLINE_FAILED", message }),
        });
        toast({
          title: "确认大纲失败",
          description: message,
          variant: "destructive",
        });
        throw error;
      }
    },
  };
}
