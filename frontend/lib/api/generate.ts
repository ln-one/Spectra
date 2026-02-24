/**
 * Generate API
 *
 * 基于 OpenAPI 契约的生成 API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request } from "./client";
import type { components } from "../types/api";

export type GenerateRequest = components["schemas"]["GenerateRequest"];
export type GenerateResponse = components["schemas"]["GenerateResponse"];
export type GenerateStatusResponse = components["schemas"]["GenerateStatusResponse"];

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

interface MockTask {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  result?: {
    ppt_url?: string;
    word_url?: string;
  };
  error?: string;
}

const mockTasks: Map<string, MockTask> = new Map();

export const generateApi = {
  async generateCourseware(data: GenerateRequest): Promise<GenerateResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const taskId = `task-${Date.now()}`;
      const task: MockTask = {
        id: taskId,
        status: "processing",
        progress: 0,
      };
      mockTasks.set(taskId, task);

      startMockProgress(taskId);

      return {
        success: true,
        data: {
          task_id: taskId,
          status: "processing",
        },
        message: "生成任务已创建",
      };
    }

    return request<GenerateResponse>("/generate/courseware", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": `idem-${Date.now()}`,
      },
    });
  },

  async getGenerateStatus(taskId: string): Promise<GenerateStatusResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const task = mockTasks.get(taskId);
      if (!task) {
        return {
          success: true,
          data: {
            task_id: taskId,
            status: "pending",
            progress: 0,
          },
          message: "任务不存在",
        };
      }
      return {
        success: true,
        data: {
          task_id: task.id,
          status: task.status,
          progress: task.progress,
          result: task.result,
          error: task.error,
        },
        message: "获取成功",
      };
    }

    return request<GenerateStatusResponse>(`/generate/status/${taskId}`, {
      method: "GET",
    });
  },
};

function startMockProgress(taskId: string): void {
  let progress = 0;
  const interval = setInterval(() => {
    const task = mockTasks.get(taskId);
    if (!task) {
      clearInterval(interval);
      return;
    }

    progress += Math.random() * 20;
    if (progress >= 100) {
      progress = 100;
      task.status = "completed";
      task.progress = 100;
      task.result = {
        ppt_url: "/mock/sample.pptx",
        word_url: "/mock/sample.docx",
      };
      mockTasks.set(taskId, task);
      clearInterval(interval);
    } else {
      task.progress = Math.round(progress);
      mockTasks.set(taskId, task);
    }
  }, 1000);
}
