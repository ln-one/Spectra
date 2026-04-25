import { ApiError, apiFetch, sdkClient, unwrap, withIdempotency } from "./client";
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
export type EditableSlideNode = {
  node_id: string;
  kind: "text" | "image";
  label: string;
  text?: string | null;
  src?: string | null;
  alt?: string | null;
  bbox?: {
    x: number;
    y: number;
    w: number;
    h: number;
  } | null;
  style?: Record<string, unknown>;
  edit_capabilities?: string[];
};
export type EditableSlideScene = {
  run_id: string;
  slide_id: string;
  slide_index: number;
  slide_no: number;
  scene_version: string;
  nodes: EditableSlideNode[];
  readonly?: boolean;
  readonly_reason?: string | null;
};
export type SaveSlideSceneRequest = {
  scene_version: string;
  operations: Array<{
    op: "replace_text" | "replace_image";
    node_id: string;
    value: string;
  }>;
};
export type SaveSlideSceneData = {
  run_id: string;
  slide_id: string;
  slide_index: number;
  slide_no: number;
  status: string;
  scene: EditableSlideScene;
  preview: Record<string, unknown>;
};
export type PexelsSearchData = {
  query: string;
  results: Array<{
    id: string;
    thumbnail_url: string;
    full_url: string;
    photographer: string;
    width: number;
    height: number;
  }>;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("INVALID_JSON", `Invalid JSON response: ${path}`, response.status);
  }
  if (!response.ok || body?.success === false) {
    const error = body?.error;
    throw new ApiError(
      String(error?.code || "REQUEST_FAILED"),
      String(error?.message || `Request failed: ${path}`),
      response.status,
      error?.details,
      error?.retryable,
      error?.trace_id
    );
  }
  return body as T;
}

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

  async getSessionSlideScene(
    sessionId: string,
    slideId: string,
    options?: SlideDetailQuery
  ): Promise<{ success: boolean; data: EditableSlideScene; message?: string }> {
    const query = new URLSearchParams();
    if (options?.artifact_id) query.set("artifact_id", options.artifact_id);
    if (options?.run_id) query.set("run_id", options.run_id);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return requestJson(`/api/v1/generate/sessions/${sessionId}/preview/slides/${slideId}/scene${suffix}`);
  },

  async saveSessionSlideScene(
    sessionId: string,
    slideId: string,
    data: SaveSlideSceneRequest,
    options?: SlideDetailQuery
  ): Promise<{ success: boolean; data: SaveSlideSceneData; message?: string }> {
    const query = new URLSearchParams();
    if (options?.artifact_id) query.set("artifact_id", options.artifact_id);
    if (options?.run_id) query.set("run_id", options.run_id);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return requestJson(`/api/v1/generate/sessions/${sessionId}/preview/slides/${slideId}/scene/save${suffix}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  },

  buildSessionSlideAssetUrl(
    sessionId: string,
    slideId: string,
    assetPath: string,
    options?: SlideDetailQuery
  ): string {
    const query = new URLSearchParams({ path: assetPath });
    if (options?.artifact_id) query.set("artifact_id", options.artifact_id);
    if (options?.run_id) query.set("run_id", options.run_id);
    return `/api/v1/generate/sessions/${sessionId}/preview/slides/${slideId}/asset?${query.toString()}`;
  },

  async searchPexelsImages(
    query: string
  ): Promise<{ success: boolean; data: PexelsSearchData; message?: string }> {
    const encoded = new URLSearchParams({ q: query.trim() });
    return requestJson(`/api/v1/generate/assets/pexels/search?${encoded.toString()}`);
  },
};
