import {
  API_BASE_URL,
  DEFAULT_CONTRACT_VERSION,
  generateIdempotencyKey,
  sdkClient,
  unwrap,
  withIdempotency,
} from "./client";
import { TokenStorage } from "../auth";
import type { components } from "./types";

export type Message = components["schemas"]["Message"];
export type SourceReference = NonNullable<Message["citations"]>[number];
export type GetMessagesResponse = components["schemas"]["GetMessagesResponse"];
export type SendMessageRequest = components["schemas"]["SendMessageRequest"];
export type SendMessageResponse = components["schemas"]["SendMessageResponse"];
export type VoiceMessageResponse =
  components["schemas"]["VoiceMessageResponse"];

export const chatApi = {
  async getMessages(params: {
    project_id: string;
    session_id?: string;
    page?: number;
    limit?: number;
  }): Promise<GetMessagesResponse> {
    const result = await sdkClient.GET("/api/v1/chat/messages", {
      params: { query: params },
    });
    return unwrap<GetMessagesResponse>(result);
  },

  async sendMessage(data: SendMessageRequest): Promise<SendMessageResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST("/api/v1/chat/messages", {
      body: data,
      headers,
    });
    return unwrap<SendMessageResponse>(result);
  },

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
      xhr.open("POST", `${API_BASE_URL}/api/v1/chat/voice`);

      const token = TokenStorage.getAccessToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.setRequestHeader("Idempotency-Key", generateIdempotencyKey());
      xhr.setRequestHeader("X-Contract-Version", DEFAULT_CONTRACT_VERSION);

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("语音消息发送失败：响应解析异常"));
          }
        } else {
          try {
            const parsed = JSON.parse(xhr.responseText);
            reject(
              new Error(
                parsed?.error?.message || parsed?.message || "语音消息发送失败"
              )
            );
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
