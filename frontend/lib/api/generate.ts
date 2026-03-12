import { request, getApiUrl } from "./client";
import { TokenStorage } from "../auth";
import type { components } from "../types/api";

export type GenerationSessionMode =
  components["schemas"]["GenerationSessionMode"];
export type GenerationState = components["schemas"]["GenerationState"];
export type GenerationOptions = components["schemas"]["GenerationOptions"];
export type OutlineDocument = components["schemas"]["OutlineDocument"];
export type SessionStatePayload = components["schemas"]["SessionStatePayload"];
export type CreateGenerationSessionRequest =
  components["schemas"]["CreateGenerationSessionRequest"];
export type CreateGenerationSessionResponse =
  components["schemas"]["CreateGenerationSessionResponse"];
export type GenerationSessionResponse =
  components["schemas"]["GenerationSessionResponse"];
export type GenerationEvent = components["schemas"]["GenerationEvent"];
export type ConfirmOutlineRequest =
  components["schemas"]["ConfirmOutlineRequest"];
export type ConfirmOutlineResponse =
  components["schemas"]["ConfirmOutlineResponse"];
export type RedraftOutlineRequest =
  components["schemas"]["RedraftOutlineRequest"];
export type RedraftOutlineResponse =
  components["schemas"]["RedraftOutlineResponse"];
export type UpdateOutlineRequest =
  components["schemas"]["UpdateOutlineRequest"];
export type UpdateOutlineResponse =
  components["schemas"]["UpdateOutlineResponse"];
export type ResumeSessionRequest =
  components["schemas"]["ResumeSessionRequest"];
export type ResumeSessionResponse =
  components["schemas"]["ResumeSessionResponse"];
export type RegenerateSlideRequest =
  components["schemas"]["RegenerateSlideRequest"];
export type RegenerateSlideResponse =
  components["schemas"]["RegenerateSlideResponse"];
export type GenerationSessionCommandRequest =
  components["schemas"]["GenerationSessionCommandRequest"];
export type GenerationSessionCommandResponse =
  components["schemas"]["GenerationSessionCommandResponse"];
export type GenerationCapabilitiesResponse =
  components["schemas"]["GenerationCapabilitiesResponse"];
export type GenerationSessionListResponse =
  components["schemas"]["GenerationSessionListResponse"];

export const generateApi = {
  // ─── Session 生命周期 ───

  async createSession(
    data: CreateGenerationSessionRequest
  ): Promise<CreateGenerationSessionResponse> {
    return request<CreateGenerationSessionResponse>("/generate/sessions", {
      method: "POST",
      body: JSON.stringify(data),
      autoIdempotency: true,
    });
  },

  async getSession(sessionId: string): Promise<GenerationSessionResponse> {
    return request<GenerationSessionResponse>(
      `/generate/sessions/${sessionId}`,
      {
        method: "GET",
      }
    );
  },

  async listSessions(params: {
    project_id: string;
    page?: number;
    limit?: number;
  }): Promise<GenerationSessionListResponse> {
    const query = new URLSearchParams();
    query.set("project_id", params.project_id);
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    return request<GenerationSessionListResponse>(
      `/generate/sessions?${query.toString()}`,
      {
        method: "GET",
      }
    );
  },

  async resumeSession(
    sessionId: string,
    data?: ResumeSessionRequest
  ): Promise<ResumeSessionResponse> {
    return request<ResumeSessionResponse>(
      `/generate/sessions/${sessionId}/resume`,
      {
        method: "POST",
        body: data ? JSON.stringify(data) : undefined,
      }
    );
  },

  // ─── 大纲操作 ───

  async updateOutline(
    sessionId: string,
    data: UpdateOutlineRequest
  ): Promise<UpdateOutlineResponse> {
    return request<UpdateOutlineResponse>(
      `/generate/sessions/${sessionId}/outline`,
      {
        method: "PUT",
        body: JSON.stringify(data),
        autoIdempotency: true,
      }
    );
  },

  async confirmOutline(
    sessionId: string,
    data?: ConfirmOutlineRequest
  ): Promise<ConfirmOutlineResponse> {
    return request<ConfirmOutlineResponse>(
      `/generate/sessions/${sessionId}/confirm`,
      {
        method: "POST",
        body: data ? JSON.stringify(data) : undefined,
        autoIdempotency: true,
      }
    );
  },

  async redraftOutline(
    sessionId: string,
    data: RedraftOutlineRequest
  ): Promise<RedraftOutlineResponse> {
    return request<RedraftOutlineResponse>(
      `/generate/sessions/${sessionId}/outline/redraft`,
      {
        method: "POST",
        body: JSON.stringify(data),
        autoIdempotency: true,
      }
    );
  },

  // ─── 统一命令入口 ───

  async sendCommand(
    sessionId: string,
    data: GenerationSessionCommandRequest
  ): Promise<GenerationSessionCommandResponse> {
    return request<GenerationSessionCommandResponse>(
      `/generate/sessions/${sessionId}/commands`,
      {
        method: "POST",
        body: JSON.stringify(data),
        autoIdempotency: true,
      }
    );
  },

  // ─── 局部重绘 ───

  async regenerateSlide(
    sessionId: string,
    slideId: string,
    data: RegenerateSlideRequest
  ): Promise<RegenerateSlideResponse> {
    return request<RegenerateSlideResponse>(
      `/generate/sessions/${sessionId}/slides/${slideId}/regenerate`,
      {
        method: "POST",
        body: JSON.stringify(data),
        autoIdempotency: true,
      }
    );
  },

  // ─── 能力查询 ───

  async getCapabilities(): Promise<GenerationCapabilitiesResponse> {
    return request<GenerationCapabilitiesResponse>("/generate/capabilities", {
      method: "GET",
    });
  },

  // ─── SSE 事件流 ───

  getEventStream(sessionId: string, cursor?: string): string {
    const url = new URL(getApiUrl(`/generate/sessions/${sessionId}/events`));
    if (cursor) url.searchParams.set("cursor", cursor);
    // EventSource 不支持自定义 headers，通过 query param 传递 token
    const token = TokenStorage.getAccessToken();
    if (token) url.searchParams.set("token", token);
    return url.toString();
  },
};
