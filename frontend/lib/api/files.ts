/**
 * Files API
 *
 * 基于 OpenAPI 契约的文件 API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request, getApiUrl } from "./client";
import type { components } from "../types/api";

export type UploadedFile = components["schemas"]["UploadedFile"];
export type UploadResponse = components["schemas"]["UploadResponse"];
export type GetFilesResponse = components["schemas"]["GetFilesResponse"];
export type UpdateFileIntentRequest =
  components["schemas"]["UpdateFileIntentRequest"];
export type UpdateFileIntentResponse =
  components["schemas"]["UpdateFileIntentResponse"];

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

const mockFiles: UploadedFile[] = [
  {
    id: "file-1",
    filename: "二次函数教学大纲.pdf",
    file_type: "pdf",
    mime_type: "application/pdf",
    file_size: 1024000,
    status: "ready",
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
    usage_intent: "示例视频",
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

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
      const fileType = file.name.split(".").pop() || "unknown";
      const newFile: UploadedFile = {
        id: `file-${Date.now()}`,
        filename: file.name,
        file_type: fileType as UploadedFile["file_type"],
        mime_type: file.type,
        file_size: file.size,
        status: "ready",
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

      const token = localStorage.getItem("access_token");
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
          reject(new Error("上传失败"));
        }
      };

      xhr.onerror = () => reject(new Error("上传失败"));
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

    return request<GetFilesResponse>(
      `/projects/${projectId}/files${query ? `?${query}` : ""}`,
      {
        method: "GET",
      }
    );
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

    return request<UpdateFileIntentResponse>(`/files/${fileId}/intent`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
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
};
