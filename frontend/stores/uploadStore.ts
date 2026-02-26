/**
 * Upload Store
 *
 * 使用 Zustand 管理文件上传状态
 * 支持单文件上传、批量上传、文件标注、删除等功能
 */

import { create } from "zustand";
import { filesApi, type UploadedFile } from "@/lib/api/files";

export type UploadStatus = "uploading" | "parsing" | "ready" | "failed";

export interface Upload {
  id: string;
  projectId: string;
  filename: string;
  filepath?: string;
  fileType: string;
  mimeType: string;
  size: number;
  status: UploadStatus;
  parseProgress?: number;
  parseDetails?: {
    pages_extracted?: number;
    images_extracted?: number;
    text_length?: number;
  };
  usageIntent?: string;
  createdAt: string;
  updatedAt?: string;
  error?: string;
}

export interface UploadState {
  uploads: Upload[];
  failedUploads: { filename: string; error: string }[];
  isLoading: boolean;
  error: string | null;
  currentProjectId: string | null;

  addUpload: (projectId: string, file: File) => Promise<void>;
  addBatchUploads: (projectId: string, files: File[]) => Promise<{ success: number; failed: number }>;
  updateUploadStatus: (id: string, status: UploadStatus, error?: string) => void;
  annotateUpload: (id: string, usageIntent: string) => Promise<void>;
  deleteUpload: (id: string) => Promise<void>;
  fetchUploads: (projectId: string) => Promise<void>;
  clearUploads: () => void;
  clearFailedUploads: () => void;
  clearError: () => void;
}

function toUpload(apiFile: UploadedFile, projectId: string): Upload {
  return {
    id: apiFile.id,
    projectId,
    filename: apiFile.filename,
    fileType: apiFile.file_type,
    mimeType: apiFile.mime_type || "",
    size: apiFile.file_size,
    status: apiFile.status as UploadStatus,
    parseProgress: apiFile.parse_progress,
    parseDetails: apiFile.parse_details,
    usageIntent: apiFile.usage_intent,
    createdAt: apiFile.created_at,
    updatedAt: apiFile.updated_at,
  };
}

export const useUploadStore = create<UploadState>()((set, _get) => ({
  uploads: [],
  failedUploads: [],
  isLoading: false,
  error: null,
  currentProjectId: null,

  addUpload: async (projectId: string, file: File) => {
    const tempId = `temp-${Date.now()}`;

    set((state) => ({
      uploads: [
        ...state.uploads,
        {
          id: tempId,
          projectId,
          filename: file.name,
          fileType: file.type,
          mimeType: file.type,
          size: file.size,
          status: "uploading",
          createdAt: new Date().toISOString(),
        },
      ],
      error: null,
    }));

    try {
      const response = await filesApi.uploadFile(file, projectId);

      if (response.success && response.data.file) {
        const upload = toUpload(response.data.file, projectId);

        set((state) => ({
          uploads: state.uploads.map((u) =>
            u.id === tempId ? upload : u
          ),
        }));
      }
    } catch (error) {
      set((state) => ({
        uploads: state.uploads.map((u) =>
          u.id === tempId
            ? { ...u, status: "failed", error: error instanceof Error ? error.message : "上传失败" }
            : u
        ),
        error: error instanceof Error ? error.message : "上传失败",
      }));
    }
  },

  addBatchUploads: async (projectId: string, files: File[]) => {
    set({ isLoading: true, error: null, failedUploads: [] });

    try {
      const response = await filesApi.batchUploadFiles(files, projectId);

      if (response.success && response.data.files) {
        const uploads = response.data.files.map((f) => toUpload(f, projectId));

        set((state) => ({
          uploads: [...state.uploads, ...uploads],
          isLoading: false,
        }));

        const failed = (response.data.failed || []).filter(
          (f): f is { filename: string; error: string } =>
            !!f.filename && !!f.error
        );
        if (failed.length > 0) {
          set({ failedUploads: failed });
        }

        return {
          success: uploads.length,
          failed: failed.length,
        };
      }

      return { success: 0, failed: files.length };
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "批量上传失败",
        isLoading: false,
      });
      return { success: 0, failed: files.length };
    }
  },

  updateUploadStatus: (id: string, status: UploadStatus, error?: string) => {
    set((state) => ({
      uploads: state.uploads.map((u) =>
        u.id === id ? { ...u, status, error } : u
      ),
    }));
  },

  annotateUpload: async (id: string, usageIntent: string) => {
    set((state) => ({
      uploads: state.uploads.map((u) =>
        u.id === id ? { ...u, usageIntent } : u
      ),
    }));

    try {
      await filesApi.updateFileIntent(id, { usage_intent: usageIntent });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "标注失败",
      });
    }
  },

  deleteUpload: async (id: string) => {
    try {
      await filesApi.deleteFile(id);

      set((state) => ({
        uploads: state.uploads.filter((u) => u.id !== id),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "删除失败",
      });
    }
  },

  fetchUploads: async (projectId: string) => {
    set({ isLoading: true, error: null, currentProjectId: projectId });

    try {
      const response = await filesApi.getProjectFiles(projectId);

      if (response.success && response.data.files) {
        const uploads = response.data.files.map((f: UploadedFile) => toUpload(f, projectId));

        set({
          uploads,
          isLoading: false,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "获取文件列表失败",
        isLoading: false,
      });
    }
  },

  clearUploads: () => {
    set({
      uploads: [],
      error: null,
      currentProjectId: null,
    });
  },

  clearFailedUploads: () => {
    set({ failedUploads: [] });
  },

  clearError: () => {
    set({ error: null });
  },
}));
