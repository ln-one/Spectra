import {
  API_BASE_URL,
  apiFetch,
  sdkClient,
  toApiError,
  unwrap,
  withIdempotency,
} from "./client";
import type { components } from "./types";

export type GenerationSessionMode =
  components["schemas"]["GenerationSessionMode"];
export type GenerationState = components["schemas"]["GenerationState"];
export type GenerationOptions = components["schemas"]["GenerationOptions"];
export type OutlineDocument = components["schemas"]["OutlineDocument"];
export type SessionStatePayload =
  components["schemas"]["SessionStatePayloadTarget"];
export type CreateGenerationSessionRequest =
  components["schemas"]["CreateGenerationSessionRequest"];
type CreateGenerationSessionResponseTarget =
  components["schemas"]["CreateGenerationSessionResponseTarget"];
export type CreateGenerationSessionResponse = Omit<
  CreateGenerationSessionResponseTarget,
  "data"
> & {
  data: CreateGenerationSessionResponseTarget["data"] & {
    run: SessionRun;
  };
};
export type GenerationSessionResponse =
  components["schemas"]["GenerationSessionResponseTarget"];
export type GenerationEvent = components["schemas"]["GenerationEventTarget"];
export type GenerationSessionCommandResponse =
  components["schemas"]["GenerationSessionCommandResponseTarget"];
export type GenerationSessionCommandPayload = {
  command: Record<string, unknown>;
  candidate_change?: Record<string, unknown>;
};
export type GenerationCapabilitiesResponse =
  components["schemas"]["GenerationCapabilitiesResponse"];
export type GenerationSessionListResponse =
  components["schemas"]["GenerationSessionListResponseTarget"];
export type CandidateChangeRequest =
  components["schemas"]["CandidateChangeRequest"];
export type CandidateChangeResponse =
  components["schemas"]["CandidateChangeResponse"];
export type CandidateChangesResponse =
  components["schemas"]["CandidateChangesResponse"];

type CreateGenerationSessionRequestInput = Omit<
  CreateGenerationSessionRequest,
  "bootstrap_only"
> &
  Partial<Pick<CreateGenerationSessionRequest, "bootstrap_only">>;

