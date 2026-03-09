import { request, getApiUrl, generateIdempotencyKey, DEFAULT_CONTRACT_VERSION } from "./client";
import { TokenStorage } from "../auth";
import type { components } from "../types/api";

export type Message = components["schemas"]["Message"];
export type SourceReference = components["schemas"]["SourceReference"];
export type GetMessagesResponse = components["schemas"]["GetMessagesResponse"];
export type SendMessageRequest = components["schemas"]["SendMessageRequest"];
export type SendMessageResponse = components["schemas"]["SendMessageResponse"];
export type VoiceMessageResponse = components["schemas"]["VoiceMessageResponse"];

export const chatApi = {
  async getMessages(params: {
    project_id: string;
    session_id?: string;
    page?: number;
    limit?: number;
  }): Promise<GetMessagesResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set("project_id", params.project_id);
    if (params.session_id) queryParams.set("session_id", params.session_id);
    if (params.page) queryParams.set("page", String(params.page));
    if (params.limit) queryParams.set("limit", String(params.limit));

    return request<GetMessagesResponse>(`/chat/messages?${queryParams.toString()}`, {
      method: "GET",
    });
  },

  async sendMessage(data: SendMessageRequest): Promise<SendMessageResponse> {
    return request<SendMessageResponse>("/chat/messages", {
      method: "POST",
      body: JSON.stringify(data),
      autoIdempotency: true,
    });
  },

  /**
   * 发送语音消息
   * 上传音频文件（wav/mp3/m4a/ogg），后端自动转文字并生成回复
   */
  async sendVoiceMessage(
    audio: File,
    projectId: string,
    sessionId?: string
  ): Promise<VoiceMessageResponse> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("audio", audio);
      formData.append("project_id", projectId);
      if (sessionId) formData.append("session_id", sessionId);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", getApiUrl("/chat/voice"));

      const token = TokenStorage.getAccessToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.setRequestHeader("Idempotency-Key", generateIdempotencyKey());
      xhr.setRequestHeader("X-Contract-Version", DEFAULT_CONTRACT_VERSION);

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const parsed = JSON.parse(xhr.responseText);
            reject(new Error(parsed?.error?.message || parsed?.message || "语音消息发送失败"));
          } catch {
            reject(new Error("语音消息发送失败"));
          }
        }
        xhr.onload = null;
        xhr.onerror = null;
      };

      xhr.onerror = () => {
        xhr.onload = null;
        xhr.onerror = null;
        reject(new Error("语音消息发送失败：网络异常"));
      };
      xhr.send(formData);
    });
  },
};
