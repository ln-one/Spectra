import { request } from "./client";
import type { components } from "../types/api";

export type Message = components["schemas"]["Message"];
export type SourceReference = components["schemas"]["SourceReference"];
export type GetMessagesResponse = components["schemas"]["GetMessagesResponse"];
export type SendMessageRequest = components["schemas"]["SendMessageRequest"];
export type SendMessageResponse = components["schemas"]["SendMessageResponse"];

export const chatApi = {
  async getMessages(params: {
    project_id: string;
    page?: number;
    limit?: number;
  }): Promise<GetMessagesResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set("project_id", params.project_id);
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
};
