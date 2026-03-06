import { request } from "./client";
import type { components } from "../types/api";

export type GenerationSessionMode = components["schemas"]["GenerationSessionMode"];
export type GenerationState = components["schemas"]["GenerationState"];
export type GenerationOptions = components["schemas"]["GenerationOptions"];
export type OutlineDocument = components["schemas"]["OutlineDocument"];
export type SessionStatePayload = components["schemas"]["SessionStatePayload"];
export type CreateGenerationSessionRequest = components["schemas"]["CreateGenerationSessionRequest"];
export type CreateGenerationSessionResponse = components["schemas"]["CreateGenerationSessionResponse"];
export type GenerationSessionResponse = components["schemas"]["GenerationSessionResponse"];
export type GenerationEvent = components["schemas"]["GenerationEvent"];
export type ConfirmOutlineRequest = components["schemas"]["ConfirmOutlineRequest"];
export type ConfirmOutlineResponse = components["schemas"]["ConfirmOutlineResponse"];
export type RedraftOutlineRequest = components["schemas"]["RedraftOutlineRequest"];
export type RedraftOutlineResponse = components["schemas"]["RedraftOutlineResponse"];

export const generateApi = {
  async createSession(data: CreateGenerationSessionRequest): Promise<CreateGenerationSessionResponse> {
    return request<CreateGenerationSessionResponse>("/generate/sessions", {
      method: "POST",
      body: JSON.stringify(data),
      autoIdempotency: true,
    });
  },

  async getSession(sessionId: string): Promise<GenerationSessionResponse> {
    return request<GenerationSessionResponse>(`/generate/sessions/${sessionId}`, {
      method: "GET",
    });
  },

  async confirmOutline(sessionId: string, data: ConfirmOutlineRequest): Promise<ConfirmOutlineResponse> {
    return request<ConfirmOutlineResponse>(`/generate/sessions/${sessionId}/outline/confirm`, {
      method: "POST",
      body: JSON.stringify(data),
      autoIdempotency: true,
    });
  },

  async redraftOutline(sessionId: string, data: RedraftOutlineRequest): Promise<RedraftOutlineResponse> {
    return request<RedraftOutlineResponse>(`/generate/sessions/${sessionId}/outline/redraft`, {
      method: "POST",
      body: JSON.stringify(data),
      autoIdempotency: true,
    });
  },

  getEventStream(sessionId: string, cursor?: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    const url = new URL(`${baseUrl}/generate/sessions/${sessionId}/events`);
    if (cursor) url.searchParams.set("cursor", cursor);
    return url.toString();
  },
};
