/**
 * Files API
 */

import { request } from "./client";

export interface UploadFileRequest {
  file: File;
  project_id: string;
}

export interface FileUploadResponse {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  projectId: string;
}

export const filesApi = {
  async uploadFile(data: UploadFileRequest): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append("file", data.file);
    formData.append("project_id", data.project_id);

    return request("/files", {
      method: "POST",
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  },
};
