/**
 * Preview API
 *
 * 基于 OpenAPI 契约的预览 API 封装
 */

import { request } from "./client";
import type { components } from "../types/api";

export type PreviewResponse = components["schemas"]["PreviewResponse"];
export type ModifyRequest = components["schemas"]["ModifyRequest"];
export type ModifyResponse = components["schemas"]["ModifyResponse"];
export type SlideDetailResponse = components["schemas"]["SlideDetailResponse"];

export interface ExportPreviewRequest {
  format: "json" | "markdown" | "html";
  include_sources?: boolean;
}

export interface ExportPreviewResponse {
  success: boolean;
  data?: {
    content: string;
    format: string;
  };
}

export const previewApi = {
  async getPreview(taskId: string): Promise<PreviewResponse> {
    return request<PreviewResponse>(`/preview/${taskId}`, {
      method: "GET",
    });
  },

  async modifyPreview(
    taskId: string,
    data: ModifyRequest
  ): Promise<ModifyResponse> {
    return request<ModifyResponse>(`/preview/${taskId}/modify`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  },

  /**
   * 获取单个幻灯片详情
   * @param taskId 任务 ID
   * @param slideId 幻灯片 ID
   * @returns 幻灯片详情
   */
  async getSlideDetail(
    taskId: string,
    slideId: string
  ): Promise<SlideDetailResponse> {
    return request<SlideDetailResponse>(
      `/preview/${taskId}/slides/${slideId}`,
      {
        method: "GET",
      }
    );
  },

  /**
   * 导出预览内容
   * @param taskId 任务 ID
   * @param data 导出选项
   * @returns 导出的内容
   */
  async exportPreview(
    taskId: string,
    data: ExportPreviewRequest
  ): Promise<ExportPreviewResponse> {
    return request<ExportPreviewResponse>(`/preview/${taskId}/export`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
