import { sdkClient, unwrap, withIdempotency } from "./client";
import type { components } from "./types";

export type PreviewResponse = components["schemas"]["PreviewResponse"];
export type ModifyResponse = components["schemas"]["ModifyResponse"];
export type SlideDetailResponse = components["schemas"]["SlideDetailResponse"];
export type ExportResponse = components["schemas"]["ExportResponse"];

export type ModifySessionRequest =
  components["schemas"]["ModifySessionRequest"];
export type ExportRequest = components["schemas"]["ExportRequest"] & {
  run_id?: string;
};

export const previewApi = {
  async getSessionPreview(
    sessionId: string,
    options?: { artifact_id?: string; run_id?: string }
  ): Promise<PreviewResponse> {
    const query =
      options?.artifact_id || options?.run_id
        ? {
            artifact_id: options?.artifact_id,
            run_id: options?.run_id,
          }
        : undefined;
    const result = await sdkClient.GET(
      "/api/v1/generate/sessions/{session_id}/preview",
      { params: { path: { session_id: sessionId }, query: query as never } }
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
    slideId: string,
    options?: { artifact_id?: string; run_id?: string }
  ): Promise<SlideDetailResponse> {
    const query =
      options?.artifact_id || options?.run_id
        ? {
            artifact_id: options?.artifact_id,
            run_id: options?.run_id,
          }
        : undefined;
    const result = await sdkClient.GET(
      "/api/v1/generate/sessions/{session_id}/preview/slides/{slide_id}",
      {
        params: {
          path: { session_id: sessionId, slide_id: slideId },
          query: query as never,
        },
      }
    );
    return unwrap<SlideDetailResponse>(result);
  },

  async exportSessionPreview(
    sessionId: string,
    data: ExportRequest
  ): Promise<ExportResponse> {
    const body: components["schemas"]["ExportRequest"] & { run_id?: string } = {
      ...data,
      include_sources: data.include_sources ?? true,
      run_id: data.run_id,
    };
    const result = await sdkClient.POST(
      "/api/v1/generate/sessions/{session_id}/preview/export",
      {
        params: { path: { session_id: sessionId } },
        body: body as never,
      }
    );
    return unwrap<ExportResponse>(result);
  },
};
