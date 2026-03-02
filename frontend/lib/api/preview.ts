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
};
