/**
 * Chat API
 *
 * 基于 OpenAPI 契约的对话 API 封装
 *
 * 更新日期: 2026-02-25
 * 更新内容: 添加语音输入接口支持
 */

import { request } from "./client";
import type { components } from "../types/api";

export type Message = components["schemas"]["Message"];
export type SendMessageRequest = components["schemas"]["SendMessageRequest"];
export type SendMessageResponse = components["schemas"]["SendMessageResponse"];
export type GetMessagesResponse = components["schemas"]["GetMessagesResponse"];
export type VoiceMessageResponse =
  components["schemas"]["VoiceMessageResponse"];

export const chatApi = {
  async sendMessage(data: SendMessageRequest): Promise<SendMessageResponse> {
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
