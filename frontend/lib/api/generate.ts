/**
 * Generate API
 *
 * 基于 OpenAPI 契约的生成 API 封装
 *
 * 更新日期: 2026-02-25
 * 更新内容:
 * - 添加文件下载接口
 * - 更新 API 路径 (status -> tasks/{id}/status)
 * - 增强生成选项（模板、主题色等）
 */

import { request, getApiUrl } from "./client";
import { TokenStorage } from "../auth";
import type { components } from "../types/api";

export type GenerateRequest = components["schemas"]["GenerateRequest"];
export type GenerateResponse = components["schemas"]["GenerateResponse"];
export type GenerateStatusResponse =
  components["schemas"]["GenerateStatusResponse"];
export type VersionsResponse = components["schemas"]["VersionsResponse"];

export const generateApi = {
  async generateCourseware(data: GenerateRequest): Promise<GenerateResponse> {
    return request<GenerateResponse>("/generate/courseware", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  },

  async getGenerateStatus(taskId: string): Promise<GenerateStatusResponse> {
    // 更新：新的 API 路径
    return request<GenerateStatusResponse>(`/generate/tasks/${taskId}/status`, {
      method: "GET",
    });
  },

  /**
   * 获取任务的所有版本
   * @param taskId 任务 ID
   * @returns 版本列表
   */
  async getTaskVersions(taskId: string): Promise<VersionsResponse> {
    return request<VersionsResponse>(`/generate/tasks/${taskId}/versions`, {
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
    const token = TokenStorage.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // 注意：前端使用用户友好的扩展名 (pptx/docx)，后端使用简写 (ppt/word)
    // 这是一个 API 适配层转换
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
