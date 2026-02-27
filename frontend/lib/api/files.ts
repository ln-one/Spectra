/**
 * Files API
 *
 * 基于 OpenAPI 契约的文件 API 封装
 * 支持 Mock 模式用于前端独立开发
 *
 * 更新日期: 2026-02-25
 * 更新内容: 增强文件解析状态字段
 */

import { request, getApiUrl } from "./client";
import { TokenStorage } from "../auth";
import type { components } from "../types/api";

export type UploadedFile = components["schemas"]["UploadedFile"];
export type UploadResponse = components["schemas"]["UploadResponse"];
export type GetFilesResponse = components["schemas"]["GetFilesResponse"];
export type UpdateFileIntentRequest =
  components["schemas"]["UpdateFileIntentRequest"];
export type UpdateFileIntentResponse =
  components["schemas"]["UpdateFileIntentResponse"];

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

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

const FILE_TYPE_MAP: Record<string, UploadedFile["file_type"]> = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  ppt: "ppt",
  pptx: "ppt",
  mp4: "video",
  webm: "video",
  avi: "video",
  mov: "video",
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  svg: "image",
};

function getFileTypeFromExtension(
  extension: string
): UploadedFile["file_type"] {
  const ext = extension.toLowerCase();
  return FILE_TYPE_MAP[ext] || "pdf";
}

const mockFiles: UploadedFile[] = [
  {
    id: "file-1",
    filename: "二次函数教学大纲.pdf",
    file_type: "pdf",
    mime_type: "application/pdf",
    file_size: 1024000,
    status: "ready",
    parse_progress: 100,
    parse_details: {
      pages_extracted: 15,
      images_extracted: 8,
      text_length: 5420,
    },
    usage_intent: "用于第一章概念讲解",
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "file-2",
    filename: "教学案例集.docx",
    file_type: "word",
    mime_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    file_size: 512000,
    status: "ready",
    parse_progress: 100,
    parse_details: {
      pages_extracted: 10,
      images_extracted: 3,
      text_length: 3200,
    },
    usage_intent: "案例分析素材",
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "file-3",
    filename: "课堂实录.mp4",
    file_type: "video",
    mime_type: "video/mp4",
    file_size: 52428800,
    status: "ready",
    parse_progress: 100,
    parse_details: {
      duration: 1800, // 30分钟
    },
    usage_intent: "示例视频",
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

function normalizeFileFromServer(raw: Record<string, unknown>): UploadedFile {
  return {
    id: String(raw.id || ""),
    filename: String(raw.filename || ""),
    file_type: (raw.file_type ||
      raw.fileType ||
      "pdf") as UploadedFile["file_type"],
    mime_type: String(raw.mime_type || raw.mimeType || ""),
    file_size: Number(raw.file_size || raw.size || 0),
    status: String(raw.status || "ready") as UploadedFile["status"],
    parse_progress: Number(raw.parse_progress || raw.parseProgress || 100),
    parse_details: (raw.parse_details ||
      raw.parseResult ||
      {}) as UploadedFile["parse_details"],
    usage_intent: (raw.usage_intent || raw.usageIntent || undefined) as
      | string
      | undefined,
    created_at: String(
      raw.created_at || raw.createdAt || new Date().toISOString()
    ),
    updated_at: String(
      raw.updated_at || raw.updatedAt || new Date().toISOString()
    ),
  };
}

export const filesApi = {
  async uploadFile(
    file: File,
    projectId: string,
    onProgress?: (progress: number) => void
  ): Promise<UploadResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (onProgress) {
        onProgress(100);
      }
      const fileType = getFileTypeFromExtension(
        file.name.split(".").pop() || ""
      );
      const newFile: UploadedFile = {
        id: `file-${Date.now()}`,
        filename: file.name,
        file_type: fileType,
        mime_type: file.type,
        file_size: file.size,
        status: "ready",
        parse_progress: 100,
        parse_details: {
          pages_extracted: Math.floor(Math.random() * 20) + 1,
          images_extracted: Math.floor(Math.random() * 10),
          text_length: Math.floor(Math.random() * 10000) + 1000,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockFiles.unshift(newFile);
      return {
        success: true,
        data: { file: newFile },
        message: "上传成功",
      };
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
      };

      xhr.onerror = () => reject(new Error("上传失败：网络异常"));
      xhr.send(formData);
    });
  },

  async getProjectFiles(
    projectId: string,
    params?: { page?: number; limit?: number }
  ): Promise<GetFilesResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const page = params?.page || 1;
      const limit = params?.limit || 20;
      const start = (page - 1) * limit;
      const end = start + limit;
      const files = mockFiles.slice(start, end);
      return {
        success: true,
        data: {
          files,
          total: mockFiles.length,
          page,
          limit,
        },
        message: "获取成功",
      };
    }

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
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const index = mockFiles.findIndex((f) => f.id === fileId);
      if (index === -1) {
        throw new Error("文件不存在");
      }
      mockFiles[index] = {
        ...mockFiles[index],
        usage_intent: data.usage_intent,
        updated_at: new Date().toISOString(),
      };
      return {
        success: true,
        data: { file: mockFiles[index] },
        message: "标注成功",
      };
    }

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
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const index = mockFiles.findIndex((f) => f.id === fileId);
      if (index === -1) {
        throw new Error("文件不存在");
      }
      mockFiles.splice(index, 1);
      return {
        success: true,
        message: "删除成功",
      };
    }

    return request(`/files/${fileId}`, {
      method: "DELETE",
    });
  },

  async batchDeleteFiles(
    fileIds: string[]
  ): Promise<components["schemas"]["BatchDeleteResponse"]> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const deleted: number[] = [];
      const failed: { file_id: string; error: string }[] = [];

      for (const fileId of fileIds) {
        const index = mockFiles.findIndex((f) => f.id === fileId);
        if (index !== -1) {
          mockFiles.splice(index, 1);
          deleted.push(1);
        } else {
          failed.push({
            file_id: fileId,
            error: "文件不存在",
          });
        }
      }

      return {
        success: true,
        data: {
          deleted: deleted.length,
          failed: failed.length > 0 ? failed : undefined,
        },
        message: "批量删除完成",
      };
    }

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
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (onProgress) {
        onProgress(100);
      }

      const uploadedFiles: UploadedFile[] = [];
      const failed: { filename: string; error: string }[] = [];

      for (const file of files) {
        const fileType = getFileTypeFromExtension(
          file.name.split(".").pop() || ""
        );
        uploadedFiles.push({
          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          filename: file.name,
          file_type: fileType,
          mime_type: file.type,
          file_size: file.size,
          status: "ready",
          parse_progress: 100,
          parse_details: {
            pages_extracted: Math.floor(Math.random() * 20) + 1,
            images_extracted: Math.floor(Math.random() * 10),
            text_length: Math.floor(Math.random() * 10000) + 1000,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        mockFiles.unshift(uploadedFiles[uploadedFiles.length - 1]);
      }

      return {
        success: true,
        data: {
          files: uploadedFiles,
          total: uploadedFiles.length,
          failed: failed.length > 0 ? failed : undefined,
        },
        message: "批量上传成功",
      };
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

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(
            new Error(parseUploadErrorMessage(xhr.responseText, "批量上传失败"))
          );
        }
      };

      xhr.onerror = () => reject(new Error("批量上传失败：网络异常"));
      xhr.send(formData);
    });
  },
};
