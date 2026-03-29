import { sdkClient, unwrap, withIdempotency } from "./client";
import type { components, operations } from "./types";

export type PreviewResponse = components["schemas"]["PreviewResponse"];
export type ModifyResponse = components["schemas"]["ModifyResponse"];
export type SlideDetailResponse = components["schemas"]["SlideDetailResponse"];
export type ExportResponse = components["schemas"]["ExportResponse"];
export type PreviewQuery =
  operations["getGenerateSessionsBySessionIdPreview"]["parameters"]["query"];
export type ModifySessionRequest =
  components["schemas"]["ModifySessionRequest"];
export type ExportRequest = components["schemas"]["ExportRequest"];
export type SlideDetailQuery = PreviewQuery;

export const previewApi = {
  async getSessionPreview(
    sessionId: string,
    options?: PreviewQuery
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
      { params: { path: { session_id: sessionId }, query } }
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
        body: data,
        headers,
      }
    );
    return unwrap<ModifyResponse>(result);
  },

  async getSessionSlideDetail(
    sessionId: string,
    slideId: string,
    options?: SlideDetailQuery
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
          query,
        },
      }
    );
    return unwrap<SlideDetailResponse>(result);
  },

  async exportSessionPreview(
    sessionId: string,
    data: ExportRequest
  ): Promise<ExportResponse> {
    const body: ExportRequest = {
      ...data,
      include_sources: data.include_sources ?? true,
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
