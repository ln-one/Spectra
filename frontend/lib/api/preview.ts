/**
 * Preview API
 *
 * 基于 OpenAPI 契约的预览 API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request, ENABLE_MOCK } from "./client";
import type { components } from "../types/api";

export type PreviewResponse = components["schemas"]["PreviewResponse"];
export type ModifyRequest = components["schemas"]["ModifyRequest"];
export type ModifyResponse = components["schemas"]["ModifyResponse"];

// Mock 数据（仅当 ENABLE_MOCK 为 true 时使用）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockSlides = [];

export const previewApi = {
  async getPreview(taskId: string): Promise<PreviewResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        success: true,
        data: {
          task_id: taskId,
          slides: [],
          lesson_plan: {
            teaching_objectives: [],
            slides_plan: [],
          },
        },
        message: "Mock 获取成功",
      };
    }

    return request<PreviewResponse>(`/preview/${taskId}`, {
      method: "GET",
    });
  },

  async modifyPreview(
    taskId: string,
    data: ModifyRequest
  ): Promise<ModifyResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        success: true,
        data: {
          modify_task_id: `mock-modify-${Date.now()}`,
          status: "processing",
        },
        message: "Mock 修改任务已创建",
      };
    }

    return request<ModifyResponse>(`/preview/${taskId}/modify`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  },
};
