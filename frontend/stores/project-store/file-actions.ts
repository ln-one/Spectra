import { filesApi, ragApi } from "@/lib/sdk";
import { createApiError, getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import { resolveReadySelectedFileIds } from "./source-scope";
import type { ProjectState, ProjectStoreContext, SourceDetail } from "./types";

const SOURCE_REPAIR_COOLDOWN_MS = 5 * 60 * 1000;
const ARCHIVE_URL_KEYS = [
  "source_archive_url",
  "dualweave_result_url",
  "result_url",
  "full_zip_url",
] as const;
const ARCHIVE_URL_NESTED_KEYS = [
  "processing_artifact",
  "delivery_artifact",
  "dualweave",
] as const;

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function resolveArchiveUrl(parseResult: unknown): string | null {
  const payload = toRecord(parseResult);
  if (!payload) {
    return null;
  }

  for (const key of ARCHIVE_URL_KEYS) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  for (const key of ARCHIVE_URL_NESTED_KEYS) {
    const nested = toRecord(payload[key]);
    if (!nested) {
      continue;
    }
    for (const childKey of ARCHIVE_URL_KEYS) {
      const value = nested[childKey];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
}

function containsSuspectedHtmlFragment(content: string | undefined): boolean {
  if (!content) {
    return false;
  }
  return /<\/(td|tr|th|table|tbody|thead)>\s*<(td|tr|th|table|tbody|thead)\b/i.test(
    content
  );
}

function containsRelativeImageReference(content: string | undefined): boolean {
  if (!content) {
    return false;
  }

  const markdownPattern = /!\[[^\]]*\]\(([^)]+)\)/gi;
  let markdownMatch: RegExpExecArray | null = null;
  while ((markdownMatch = markdownPattern.exec(content)) !== null) {
    const source = (markdownMatch[1] || "").trim().replace(/^["']|["']$/g, "");
    if (source && !/^https?:\/\//i.test(source)) {
      return true;
    }
  }

  const htmlPattern = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let htmlMatch: RegExpExecArray | null = null;
  while ((htmlMatch = htmlPattern.exec(content)) !== null) {
    const source = (htmlMatch[1] || "").trim();
    if (source && !/^https?:\/\//i.test(source)) {
      return true;
    }
  }

  return false;
}

function resolveAutoRepairDecision(detail: SourceDetail | null): {
  fileId: string | null;
  reason: string | null;
} {
  const fileInfo = toRecord(detail?.file_info);
  const fileId = typeof fileInfo?.id === "string" ? fileInfo.id : null;
  if (!fileId) {
    return { fileId: null, reason: null };
  }

  const content = typeof detail?.content === "string" ? detail.content : "";
  if (containsSuspectedHtmlFragment(content)) {
    return { fileId, reason: "html_fragment" };
  }

  const hasRelativeImage = containsRelativeImageReference(content);
  const archiveUrl = resolveArchiveUrl(fileInfo?.parse_result);
  if (hasRelativeImage && !archiveUrl) {
    return { fileId, reason: "missing_archive_url" };
  }

  return { fileId, reason: null };
}

function normalizeComparableText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSameSourceDetail(
  currentDetail: SourceDetail | null,
  nextDetail: SourceDetail | null
): boolean {
  if (!currentDetail || !nextDetail) {
    return false;
  }
  if (
    normalizeComparableText(currentDetail.chunk_id) !==
    normalizeComparableText(nextDetail.chunk_id)
  ) {
    return false;
  }
  if (
    normalizeComparableText(currentDetail.content) !==
    normalizeComparableText(nextDetail.content)
  ) {
    return false;
  }

  const currentSource = toRecord(currentDetail.source);
  const nextSource = toRecord(nextDetail.source);
  if (
    normalizeComparableText(currentSource?.source_type) !==
      normalizeComparableText(nextSource?.source_type) ||
    normalizeComparableText(currentSource?.page_number) !==
      normalizeComparableText(nextSource?.page_number) ||
    normalizeComparableText(currentSource?.timestamp) !==
      normalizeComparableText(nextSource?.timestamp)
  ) {
    return false;
  }

  const currentContext = toRecord(currentDetail.context);
  const nextContext = toRecord(nextDetail.context);
  return (
    normalizeComparableText(currentContext?.previous_chunk) ===
      normalizeComparableText(nextContext?.previous_chunk) &&
    normalizeComparableText(currentContext?.next_chunk) ===
      normalizeComparableText(nextContext?.next_chunk)
  );
}

function cloneSourceDetail(detail: SourceDetail): SourceDetail {
  return {
    ...detail,
    file_info:
      detail.file_info && typeof detail.file_info === "object"
        ? { ...detail.file_info }
        : detail.file_info,
    source:
      detail.source && typeof detail.source === "object"
        ? { ...detail.source }
        : detail.source,
    context:
      detail.context && typeof detail.context === "object"
        ? { ...detail.context }
        : detail.context,
  };
}

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
  const sourceRepairLastTriggeredAt = new Map<string, number>();
  const sourceRepairInFlight = new Map<string, Promise<void>>();

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
        const activeSourceDetail = get().activeSourceDetail;
        if (activeSourceDetail?.chunk_id === chunkId) {
          set({ activeSourceDetail: cloneSourceDetail(activeSourceDetail) });
          return;
        }

        const currentProjectId = projectId ?? get().project?.id ?? undefined;
        const response = await ragApi.getSourceDetail(
          chunkId,
          projectId ?? undefined
        );
        const detail = response?.data ?? null;
        set({ activeSourceDetail: detail });

        const repairDecision = resolveAutoRepairDecision(detail);
        if (repairDecision.fileId && repairDecision.reason) {
          const { fileId, reason } = repairDecision;
          const now = Date.now();
          const lastTriggeredAt = sourceRepairLastTriggeredAt.get(fileId) ?? 0;
          const hasRecentTrigger =
            now - lastTriggeredAt < SOURCE_REPAIR_COOLDOWN_MS;
          if (!hasRecentTrigger && !sourceRepairInFlight.has(fileId)) {
            sourceRepairLastTriggeredAt.set(fileId, now);
            const repairTask = (async () => {
              try {
                await ragApi.indexFile({ file_id: fileId });
                const activeChunkIdBeforeRefresh =
                  get().activeSourceDetail?.chunk_id ?? null;
                if (currentProjectId && activeChunkIdBeforeRefresh !== chunkId) {
                  await get().fetchFiles(currentProjectId);
                }
                const refreshed = await ragApi.getSourceDetail(
                  chunkId,
                  currentProjectId
                );
                const refreshedDetail = refreshed?.data ?? null;
                if (!refreshedDetail) {
                  return;
                }
                set((state) => {
                  const activeDetail = state.activeSourceDetail;
                  if (activeDetail?.chunk_id !== chunkId) {
                    return {};
                  }
                  if (isSameSourceDetail(activeDetail, refreshedDetail)) {
                    return {};
                  }
                  return { activeSourceDetail: refreshedDetail };
                });
              } catch (repairError) {
                console.warn("sources lazy repair failed", {
                  fileId,
                  reason,
                  chunkId,
                  error: repairError,
                });
              }
            })().finally(() => {
              sourceRepairInFlight.delete(fileId);
            });
            sourceRepairInFlight.set(fileId, repairTask);
          }
        }

        const fileId = detail?.file_info?.id;
        if (!fileId && currentProjectId) {
          await get().fetchFiles(currentProjectId);
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
