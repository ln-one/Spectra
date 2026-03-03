/**
 * Chat Store
 *
 * 使用 Zustand 管理对话状态
 * 支持消息发送、语音输入、自动回复等功能
 */

import { create } from "zustand";
import { chatApi, type Message } from "@/lib/api/chat";

export interface ChatState {
  messages: Message[];
  isTyping: boolean;
  isLoading: boolean;
  error: string | null;
  currentProjectId: string | null;
  suggestions: string[];

  sendMessage: (projectId: string, content: string) => Promise<void>;
  sendVoiceMessage: (projectId: string, audioBlob: Blob) => Promise<void>;
  fetchMessages: (projectId: string) => Promise<void>;
  clearMessages: () => void;
  setTyping: (isTyping: boolean) => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>()((set, _get) => ({
  messages: [],
  isTyping: false,
  isLoading: false,
  error: null,
  currentProjectId: null,
  suggestions: [],

  sendMessage: async (projectId: string, content: string) => {
    if (!content.trim()) return;

    set({ isTyping: true, error: null, currentProjectId: projectId });

    try {
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, userMessage],
      }));

      const response = await chatApi.sendMessage({
        project_id: projectId,
        content,
      });

      if (response.success && response.data.message) {
        const assistantMessage = response.data.message;
        set((state) => ({
          messages: [...state.messages, assistantMessage],
          suggestions: response.data.suggestions || [],
        }));
      } else if (!response.success) {
        // API 返回失败
        set({
          error: response.message || "发送消息失败",
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "发送消息失败",
      });
    } finally {
      set({ isTyping: false });
    }
  },

  sendVoiceMessage: async (projectId: string, audioBlob: Blob) => {
    set({ isTyping: true, error: null });

    try {
      const file = new File([audioBlob], "voice message", {
        type: "audio/webm",
      });
      const response = await chatApi.sendVoiceMessage(file, projectId);

      if (response.success && response.data.text) {
        await _get().sendMessage(projectId, response.data.text);
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "语音识别失败",
      });
    } finally {
      set({ isTyping: false });
    }
  },

  fetchMessages: async (projectId: string) => {
    set({ isLoading: true, error: null, currentProjectId: projectId });

    try {
      const response = await chatApi.getMessages(projectId);

      if (response.success) {
        set({
          messages: response.data.messages || [],
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "获取消息失败",
      });
    } finally {
      set({ isLoading: false });
    }
  },

  clearMessages: () => {
    set({
      messages: [],
      suggestions: [],
      error: null,
    });
  },

  setTyping: (isTyping: boolean) => {
    set({ isTyping });
  },

  clearError: () => {
    set({ error: null });
  },
}));