export interface SessionRun {
  run_id: string;
  session_id?: string | null;
  project_id?: string;
  tool_type?: string;
  run_no?: number;
  run_title?: string;
  run_title_source?: string;
  run_status?: string;
  run_step?: string;
  artifact_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface GenerationEventListResponse {
  success: boolean;
  data: {
    events?: GenerationEvent[];
  };
  message: string;
}

export interface GenerationSessionRunsResponse {
  success: boolean;
  data: {
    runs?: SessionRun[];
    total?: number;
    page?: number;
    limit?: number;
  };
  message: string;
}

export interface GenerationSessionRunDetailResponse {
  success: boolean;
  data: {
    run?: SessionRun;
  };
  message: string;
}

function normalizeCreateSessionRequest(
  data: CreateGenerationSessionRequestInput
): CreateGenerationSessionRequest {
  return {
    ...data,
    bootstrap_only: data.bootstrap_only ?? false,
  };
}

export const generateApi = {
  async createSession(
    data: CreateGenerationSessionRequestInput
  ): Promise<CreateGenerationSessionResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST("/api/v1/generate/sessions", {
      body: normalizeCreateSessionRequest(data),
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

  async getSessionByRun(
    sessionId: string,
    options?: { run_id?: string | null }
  ): Promise<GenerationSessionResponse> {
    const runId = options?.run_id?.trim();
    if (!runId) {
      return this.getSession(sessionId);
    }
    const url = new URL(
      `${API_BASE_URL}/api/v1/generate/sessions/${encodeURIComponent(sessionId)}`
    );
    url.searchParams.set("run_id", runId);
    const response = await apiFetch(url.toString(), { method: "GET" });
    const payload = await response.json();
    if (!response.ok) {
      throw toApiError(payload, response.status);
    }
    return payload as GenerationSessionResponse;
  },

  async getSessionSnapshot(
    sessionId: string,
    options?: { run_id?: string | null }
  ): Promise<GenerationSessionResponse> {
    const runId = options?.run_id?.trim();
    if (!runId) {
      return this.getSession(sessionId);
    }
    return this.getSessionByRun(sessionId, { run_id: runId });
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

  async listRuns(
    sessionId: string,
    params?: { page?: number; limit?: number }
  ): Promise<GenerationSessionRunsResponse> {
    const url = new URL(
      `${API_BASE_URL}/api/v1/generate/sessions/${encodeURIComponent(sessionId)}/runs`
    );
    if (params?.page) {
      url.searchParams.set("page", String(params.page));
    }
    if (params?.limit) {
      url.searchParams.set("limit", String(params.limit));
    }
    const response = await apiFetch(url.toString(), { method: "GET" });
    const payload = await response.json();
    if (!response.ok) {
      throw toApiError(payload, response.status);
    }
    return payload as GenerationSessionRunsResponse;
  },

  async getRun(
    sessionId: string,
    runId: string
  ): Promise<GenerationSessionRunDetailResponse> {
    const response = await apiFetch(
      `${API_BASE_URL}/api/v1/generate/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}`,
      { method: "GET" }
    );
    const payload = await response.json();
    if (!response.ok) {
      throw toApiError(payload, response.status);
    }
    return payload as GenerationSessionRunDetailResponse;
  },

  async listEvents(
    sessionId: string,
    params?: { cursor?: string | null; limit?: number; run_id?: string | null }
  ): Promise<GenerationEventListResponse> {
    const url = new URL(
      `${API_BASE_URL}/api/v1/generate/sessions/${encodeURIComponent(sessionId)}/events`
    );
    // listEvents is always short-poll JSON, never SSE stream.
    url.searchParams.set("accept", "application/json");
    if (params?.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }
    if (params?.limit) {
      url.searchParams.set("limit", String(params.limit));
    }
    if (params?.run_id) {
      url.searchParams.set("run_id", params.run_id);
    }
    const response = await apiFetch(url.toString(), { method: "GET" });
    const payload = await response.json();
    if (!response.ok) {
      throw toApiError(payload, response.status);
    }
    return payload as GenerationEventListResponse;
  },

  async sendCommand(
    sessionId: string,
    data: GenerationSessionCommandPayload
  ): Promise<GenerationSessionCommandResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/commands",
      {
        params: { path: { session_id: sessionId } },
        body: data as never,
        headers,
      }
    );
    return unwrap<GenerationSessionCommandResponse>(result);
  },

  async getCapabilities(): Promise<GenerationCapabilitiesResponse> {
    const result = await sdkClient.GET("/api/v1/generate/capabilities");
    return unwrap<GenerationCapabilitiesResponse>(result);
  },

  async listSessionCandidateChanges(
    sessionId: string,
    params?: {
      status?: "pending" | "accepted" | "rejected";
      proposer_user_id?: string;
    }
  ): Promise<CandidateChangesResponse> {
    const result = await sdkClient.GET(
      "/api/v1/generate/sessions/{session_id}/candidate-change",
      {
        params: {
          path: { session_id: sessionId },
          query: params,
        },
      }
    );
    return unwrap<CandidateChangesResponse>(result);
  },

  async createSessionCandidateChange(
    sessionId: string,
    data: CandidateChangeRequest
  ): Promise<CandidateChangeResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/candidate-change",
      {
        params: { path: { session_id: sessionId } },
        body: data,
        headers,
      }
    );
    return unwrap<CandidateChangeResponse>(result);
  },

  getEventStream(
    sessionId: string,
    cursor?: string,
    runId?: string | null
  ): string {
    const url = new URL(
      `${API_BASE_URL}/api/v1/generate/sessions/${sessionId}/events`
    );
    if (cursor) url.searchParams.set("cursor", cursor);
    if (runId) url.searchParams.set("run_id", runId);
    return url.toString();
  },
};
