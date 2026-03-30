import {
  API_BASE_URL,
  apiFetch,
  sdkClient,
  toApiError,
  unwrap,
  withIdempotency,
} from "./client";
import { TokenStorage } from "../auth";
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
export type CreateGenerationSessionResponse =
  CreateGenerationSessionResponseTarget & {
    data: CreateGenerationSessionResponseTarget["data"] & {
      /**
       * Runtime compatibility:
       * backend currently returns data.run, while openapi-target does not declare it yet.
       */
      run?: SessionRun;
    };
  };
export type GenerationSessionResponse =
  components["schemas"]["GenerationSessionResponseTarget"];
export type GenerationEvent = components["schemas"]["GenerationEventTarget"];
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
  components["schemas"]["ResumeSessionResponseTarget"];
export type RegenerateSlideRequest =
  components["schemas"]["LocalModifySlideRequestTarget"];
export type RegenerateSlideResponse =
  components["schemas"]["LocalModifySlideResponseTarget"];
export type GenerationSessionCommandRequest =
  components["schemas"]["GenerationSessionCommandRequestTarget"];
export type GenerationSessionCommandResponse =
  components["schemas"]["GenerationSessionCommandResponseTarget"];
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

function readOptionalSessionRun(value: unknown): SessionRun | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as SessionRun;
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
    const payload = await unwrap<CreateGenerationSessionResponseTarget>(result);
    // Runtime compatibility:
    // backend currently returns data.run, while openapi-target does not declare it yet.
    const run = readOptionalSessionRun(
      (payload as { data?: { run?: unknown } })?.data?.run
    );
    if (!run) {
      return payload as CreateGenerationSessionResponse;
    }
    return {
      ...payload,
      data: {
        ...payload.data,
        run,
      },
    };
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
    params?: { cursor?: string | null; limit?: number }
  ): Promise<GenerationEventListResponse> {
    const url = new URL(
      `${API_BASE_URL}/api/v1/generate/sessions/${encodeURIComponent(sessionId)}/events`
    );
    if (params?.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }
    if (params?.limit) {
      url.searchParams.set("limit", String(params.limit));
    }
    const response = await apiFetch(url.toString(), { method: "GET" });
    const payload = await response.json();
    if (!response.ok) {
      throw toApiError(payload, response.status);
    }
    return payload as GenerationEventListResponse;
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
