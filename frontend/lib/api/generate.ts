/**
 * Generate API
 *
 * 基于 OpenAPI 契约的生成 API 封装
 * 支持 Mock 模式用于前端独立开发
 *
 * 更新日期: 2026-02-25
 * 更新内容:
 * - 添加文件下载接口
 * - 更新 API 路径 (status -> tasks/{id}/status)
 * - 增强生成选项（模板、主题色等）
 */

import { request, getApiUrl, ENABLE_MOCK } from "./client";
import { TokenStorage } from "../auth";
import type { components } from "../types/api";

export type GenerateRequest = components["schemas"]["GenerateRequest"];
export type GenerateResponse = components["schemas"]["GenerateResponse"];
export type GenerateStatusResponse =
  components["schemas"]["GenerateStatusResponse"];

// Mock 数据（仅当 ENABLE_MOCK 为 true 时使用）
interface MockTask {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  result?: {
    ppt_url?: string;
    word_url?: string;
    version?: number;
  };
  error?: string;
}

const mockTasks: Map<string, MockTask> = new Map();

export const generateApi = {
  async generateCourseware(data: GenerateRequest): Promise<GenerateResponse> {
    if (ENABLE_MOCK) {
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
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  },

  async getGenerateStatus(taskId: string): Promise<GenerateStatusResponse> {
    if (ENABLE_MOCK) {
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

    // 更新：新的 API 路径
    return request<GenerateStatusResponse>(`/generate/tasks/${taskId}/status`, {
      method: "GET",
    });
  },

  /**
   * 下载生成的课件文件
   * @param taskId 任务 ID
   * @param fileType 文件类型 (ppt 或 word)
   * @returns Blob 对象
   */
  async downloadCourseware(
    taskId: string,
    fileType: "pptx" | "docx"
  ): Promise<Blob> {
    if (ENABLE_MOCK) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const content = `Mock ${fileType.toUpperCase()} file content for task ${taskId}`;
      return new Blob([content], {
        type:
          fileType === "pptx"
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    }

    const token = TokenStorage.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // 修复：使用正确的后端路径
    const apiFileType = fileType === "pptx" ? "ppt" : "word";
    const response = await fetch(
      getApiUrl(`/generate/tasks/${taskId}/download?file_type=${apiFileType}`),
      {
        method: "GET",
        headers,
      }
    );

    if (!response.ok) {
      throw new Error("下载失败");
    }

    return response.blob();
  },

  /**
   * 触发浏览器下载文件
   * @param taskId 任务 ID
   * @param fileType 文件类型
   * @param filename 文件名（可选）
   */
  async triggerDownload(
    taskId: string,
    fileType: "pptx" | "docx",
    filename?: string
  ): Promise<void> {
    const blob = await this.downloadCourseware(taskId, fileType);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `courseware-${taskId}.${fileType}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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
        version: 1,
      };
      mockTasks.set(taskId, task);
      clearInterval(interval);
    } else {
      task.progress = Math.round(progress);
      mockTasks.set(taskId, task);
    }
  }, 1000);
}
