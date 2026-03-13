/**
 * Preview API
 *
 * 基于 OpenAPI 契约的预览 API 封装（session-level 优先）
 */

import { request } from "./client";
import type { components } from "../types/api";

export type PreviewResponse = components["schemas"]["PreviewResponse"];
export type ModifyResponse = components["schemas"]["ModifyResponse"];
export type SlideDetailResponse = components["schemas"]["SlideDetailResponse"];

// 以下类型在 generated types 中不存在，手动定义以匹配 OpenAPI 契约
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
  // ─── Session-level 预览（主路径） ───

  async getSessionPreview(sessionId: string): Promise<PreviewResponse> {
    return request<PreviewResponse>(`/generate/sessions/${sessionId}/preview`, {
      method: "GET",
    });
  },

  async modifySessionPreview(
    sessionId: string,
    data: ModifySessionRequest
  ): Promise<ModifyResponse> {
    return request<ModifyResponse>(
      `/generate/sessions/${sessionId}/preview/modify`,
      {
        method: "POST",
        body: JSON.stringify(data),
        autoIdempotency: true,
      }
    );
  },

  async getSessionSlideDetail(
    sessionId: string,
    slideId: string
  ): Promise<SlideDetailResponse> {
    return request<SlideDetailResponse>(
      `/generate/sessions/${sessionId}/preview/slides/${slideId}`,
      {
        method: "GET",
      }
    );
  },

  async exportSessionPreview(
    sessionId: string,
    data: ExportRequest
  ): Promise<ExportResponse> {
    return request<ExportResponse>(
      `/generate/sessions/${sessionId}/preview/export`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  },
};
