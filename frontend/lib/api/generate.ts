/**
 * Generate API
 *
 * 基于 OpenAPI 契约的生成 API 封装
 *
 * 更新日期: 2026-03-04
 * 更新内容:
 * - 新增 Session 相关的 API（会话驱动模型）
 * - 添加文件下载接口
 * - 更新 API 路径 (status -> tasks/{id}/status)
 * - 增强生成选项（模板、主题色等）
 */

import { request, getApiUrl } from "./client";
import { TokenStorage } from "../auth";
import type { components } from "../types/api";

export type GenerateRequest = components["schemas"]["GenerateRequest"];
export type GenerateResponse = components["schemas"]["GenerateResponse"];
export type GenerateStatusResponse = components["schemas"]["GenerateStatusResponse"];
export type VersionsResponse = components["schemas"]["VersionsResponse"];

// Session 相关类型
export type GenerationState = components["schemas"]["GenerationState"];
export type CreateGenerationSessionRequest =
  components["schemas"]["CreateGenerationSessionRequest"];
export type CreateGenerationSessionResponse =
  components["schemas"]["CreateGenerationSessionResponse"];
export type GenerationSessionResponse = components["schemas"]["GenerationSessionResponse"];
export type GenerationSessionCommandRequest =
  components["schemas"]["GenerationSessionCommandRequest"];
export type GenerationSessionCommandResponse =
  components["schemas"]["GenerationSessionCommandResponse"];
export type GenerationCommandType = components["schemas"]["GenerationCommandType"];
export type GenerationCommandEnvelope = components["schemas"]["GenerationCommandEnvelope"];
export type SessionRef = components["schemas"]["SessionRef"];
export type SessionStatePayload = components["schemas"]["SessionStatePayload"];

// ============ Session 模型 API（会话驱动） ============

/**
 * 创建生成会话
 * @param data 会话创建请求
 * @returns 会话创建响应
 */
async function createSession(
  data: CreateGenerationSessionRequest
): Promise<CreateGenerationSessionResponse> {
  return request<CreateGenerationSessionResponse>("/generate/sessions", {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
    },
  });
}

/**
 * 获取会话快照
 * @param sessionId 会话 ID
 * @returns 会话状态
 */
async function getSession(
  sessionId: string
): Promise<GenerationSessionResponse> {
  return request<GenerationSessionResponse>(
    `/generate/sessions/${sessionId}`,
    { method: "GET" }
  );
}

/**
 * 执行会话命令（唯一写入口）
 * @param sessionId 会话 ID
 * @param command 命令内容
 * @returns 命令执行结果
 */
async function executeCommand(
  sessionId: string,
  command: GenerationCommandEnvelope,
  idempotencyKey?: string
): Promise<GenerationSessionCommandResponse> {
  const key = idempotencyKey || crypto.randomUUID();
  return request<GenerationSessionCommandResponse>(
    `/generate/sessions/${sessionId}/commands`,
    {
      method: "POST",
      body: JSON.stringify({ command }),
      headers: {
        "Idempotency-Key": key,
      },
    }
  );
}

/**
 * 获取会话事件流（SSE）
 * @param sessionId 会话 ID
 * @param cursor 游标（可选，用于断线续连）
 * @returns SSE EventSource
 */
function getSessionEvents(
  sessionId: string,
  cursor?: string
): EventSource {
  const url = cursor
    ? `/generate/sessions/${sessionId}/events?cursor=${encodeURIComponent(cursor)}`
    : `/generate/sessions/${sessionId}/events`;
  return new EventSource(getApiUrl(url));
}

// ============ 旧版 Task 模型 API（兼容） ============

export const generateApi = {
  // --- Session API ---
  createSession,
  getSession,
  executeCommand,
  getSessionEvents,

  // --- Legacy Task API ---
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
