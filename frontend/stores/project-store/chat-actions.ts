import { chatApi } from "@/lib/sdk";
import { createApiError, getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import type { Message, ProjectStoreContext, ProjectState } from "./types";

export function createChatActions({
  set,
  get,
}: ProjectStoreContext): Pick<ProjectState, "fetchMessages" | "sendMessage"> {
  return {
    fetchMessages: async (projectId: string, sessionId?: string | null) => {
      set({ isMessagesLoading: true });
      try {
        const effectiveSessionId =
          sessionId ?? get().activeSessionId ?? undefined;
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
        const effectiveSessionId =
          sessionId ?? get().activeSessionId ?? undefined;
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
