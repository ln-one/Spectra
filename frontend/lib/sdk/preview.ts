import { sdkClient, unwrap, withIdempotency } from "./client";
import type { components } from "./types";

export type PreviewResponse = components["schemas"]["PreviewResponse"];
export type ModifyResponse = components["schemas"]["ModifyResponse"];
export type SlideDetailResponse = components["schemas"]["SlideDetailResponse"];

export interface ModifySessionRequest {
  instruction: string;
  target_slides?: string[];
  context?: Record<string, unknown>;
  base_render_version?: number;
}

export interface ExportRequest {
  format: "json" | "markdown" | "html";
  include_sources?: boolean;
  expected_render_version?: number;
}

export interface ExportResponse {
  success: boolean;
  data: {
    session_id?: string;
    task_id?: string;
    content: string;
    format: string;
    render_version?: number;
  };
  message: string;
}

export const previewApi = {
  async getSessionPreview(sessionId: string): Promise<PreviewResponse> {
    const result = await sdkClient.GET(
      "/api/v1/generate/sessions/{session_id}/preview",
      { params: { path: { session_id: sessionId } } }
    );
    return unwrap<PreviewResponse>(result);
  },

  async modifySessionPreview(
    sessionId: string,
    data: ModifySessionRequest
  ): Promise<ModifyResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/preview/modify",
      {
        params: { path: { session_id: sessionId } },
        body: data as components["schemas"]["ModifySessionRequest"],
        headers,
      }
    );
    return unwrap<ModifyResponse>(result);
  },

  async getSessionSlideDetail(
    sessionId: string,
    slideId: string
  ): Promise<SlideDetailResponse> {
    const result = await sdkClient.GET(
      "/api/v1/generate/sessions/{session_id}/preview/slides/{slide_id}",
      {
        params: { path: { session_id: sessionId, slide_id: slideId } },
      }
    );
    return unwrap<SlideDetailResponse>(result);
  },

  async exportSessionPreview(
    sessionId: string,
    data: ExportRequest
  ): Promise<ExportResponse> {
    const body: components["schemas"]["ExportRequest"] = {
      ...data,
      include_sources: data.include_sources ?? false,
    };
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/preview/export",
      {
        params: { path: { session_id: sessionId } },
        body,
      }
    );
    return unwrap<ExportResponse>(result);
  },
};
