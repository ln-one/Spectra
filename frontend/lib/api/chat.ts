/**
 * Chat API
 *
 * 基于 OpenAPI 契约的对话 API 封装
 * 支持 Mock 模式用于前端独立开发
 *
 * 更新日期: 2026-02-25
 * 更新内容: 添加语音输入接口支持
 */

import { request, ENABLE_MOCK } from "./client";
import type { components } from "../types/api";

export type Message = components["schemas"]["Message"];
export type SendMessageRequest = components["schemas"]["SendMessageRequest"];
export type SendMessageResponse = components["schemas"]["SendMessageResponse"];
export type GetMessagesResponse = components["schemas"]["GetMessagesResponse"];
export type VoiceMessageResponse =
  components["schemas"]["VoiceMessageResponse"];

// Mock 数据（仅当 ENABLE_MOCK 为 true 时使用）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockMessages: Message[] = [];

export const chatApi = {
  async sendMessage(data: SendMessageRequest): Promise<SendMessageResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return {
        success: true,
        data: {
          message: {
            id: `mock-msg-${Date.now()}`,
            role: "assistant",
            content: "Mock AI response",
            timestamp: new Date().toISOString(),
          },
          suggestions: [],
        },
        message: "Mock 发送成功",
      };
    }

    return request<SendMessageResponse>("/chat/messages", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  },

  async getMessages(
    projectId: string,
    params?: { page?: number; limit?: number }
  ): Promise<GetMessagesResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        data: {
          messages: [],
          total: 0,
          page: params?.page || 1,
          limit: params?.limit || 20,
        },
        message: "Mock 获取成功",
      };
    }

    const queryParams = new URLSearchParams();
    queryParams.set("project_id", projectId);
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.limit) queryParams.set("limit", String(params.limit));

    return request<GetMessagesResponse>(`/chat/messages?${queryParams}`, {
      method: "GET",
    });
  },

  /**
   * 发送语音消息
   * @param audio 音频文件
   * @param projectId 项目 ID
   * @returns 语音识别结果和消息
   */
  async sendVoiceMessage(
    audio: File,
    projectId: string
  ): Promise<VoiceMessageResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return {
        success: true,
        data: {
          text: "Mock 语音识别结果",
          confidence: 0.95,
          duration: audio.size / 16000,
          message: {
            id: `mock-msg-${Date.now()}`,
            role: "user",
            content: "Mock 语音识别结果",
            timestamp: new Date().toISOString(),
          },
          suggestions: [],
        },
        message: "Mock 语音识别成功",
      };
    }

    const formData = new FormData();
    formData.append("audio", audio);
    formData.append("project_id", projectId);

    return request<VoiceMessageResponse>("/chat/voice", {
      method: "POST",
      body: formData,
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  },
};
