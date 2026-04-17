import {
  API_BASE_URL,
  DEFAULT_CONTRACT_VERSION,
  generateIdempotencyKey,
  sdkClient,
  unwrap,
} from "./client";
import type { components } from "./types";

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
  const parseResultRaw =
    raw.parse_result ?? raw.parseResult ?? raw.parse_results ?? undefined;
  let parsedResult: UploadedFile["parse_result"] | undefined;
  if (typeof parseResultRaw === "string") {
    try {
      parsedResult = JSON.parse(parseResultRaw) as UploadedFile["parse_result"];
    } catch {
      parsedResult = undefined;
    }
  } else if (typeof parseResultRaw === "object" && parseResultRaw !== null) {
    parsedResult = parseResultRaw as UploadedFile["parse_result"];
  }

  return {
    id: String(raw.id || ""),
    filename: String(raw.filename || ""),
    file_type: String(
      raw.file_type || raw.fileType || "pdf"
    ) as UploadedFile["file_type"],
    mime_type: String(raw.mime_type || raw.mimeType || ""),
    file_size: Number((raw.file_size ?? raw.fileSize ?? 0) as number | string),
    status: String(raw.status || "ready") as UploadedFile["status"],
    parse_progress: Number(
      (raw.parse_progress ?? raw.parseProgress ?? 100) as number | string
    ),
    parse_details: (raw.parse_details ||
      raw.parseDetails ||
      {}) as UploadedFile["parse_details"],
    parse_result: parsedResult,
    parse_error: (raw.parse_error || raw.parseError || undefined) as
      | string
      | undefined,
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

const MAX_FILE_SIZE = 104857600;

export const filesApi = {
  async uploadFile(
    file: File,
    projectId: string,
    onProgress?: (progress: number) => void,
    sessionId?: string
  ): Promise<UploadResponse> {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `文件 "${file.name}" 大小（${(file.size / 1048576).toFixed(1)}MB）超过限制（100MB）`
      );
    }
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", projectId);
      if (sessionId) {
        formData.append("session_id", sessionId);
      }

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}/api/v1/files`);
      xhr.withCredentials = true;

      const idempotencyKey = generateIdempotencyKey();
      xhr.setRequestHeader("Idempotency-Key", idempotencyKey);
      xhr.setRequestHeader("X-Contract-Version", DEFAULT_CONTRACT_VERSION);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed?.data?.file) {
              parsed.data.file = normalizeFileFromServer(parsed.data.file);
              // 检查后端返回的 file 状态是否为失败
              if (parsed.data.file.status === "failed") {
                const errorMsg = parsed.data.file.parse_error || "文件解析失败";
                reject(new Error(errorMsg));
                xhr.onprogress = null;
                xhr.onload = null;
                xhr.onerror = null;
                xhr.upload.onprogress = null;
                return;
              }
            }
            resolve(parsed);
          } catch {
            reject(new Error("上传失败：响应解析异常"));
          }
        } else {
          reject(
            new Error(parseUploadErrorMessage(xhr.responseText, "上传失败"))
          );
        }
        xhr.onprogress = null;
        xhr.onload = null;
        xhr.onerror = null;
        xhr.upload.onprogress = null;
      };

      xhr.onerror = () => {
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
    const result = await sdkClient.GET("/api/v1/projects/{project_id}/files", {
      params: { path: { project_id: projectId }, query: params },
    });
    const response = await unwrap<GetFilesResponse>(result);
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
    const result = await sdkClient.PATCH("/api/v1/files/{file_id}/intent", {
      params: { path: { file_id: fileId } },
      body: data,
    });
    const response = await unwrap<UpdateFileIntentResponse>(result);
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
    const result = await sdkClient.DELETE("/api/v1/files/{file_id}", {
      params: { path: { file_id: fileId } },
    });
    return unwrap<{ success: boolean; message: string }>(result);
  },

  async batchDeleteFiles(
    fileIds: string[]
  ): Promise<components["schemas"]["BatchDeleteResponse"]> {
    const result = await sdkClient.DELETE("/api/v1/files/batch", {
      body: { file_ids: fileIds },
    });
    return unwrap<components["schemas"]["BatchDeleteResponse"]>(result);
  },

  async batchUploadFiles(
    files: File[],
    projectId: string,
    onProgress?: (progress: number) => void,
    sessionId?: string
  ): Promise<components["schemas"]["BatchUploadResponse"]> {
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(
          `文件 "${file.name}" 大小（${(file.size / 1048576).toFixed(1)}MB）超过限制（400MB）`
        );
      }
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    formData.append("project_id", projectId);
    if (sessionId) {
      formData.append("session_id", sessionId);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}/api/v1/files/batch`);
      xhr.withCredentials = true;

      const idempotencyKey = generateIdempotencyKey();
      xhr.setRequestHeader("Idempotency-Key", idempotencyKey);
      xhr.setRequestHeader("X-Contract-Version", DEFAULT_CONTRACT_VERSION);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed?.data?.files && Array.isArray(parsed.data.files)) {
              parsed.data.files = parsed.data.files.map(
                (f: Record<string, unknown>) => normalizeFileFromServer(f)
              );
            }
            resolve(parsed);
          } catch {
            reject(new Error("批量上传失败：响应解析异常"));
          }
        } else {
          reject(
            new Error(parseUploadErrorMessage(xhr.responseText, "批量上传失败"))
          );
        }
        xhr.onprogress = null;
        xhr.onload = null;
        xhr.onerror = null;
        xhr.upload.onprogress = null;
      };

      xhr.onerror = () => {
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
