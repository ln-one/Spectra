import { chatApi, generateApi } from "@/lib/sdk";
import { createApiError, getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import type {
  GenerationHistory,
  Message,
  ProjectStoreContext,
  ProjectState,
} from "./types";

function buildBootstrapHistoryItem(sessionId: string): GenerationHistory {
  return {
    id: sessionId,
    toolId: "chat",
    toolName: "会话",
    status: "pending",
    sessionState: "IDLE",
    createdAt: new Date().toISOString(),
    title: "会话",
  };
}

export function createChatActions({
  set,
  get,
}: ProjectStoreContext): Pick<ProjectState, "fetchMessages" | "sendMessage"> {
  const ensureSessionForChat = async (
    projectId: string,
    sessionId?: string | null
  ): Promise<string> => {
    const currentSessionId = sessionId ?? get().activeSessionId ?? undefined;
    if (currentSessionId) {
      return currentSessionId;
    }

    const response = await generateApi.createSession({
      project_id: projectId,
      output_type: "both",
      bootstrap_only: true,
    });
    const createdSessionId = response?.data?.session?.session_id;
    if (!createdSessionId) {
      throw new Error("会话初始化失败");
    }

    set((state) => ({
      activeSessionId: createdSessionId,
      generationHistory: [
        buildBootstrapHistoryItem(createdSessionId),
        ...state.generationHistory.filter(
          (item) => item.id !== createdSessionId
        ),
      ],
    }));

    try {
      const sessionResponse = await generateApi.getSession(createdSessionId);
      set({ generationSession: sessionResponse?.data ?? null });
    } catch {
      set({ generationSession: null });
    }

    return createdSessionId;
  };

  return {
    fetchMessages: async (projectId: string, sessionId?: string | null) => {
      set({ isMessagesLoading: true });
      try {
        const effectiveSessionId =
          sessionId ?? get().activeSessionId ?? undefined;
        if (!effectiveSessionId) {
          set({ messages: [] });
          return;
        }
        const response = await chatApi.getMessages({
          project_id: projectId,
          session_id: effectiveSessionId,
          limit: 50,
        });
        set({ messages: response?.data?.messages ?? [] });
      } catch (error) {
        const message = getErrorMessage(error);
        toast({
          title: "获取消息失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        set({ isMessagesLoading: false });
      }
    },

    sendMessage: async (
      projectId: string,
      content: string,
      sessionId?: string | null
    ) => {
      if (!content.trim()) return;
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
        const effectiveSessionId = await ensureSessionForChat(
          projectId,
          sessionId
        );
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
  };
}
