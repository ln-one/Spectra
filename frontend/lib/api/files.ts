/**
 * Files API
 *
 * 基于 OpenAPI 契约的文件 API 封装
 *
 * 更新日期: 2026-02-25
 * 更新内容: 增强文件解析状态字段
 */

import {
  request,
  getApiUrl,
  DEFAULT_CONTRACT_VERSION,
  generateIdempotencyKey,
} from "./client";
import { TokenStorage } from "../auth";
import type { components } from "../types/api";

export type UploadedFile = components["schemas"]["UploadedFile"];
export type UploadResponse = components["schemas"]["UploadResponse"];
export type GetFilesResponse = components["schemas"]["GetFilesResponse"];
export type UpdateFileIntentRequest =
  components["schemas"]["UpdateFileIntentRequest"];
export type UpdateFileIntentResponse =
  components["schemas"]["UpdateFileIntentResponse"];

function parseUploadErrorMessage(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.detail) {
      return String(parsed.detail);
    }
    if (parsed?.error?.message) {
      return String(parsed.error.message);
    }
    if (parsed?.message) {
      return String(parsed.message);
    }
  } catch {
    // ignore json parse failure
  }
  return fallback;
}

function normalizeFileFromServer(raw: Record<string, unknown>): UploadedFile {
  return {
    id: String(raw.id || ""),
    filename: String(raw.filename || ""),
    file_type: String(raw.file_type || "pdf") as UploadedFile["file_type"],
    mime_type: String(raw.mime_type || ""),
    file_size: Number(raw.file_size || 0),
    status: String(raw.status || "ready") as UploadedFile["status"],
    parse_progress: Number(raw.parse_progress || 100),
    parse_details: (raw.parse_details || {}) as UploadedFile["parse_details"],
    usage_intent: (raw.usage_intent || undefined) as string | undefined,
    created_at: String(raw.created_at || new Date().toISOString()),
    updated_at: String(raw.updated_at || new Date().toISOString()),
  };
}

// OpenAPI 契约定义的最大文件大小: 100MB
const MAX_FILE_SIZE = 104857600;

export const filesApi = {
  async uploadFile(
    file: File,
    projectId: string,
    onProgress?: (progress: number) => void
  ): Promise<UploadResponse> {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`文件 "${file.name}" 大小（${(file.size / 1048576).toFixed(1)}MB）超过限制（100MB）`);
    }
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", projectId);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", getApiUrl("/files"));

      const token = TokenStorage.getAccessToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      // 添加幂等键
      const idempotencyKey = generateIdempotencyKey();
      xhr.setRequestHeader("Idempotency-Key", idempotencyKey);

      // 添加契约版本头
      xhr.setRequestHeader("X-Contract-Version", DEFAULT_CONTRACT_VERSION);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.data?.file) {
            parsed.data.file = normalizeFileFromServer(parsed.data.file);
          }
          resolve(parsed);
        } else {
          reject(
            new Error(parseUploadErrorMessage(xhr.responseText, "上传失败"))
          );
        }
        // 清理事件监听器
        xhr.onprogress = null;
        xhr.onload = null;
        xhr.onerror = null;
        xhr.upload.onprogress = null;
      };

      xhr.onerror = () => {
        // 清理事件监听器
        xhr.onprogress = null;
        xhr.onload = null;
        xhr.onerror = null;
        xhr.upload.onprogress = null;
        reject(new Error("上传失败：网络异常"));
      };
      xhr.send(formData);
    });
  },

  async getProjectFiles(
    projectId: string,
    params?: { page?: number; limit?: number }
  ): Promise<GetFilesResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.limit) queryParams.set("limit", String(params.limit));
    const query = queryParams.toString();

    const response = await request<GetFilesResponse>(
      `/projects/${projectId}/files${query ? `?${query}` : ""}`,
      {
        method: "GET",
      }
    );
    if (response?.data?.files) {
      response.data.files = response.data.files.map((f) =>
        normalizeFileFromServer(f as unknown as Record<string, unknown>)
      );
    }
    return response;
  },

  async updateFileIntent(
    fileId: string,
    data: UpdateFileIntentRequest
  ): Promise<UpdateFileIntentResponse> {
    const response = await request<UpdateFileIntentResponse>(
      `/files/${fileId}/intent`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
    if (response?.data?.file) {
      response.data.file = normalizeFileFromServer(
        response.data.file as unknown as Record<string, unknown>
      );
    }
    return response;
  },

  async deleteFile(
    fileId: string
  ): Promise<{ success: boolean; message: string }> {
    return request(`/files/${fileId}`, {
      method: "DELETE",
    });
  },

  async batchDeleteFiles(
    fileIds: string[]
  ): Promise<components["schemas"]["BatchDeleteResponse"]> {
    return request<components["schemas"]["BatchDeleteResponse"]>(
      "/files/batch",
      {
        method: "DELETE",
        body: JSON.stringify({ file_ids: fileIds }),
      }
    );
  },

  async batchUploadFiles(
    files: File[],
    projectId: string,
    onProgress?: (progress: number) => void
  ): Promise<components["schemas"]["BatchUploadResponse"]> {
    // 校验每个文件大小
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`文件 "${file.name}" 大小（${(file.size / 1048576).toFixed(1)}MB）超过限制（100MB）`);
      }
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    formData.append("project_id", projectId);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", getApiUrl("/files/batch"));

      const token = TokenStorage.getAccessToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      // 添加幂等键
      const idempotencyKey = generateIdempotencyKey();
      xhr.setRequestHeader("Idempotency-Key", idempotencyKey);

      // 添加契约版本头
      xhr.setRequestHeader("X-Contract-Version", DEFAULT_CONTRACT_VERSION);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.data?.files && Array.isArray(parsed.data.files)) {
            parsed.data.files = parsed.data.files.map(
              (f: Record<string, unknown>) => normalizeFileFromServer(f)
            );
          }
          resolve(parsed);
        } else {
          reject(
            new Error(parseUploadErrorMessage(xhr.responseText, "批量上传失败"))
          );
        }
        // 清理事件监听器
        xhr.onprogress = null;
        xhr.onload = null;
        xhr.onerror = null;
        xhr.upload.onprogress = null;
      };

      xhr.onerror = () => {
        // 清理事件监听器
        xhr.onprogress = null;
        xhr.onload = null;
        xhr.onerror = null;
        xhr.upload.onprogress = null;
        reject(new Error("批量上传失败：网络异常"));
      };
      xhr.send(formData);
    });
  },
};
