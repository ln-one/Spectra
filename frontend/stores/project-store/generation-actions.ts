import { generateApi, previewApi, projectSpaceApi } from "@/lib/sdk";
import { createApiError, getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import { groupArtifactsByTool } from "@/lib/project-space/artifact-history";
import {
  mapSessionsToHistory,
  normalizeGenerationOptions,
  resolveOutputType,
  resolveReusableGenerationSessionId,
} from "./generation-actions.helpers";
import type {
  Artifact,
  GenerationHistory,
  GenerationOptions,
  GenerationTool,
  OutlineDocument,
  ProjectStoreContext,
  ProjectState,
  SessionStatePayload,
} from "./types";

function inferArtifactDownloadExt(artifactType: Artifact["type"]): string {
  switch (artifactType) {
    case "pptx":
      return "pptx";
    case "docx":
      return "docx";
    case "gif":
      return "gif";
    case "mp4":
      return "mp4";
    case "html":
      return "html";
    default:
      return "json";
  }
}

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

export function createGenerationActions({
  set,
  get,
}: ProjectStoreContext): Pick<
  ProjectState,
  | "startGeneration"
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
    startGeneration: async (
      projectId: string,
      tool: GenerationTool,
      options?: GenerationOptions
    ) => {
      try {
        const { selectedFileIds, activeSessionId, generationSession } = get();
        if (!activeSessionId) {
          toast({
            title: "请先创建会话",
            description: "会话只能通过会话选择器中的“新建会话”创建。",
            variant: "destructive",
          });
          return null;
        }
        const currentSessionId = resolveReusableGenerationSessionId(
          activeSessionId,
          generationSession
        );
        const normalizedOptions = normalizeGenerationOptions(options);
        const response = await generateApi.createSession({
          project_id: projectId,
          output_type: resolveOutputType(tool),
          options: {
            ...normalizedOptions,
            rag_source_ids:
              selectedFileIds.length > 0 ? selectedFileIds : undefined,
          },
          client_session_id: currentSessionId,
        });

        if (response?.data?.session) {
          const sessionId = response.data.session.session_id;
          const runId = extractRunId(
            (response as { data?: { run?: unknown } }).data?.run
          );

          set({
            activeSessionId: sessionId,
            activeRunId: runId,
            generationSession: {
              session: response.data.session,
              options: normalizedOptions,
            } as SessionStatePayload,
          });

          const historyItem: GenerationHistory = {
            id: sessionId,
            toolId: tool.id,
            toolName: tool.name,
            status: "processing",
            sessionState: "CONFIGURING",
            createdAt: new Date().toISOString(),
            title: tool.name,
          };
          set((state) => ({
            generationHistory: [
              historyItem,
              ...state.generationHistory.filter((item) => item.id !== sessionId),
            ],
          }));

          try {
            const sessionResponse = await generateApi.getSession(sessionId);
            const latestSessionPayload = sessionResponse?.data ?? null;
            set({
              generationSession: latestSessionPayload,
              activeRunId: extractCurrentRunId(latestSessionPayload) || runId,
            });
            await get().fetchArtifactHistory(projectId, sessionId);
          } catch (sessionError) {
            const message = getErrorMessage(sessionError);
            set((state) => ({
              generationHistory: state.generationHistory.map((h) =>
                h.id === sessionId ? { ...h, status: "failed" as const } : h
              ),
              error: createApiError({ code: "SESSION_FETCH_FAILED", message }),
            }));
            toast({
              title: "获取会话状态失败",
              description: message,
              variant: "destructive",
            });
          }

          return sessionId;
        }

        return null;
      } catch (error) {
        const message = getErrorMessage(error);
        set({ error: createApiError({ code: "GENERATION_FAILED", message }) });
        toast({
          title: "创建生成任务失败",
          description: message,
          variant: "destructive",
        });
        throw error;
      }
    },

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
          (item) => ({
            ...item,
            title: previousTitleById.get(item.id) || item.title,
          })
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
        set({ generationHistory: history, activeSessionId, activeRunId });
        await get().fetchArtifactHistory(projectId, activeSessionId);
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

        const response = await projectSpaceApi.getArtifacts(projectId, {
          session_id: effectiveSessionId,
        });
        const artifacts = ((response?.data?.artifacts ?? []) as Artifact[]) || [];
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
        });
      } catch (error) {
        const message = getErrorMessage(error);
        set({
          artifactHistoryByTool: groupArtifactsByTool([]),
          currentSessionArtifacts: [],
        });
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
          const blob = await projectSpaceApi.downloadArtifact(projectId, artifactId);
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${artifact.toolType}-${artifact.artifactId.slice(0, 8)}.${inferArtifactDownloadExt(artifact.artifactType)}`;
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
        link.download = `${artifact.toolType}-${artifact.artifactId.slice(0, 8)}.${ext}`;
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
      const session = get().generationSession;
      const baseVersion = session?.outline?.version ?? 1;
      try {
        await generateApi.updateOutline(sessionId, {
          base_version: baseVersion,
          outline,
        });
        const sessionResponse = await generateApi.getSession(sessionId);
        const latestSessionPayload = sessionResponse?.data ?? null;
        set({
          generationSession: latestSessionPayload,
          activeRunId: extractCurrentRunId(latestSessionPayload),
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
      const session = get().generationSession;
      const baseVersion = session?.outline?.version ?? 1;
      try {
        await generateApi.redraftOutline(sessionId, {
          instruction,
          base_version: baseVersion,
        });
        const sessionResponse = await generateApi.getSession(sessionId);
        const latestSessionPayload = sessionResponse?.data ?? null;
        set({
          generationSession: latestSessionPayload,
          activeRunId: extractCurrentRunId(latestSessionPayload),
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
      try {
        const confirmResponse = await generateApi.confirmOutline(sessionId, {
          continue_from_retrieval: true,
        });
        const confirmedRunId = extractRunId(
          (confirmResponse as { data?: { run?: unknown } }).data?.run
        );
        const sessionResponse = await generateApi.getSession(sessionId);
        const latestSessionPayload = sessionResponse?.data ?? null;
        set({
          generationSession: latestSessionPayload,
          activeRunId:
            extractCurrentRunId(latestSessionPayload) || confirmedRunId,
        });
      } catch (error) {
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
