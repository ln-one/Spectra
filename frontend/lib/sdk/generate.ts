import { API_BASE_URL, sdkClient, unwrap, withIdempotency } from "./client";
import { TokenStorage } from "../auth";
import type { components } from "./types";

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
  async createSession(
    data: CreateGenerationSessionRequest
  ): Promise<CreateGenerationSessionResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST("/api/v1/generate/sessions", {
      body: data,
      headers,
    });
    return unwrap<CreateGenerationSessionResponse>(result);
  },

  async getSession(sessionId: string): Promise<GenerationSessionResponse> {
    const result = await sdkClient.GET(
      "/api/v1/generate/sessions/{session_id}",
      { params: { path: { session_id: sessionId } } }
    );
    return unwrap<GenerationSessionResponse>(result);
  },

  async listSessions(params: {
    project_id: string;
    page?: number;
    limit?: number;
  }): Promise<GenerationSessionListResponse> {
    const result = await sdkClient.GET("/api/v1/generate/sessions", {
      params: { query: params },
    });
    return unwrap<GenerationSessionListResponse>(result);
  },

  async resumeSession(
    sessionId: string,
    data?: ResumeSessionRequest
  ): Promise<ResumeSessionResponse> {
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/resume",
      {
        params: { path: { session_id: sessionId } },
        body: data,
      }
    );
    return unwrap<ResumeSessionResponse>(result);
  },

  async updateOutline(
    sessionId: string,
    data: UpdateOutlineRequest
  ): Promise<UpdateOutlineResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.PUT(
      "/api/v1/generate/sessions/{session_id}/outline",
      {
        params: { path: { session_id: sessionId } },
        body: data,
        headers,
      }
    );
    return unwrap<UpdateOutlineResponse>(result);
  },

  async confirmOutline(
    sessionId: string,
    data?: ConfirmOutlineRequest
  ): Promise<ConfirmOutlineResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/confirm",
      {
        params: { path: { session_id: sessionId } },
        body: data,
        headers,
      }
    );
    return unwrap<ConfirmOutlineResponse>(result);
  },

  async redraftOutline(
    sessionId: string,
    data: RedraftOutlineRequest
  ): Promise<RedraftOutlineResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/outline/redraft",
      {
        params: { path: { session_id: sessionId } },
        body: data,
        headers,
      }
    );
    return unwrap<RedraftOutlineResponse>(result);
  },

  async sendCommand(
    sessionId: string,
    data: GenerationSessionCommandRequest
  ): Promise<GenerationSessionCommandResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/commands",
      {
        params: { path: { session_id: sessionId } },
        body: data,
        headers,
      }
    );
    return unwrap<GenerationSessionCommandResponse>(result);
  },

  async regenerateSlide(
    sessionId: string,
    slideId: string,
    data: RegenerateSlideRequest
  ): Promise<RegenerateSlideResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/slides/{slide_id}/regenerate",
      {
        params: {
          path: { session_id: sessionId, slide_id: slideId },
        },
        body: data,
        headers,
      }
    );
    return unwrap<RegenerateSlideResponse>(result);
  },

  async getCapabilities(): Promise<GenerationCapabilitiesResponse> {
    const result = await sdkClient.GET("/api/v1/generate/capabilities");
    return unwrap<GenerationCapabilitiesResponse>(result);
  },

  getEventStream(sessionId: string, cursor?: string): string {
    const url = new URL(
      `${API_BASE_URL}/api/v1/generate/sessions/${sessionId}/events`
    );
    if (cursor) url.searchParams.set("cursor", cursor);
    const token = TokenStorage.getAccessToken();
    if (token) url.searchParams.set("token", token);
    return url.toString();
  },
};
