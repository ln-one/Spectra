import { filesApi, ragApi } from "@/lib/sdk";
import { createApiError, getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import { resolveReadySelectedFileIds } from "./source-scope";
import type { ProjectStoreContext, ProjectState } from "./types";

export function createFileActions({
  set,
  get,
}: ProjectStoreContext): Pick<
  ProjectState,
  | "fetchFiles"
  | "uploadFile"
  | "deleteFile"
  | "toggleFileSelection"
  | "focusSourceByChunk"
  | "clearActiveSource"
> {
  let filesPollingTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFilesPollingTimer = () => {
    if (filesPollingTimer) {
      clearTimeout(filesPollingTimer);
      filesPollingTimer = null;
    }
  };

  return {
    fetchFiles: async (projectId: string) => {
      clearFilesPollingTimer();
      try {
        const response = await filesApi.getProjectFiles(projectId);
        if (response?.data?.files) {
          const nextFiles = response.data.files;
          set((state) => ({
            files: nextFiles,
            selectedFileIds: resolveReadySelectedFileIds(
              nextFiles,
              state.selectedFileIds
            ),
          }));

          let hasPending = false;
          nextFiles.forEach((file) => {
            if (file.status === "parsing" || file.status === "uploading") {
              hasPending = true;
            }
          });

          if (hasPending) {
            filesPollingTimer = setTimeout(() => {
              get().fetchFiles(projectId);
            }, 3000);
          }
        }
      } catch (error) {
        const message = getErrorMessage(error);
        toast({
          title: "获取文件列表失败",
          description: message,
          variant: "destructive",
        });
      }
    },

    uploadFile: async (file: File, projectId: string, options) => {
      set((state) => {
        const nextUploadingCount = state.uploadingCount + 1;
        return {
          uploadingCount: nextUploadingCount,
          isUploading: nextUploadingCount > 0,
        };
      });
      try {
        const response = await filesApi.uploadFile(
          file,
          projectId,
          options?.onProgress
        );
        await get().fetchFiles(projectId);
        return response?.data?.file;
      } catch (error) {
        const message = getErrorMessage(error);
        set({ error: createApiError({ code: "UPLOAD_FAILED", message }) });
        throw error;
      } finally {
        set((state) => {
          const nextUploadingCount = Math.max(0, state.uploadingCount - 1);
          return {
            uploadingCount: nextUploadingCount,
            isUploading: nextUploadingCount > 0,
          };
        });
      }
    },

    deleteFile: async (fileId: string) => {
      try {
        await filesApi.deleteFile(fileId);
        set((state) => ({
          files: state.files.filter((f) => f.id !== fileId),
          selectedFileIds: state.selectedFileIds.filter((id) => id !== fileId),
        }));
      } catch (error) {
        const message = getErrorMessage(error);
        set({ error: createApiError({ code: "DELETE_FILE_FAILED", message }) });
        toast({
          title: "删除文件失败",
          description: message,
          variant: "destructive",
        });
      }
    },

    toggleFileSelection: (fileId: string) => {
      set((state) => ({
        selectedFileIds: state.selectedFileIds.includes(fileId)
          ? state.selectedFileIds.filter((id) => id !== fileId)
          : [...state.selectedFileIds, fileId],
      }));
    },

    focusSourceByChunk: async (chunkId: string, projectId?: string | null) => {
      try {
        const response = await ragApi.getSourceDetail(
          chunkId,
          projectId ?? undefined
        );
        const detail = response?.data ?? null;
        set({ activeSourceDetail: detail });
        const fileId = detail?.file_info?.id;
        if (!fileId) {
          const currentProjectId = projectId ?? get().project?.id;
          if (currentProjectId) {
            await get().fetchFiles(currentProjectId);
          }
        }
      } catch (error) {
        const message = getErrorMessage(error);
        toast({
          title: "获取来源详情失败",
          description: message,
          variant: "destructive",
        });
      }
    },

    clearActiveSource: () => set({ activeSourceDetail: null }),
  };
}
