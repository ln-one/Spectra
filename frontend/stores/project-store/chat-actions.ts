import { chatApi, studioCardsApi } from "@/lib/sdk";
import { createApiError, getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import {
  buildRefineFailureMessage,
  buildRefineProcessingMessage,
  buildRefineSuccessMessage,
  buildStageHintMessage,
  createLocalMessage,
  readStudioLocalPayload,
  writeStudioLocalPayload,
} from "./studio-chat.helpers";
import type {
  Message,
  ProjectStoreContext,
  ProjectState,
  StudioHintMessagePayload,
} from "./types";

type ChatActionKeys =
  | "fetchMessages"
  | "sendMessage"
  | "sendStudioRefineMessage"
  | "hydrateStudioLocalState"
  | "setStudioChatContext"
  | "pushStudioHintMessage"
  | "focusChatComposer";

function hasProjectLocalState(
  map: Record<string, unknown>,
  projectId: string
): boolean {
  return Object.prototype.hasOwnProperty.call(map, projectId);
}

export function createChatActions({
  set,
  get,
}: ProjectStoreContext): Pick<ProjectState, ChatActionKeys> {
  let latestFetchRequestId = 0;
  let refineQueue = Promise.resolve();
  let refinePendingCount = 0;

  const ensureProjectLocalState = (projectId: string) => {
    const state = get();
    if (
      hasProjectLocalState(state.localToolMessages, projectId) &&
      hasProjectLocalState(state.studioHintDedupeByProject, projectId)
    ) {
      return;
    }

    const payload = readStudioLocalPayload(projectId);
    set((prev) => ({
      localToolMessages: {
        ...prev.localToolMessages,
        [projectId]: payload.messagesBySession,
      },
      studioHintDedupeByProject: {
        ...prev.studioHintDedupeByProject,
        [projectId]: payload.hintDedupe,
      },
    }));
  };

  const persistProjectLocalState = (
    projectId: string,
    messagesBySession: Record<string, Message[]>,
    hintDedupe: Record<string, true>
  ) => {
    writeStudioLocalPayload(projectId, {
      version: 1,
      messagesBySession,
      hintDedupe,
    });
  };

  const appendLocalMessage = (
    projectId: string,
    sessionId: string,
    message: Message
  ) => {
    ensureProjectLocalState(projectId);
    const state = get();
    const projectMessages = state.localToolMessages[projectId] ?? {};
    const projectHints = state.studioHintDedupeByProject[projectId] ?? {};
    const sessionMessages = projectMessages[sessionId] ?? [];
    const nextProjectMessages = {
      ...projectMessages,
      [sessionId]: [...sessionMessages, message].slice(-120),
    };

    set((prev) => ({
      localToolMessages: {
        ...prev.localToolMessages,
        [projectId]: nextProjectMessages,
      },
    }));

    persistProjectLocalState(projectId, nextProjectMessages, projectHints);
  };

  const updateLocalMessage = (
    projectId: string,
    sessionId: string,
    messageId: string,
    updater: (message: Message) => Message
  ) => {
    ensureProjectLocalState(projectId);
    const state = get();
    const projectMessages = state.localToolMessages[projectId] ?? {};
    const projectHints = state.studioHintDedupeByProject[projectId] ?? {};
    const sessionMessages = projectMessages[sessionId] ?? [];
    const messageIndex = sessionMessages.findIndex((msg) => msg.id === messageId);
    if (messageIndex < 0) return;
    const nextSessionMessages = [...sessionMessages];
    nextSessionMessages[messageIndex] = updater(nextSessionMessages[messageIndex]);
    const nextProjectMessages = {
      ...projectMessages,
      [sessionId]: nextSessionMessages.slice(-120),
    };

    set((prev) => ({
      localToolMessages: {
        ...prev.localToolMessages,
        [projectId]: nextProjectMessages,
      },
    }));

    persistProjectLocalState(projectId, nextProjectMessages, projectHints);
  };

  const pushHintMessage = (payload: StudioHintMessagePayload) => {
    const { projectId, sessionId, dedupeKey, stage, toolLabel, toolType } =
      payload;
    ensureProjectLocalState(projectId);

    const state = get();
    const projectHints = state.studioHintDedupeByProject[projectId] ?? {};
    if (projectHints[dedupeKey]) {
      return;
    }

    const projectMessages = state.localToolMessages[projectId] ?? {};
    const sessionMessages = projectMessages[sessionId] ?? [];
    const nextProjectMessages = {
      ...projectMessages,
      [sessionId]: [
        ...sessionMessages,
        createLocalMessage(
          "assistant",
          buildStageHintMessage(toolType, stage, toolLabel)
        ),
      ].slice(-120),
    };
    const nextProjectHints = {
      ...projectHints,
      [dedupeKey]: true as const,
    };

    set((prev) => ({
      localToolMessages: {
        ...prev.localToolMessages,
        [projectId]: nextProjectMessages,
      },
      studioHintDedupeByProject: {
        ...prev.studioHintDedupeByProject,
        [projectId]: nextProjectHints,
      },
    }));

    persistProjectLocalState(projectId, nextProjectMessages, nextProjectHints);
  };

  const enqueueRefineTask = async (task: () => Promise<void>) => {
    refinePendingCount += 1;
    if (!get().isStudioRefining) {
      set({ isStudioRefining: true });
    }

    refineQueue = refineQueue
      .then(task)
      .catch(() => {
        // Errors are handled in the task itself.
      })
      .finally(() => {
        refinePendingCount = Math.max(0, refinePendingCount - 1);
        if (refinePendingCount === 0) {
          set({ isStudioRefining: false });
        }
      });

    await refineQueue;
  };

  return {
    hydrateStudioLocalState: (projectId: string) => {
      if (!projectId) return;
      ensureProjectLocalState(projectId);
    },

    setStudioChatContext: (context) => {
      set({ studioChatContext: context });
    },

    focusChatComposer: () => {
      set((state) => ({
        chatComposerFocusSignal: state.chatComposerFocusSignal + 1,
      }));
    },

    pushStudioHintMessage: (payload: StudioHintMessagePayload) => {
      pushHintMessage(payload);
    },

    fetchMessages: async (projectId: string, sessionId?: string | null) => {
      const requestId = ++latestFetchRequestId;
      set({ isMessagesLoading: true });
      try {
        const effectiveSessionId =
          sessionId ?? get().activeSessionId ?? undefined;
        if (!effectiveSessionId) {
          if (requestId === latestFetchRequestId) {
            set({ messages: [] });
          }
          return;
        }

        const response = await chatApi.getMessages({
          project_id: projectId,
          session_id: effectiveSessionId,
          limit: 50,
        });

        if (requestId === latestFetchRequestId) {
          set({ messages: response?.data?.messages ?? [] });
        }
      } catch (error) {
        if (requestId !== latestFetchRequestId) return;
        const message = getErrorMessage(error);
        toast({
          title: "获取消息失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        if (requestId === latestFetchRequestId) {
          set({ isMessagesLoading: false });
        }
      }
    },

    sendMessage: async (
      projectId: string,
      content: string,
      sessionId?: string | null
    ) => {
      if (!content.trim()) return;
      const effectiveSessionId = sessionId ?? get().activeSessionId ?? null;
      if (!effectiveSessionId) {
        toast({
          title: "请先创建会话",
          description: "会话只能通过会话选择器中的“新建会话”创建。",
          variant: "destructive",
        });
        return;
      }

      set({ isSending: true, lastFailedInput: null });
      const tempId = `temp-${Date.now()}`;
      try {
        const userMessage: Message = {
          id: tempId,
          role: "user",
          content,
          timestamp: new Date().toISOString(),
        };
        set((state) => ({ messages: [...state.messages, userMessage] }));

        const { selectedFileIds } = get();
        const response = await chatApi.sendMessage({
          project_id: projectId,
          session_id: effectiveSessionId,
          content,
          rag_source_ids:
            selectedFileIds.length > 0 ? selectedFileIds : undefined,
        });

        if (
          response?.data?.session_id &&
          response.data.session_id !== get().activeSessionId
        ) {
          set({ activeSessionId: response.data.session_id });
        }

        const responseData = (response?.data ?? {}) as Record<
          string,
          unknown
        > & {
          session_id?: string;
        };
        const sessionTitleUpdated = responseData.session_title_updated === true;
        const sessionTitle =
          typeof responseData.session_title === "string"
            ? responseData.session_title.trim()
            : "";
        if (
          sessionTitleUpdated &&
          sessionTitle &&
          typeof responseData.session_id === "string"
        ) {
          set((state) => ({
            generationHistory: state.generationHistory.map((item) =>
              item.id === responseData.session_id
                ? { ...item, title: sessionTitle }
                : item
            ),
          }));
        }

        await get().fetchGenerationHistory(projectId);

        if (response?.data?.message) {
          set((state) => ({
            messages: [
              ...state.messages.slice(0, -1),
              userMessage,
              response.data!.message!,
            ],
          }));
        }
      } catch (error) {
        const message = getErrorMessage(error);
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== tempId),
          lastFailedInput: content,
          error: createApiError({ code: "SEND_MESSAGE_FAILED", message }),
        }));
        toast({
          title: "发送消息失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        set({ isSending: false });
      }
    },

    sendStudioRefineMessage: async (projectId: string, content: string) => {
      const normalizedContent = content.trim();
      if (!normalizedContent) return;

      const context = get().studioChatContext;
      const activeSessionId = get().activeSessionId;
      if (!context || context.projectId !== projectId) {
        toast({
          title: "当前不可微调",
          description: "请先进入工具卡片第 3 步预览态再发送微调指令。",
          variant: "destructive",
        });
        return;
      }

      if (
        !context.isRefineMode ||
        context.step !== "preview" ||
        !context.canRefine
      ) {
        toast({
          title: "当前不可微调",
          description: "请先进入工具卡片第 3 步预览态再发送微调指令。",
          variant: "destructive",
        });
        return;
      }

      const effectiveSessionId = context.sessionId || activeSessionId;
      if (!effectiveSessionId) {
        toast({
          title: "缺少会话上下文",
          description: "请先创建会话后再发送微调指令。",
          variant: "destructive",
        });
        return;
      }

      const initialRunId = get().activeRunId || null;
      const userRefineMessage = createLocalMessage("user", normalizedContent, {
        kind: "studio_refine_user",
        refineToolType: context.toolType,
        refineToolLabel: context.toolLabel,
        sessionId: effectiveSessionId,
        runId: initialRunId,
      });
      const refineStatusMessage = createLocalMessage(
        "assistant",
        buildRefineProcessingMessage(context.toolType, context.toolLabel),
        {
          kind: "studio_refine_status",
          refineStatus: "processing",
          refineToolType: context.toolType,
          refineToolLabel: context.toolLabel,
          sessionId: effectiveSessionId,
          runId: initialRunId,
        }
      );

      appendLocalMessage(
        projectId,
        effectiveSessionId,
        userRefineMessage
      );
      appendLocalMessage(
        projectId,
        effectiveSessionId,
        refineStatusMessage
      );

      const selectedFileIds = get().selectedFileIds;

      await enqueueRefineTask(async () => {
        try {
          const response = await studioCardsApi.refine(context.cardId, {
            project_id: projectId,
            session_id: effectiveSessionId,
            message: normalizedContent,
            source_artifact_id: context.sourceArtifactId || undefined,
            config: context.configSnapshot,
            rag_source_ids:
              selectedFileIds.length > 0 ? selectedFileIds : undefined,
          });
          const refinedSessionId =
            response?.data?.session_id || effectiveSessionId;
          const refinedRunId =
            (response?.data as { run_id?: string } | undefined)?.run_id ||
            get().activeRunId ||
            initialRunId;
          const refinedArtifactId =
            (response?.data as { artifact_id?: string } | undefined)
              ?.artifact_id || null;

          if (refinedSessionId !== get().activeSessionId) {
            set({ activeSessionId: refinedSessionId });
          }
          if (refinedRunId && refinedRunId !== get().activeRunId) {
            set({ activeRunId: refinedRunId });
          }

          await get().fetchArtifactHistory(projectId, refinedSessionId);

          updateLocalMessage(
            projectId,
            effectiveSessionId,
            refineStatusMessage.id,
            (message) => ({
              ...message,
              content: buildRefineSuccessMessage(context.toolType, context.toolLabel),
              localMeta: {
                ...message.localMeta,
                kind: "studio_refine_status",
                refineStatus: "completed",
                refineToolType: context.toolType,
                refineToolLabel: context.toolLabel,
                sessionId: refinedSessionId,
                runId: refinedRunId,
                artifactId: refinedArtifactId,
              },
            })
          );
        } catch (error) {
          const message = getErrorMessage(error);
          updateLocalMessage(
            projectId,
            effectiveSessionId,
            refineStatusMessage.id,
            (prevMessage) => ({
              ...prevMessage,
              content: buildRefineFailureMessage(context.toolType, context.toolLabel),
              localMeta: {
                ...prevMessage.localMeta,
                kind: "studio_refine_status",
                refineStatus: "failed",
                refineToolType: context.toolType,
                refineToolLabel: context.toolLabel,
                sessionId: effectiveSessionId,
                runId: initialRunId,
              },
            })
          );
          toast({
            title: "微调失败",
            description: message,
            variant: "destructive",
          });
        }
      });
    },
  };
}
