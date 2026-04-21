import { filesApi, ragApi } from "@/lib/sdk";
import { createApiError, getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import { resolveReadySelectedFileIds } from "./source-scope";
import type {
  ProjectState,
  ProjectStoreContext,
  SourceDetail,
  SourceFocusRequest,
} from "./types";

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

function normalizeSearchableText(value: unknown): string {
  return normalizeComparableText(value).toLowerCase();
}

function isChunkMissingError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes("分块不存在");
}

type SearchResultCandidate = {
  chunk_id?: string;
  content?: string;
  score?: number;
  source?: {
    filename?: string;
    page_number?: number;
    timestamp?: number;
  };
};

function toSearchResultCandidates(payload: unknown): SearchResultCandidate[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.filter(
    (item): item is SearchResultCandidate =>
      Boolean(item) && typeof item === "object"
  );
}

function buildReplacementQueries(citation: SourceFocusRequest): string[] {
  const queries = [
    citation.contentPreview,
    citation.pageNumber
      ? `${citation.filename} 第${citation.pageNumber}页`
      : undefined,
    typeof citation.timestamp === "number"
      ? `${citation.filename} ${Math.round(citation.timestamp)}秒`
      : undefined,
    citation.filename,
  ];
  const seen = new Set<string>();
  return queries
    .map((value) => normalizeComparableText(value))
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}

function pickBestReplacementChunkId(
  candidates: SearchResultCandidate[],
  citation: SourceFocusRequest
): string | null {
  const normalizedFilename = normalizeSearchableText(citation.filename);
  const normalizedPreview = normalizeSearchableText(citation.contentPreview);
  let bestChunkId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const chunkId = normalizeComparableText(candidate.chunk_id);
    if (!chunkId) {
      continue;
    }

    let score = Number(candidate.score) || 0;
    const candidateFilename = normalizeSearchableText(candidate.source?.filename);
    if (normalizedFilename && candidateFilename === normalizedFilename) {
      score += 100;
    }
    if (
      typeof citation.pageNumber === "number" &&
      candidate.source?.page_number === citation.pageNumber
    ) {
      score += 60;
    }
    if (
      typeof citation.timestamp === "number" &&
      typeof candidate.source?.timestamp === "number" &&
      Math.abs(candidate.source.timestamp - citation.timestamp) <= 3
    ) {
      score += 60;
    }
    if (normalizedPreview) {
      const candidateContent = normalizeSearchableText(candidate.content);
      if (candidateContent.includes(normalizedPreview)) {
        score += 80;
      } else if (
        normalizedPreview.length >= 24 &&
        candidateContent.includes(normalizedPreview.slice(0, 24))
      ) {
        score += 40;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestChunkId = chunkId;
    }
  }

  return bestChunkId;
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

export function createFileActions({
  set,
  get,
}: ProjectStoreContext): Pick<
  ProjectState,
  | "fetchFiles"
  | "uploadFile"
  | "deleteFile"
  | "toggleFileSelection"
  | "toggleLibrarySelection"
  | "toggleArtifactSourceSelection"
  | "setSelectedLibraryIds"
  | "setSelectedArtifactSourceIds"
  | "focusSourceByChunk"
  | "clearActiveSource"
> {
  let filesPollingTimer: ReturnType<typeof setTimeout> | null = null;
  const sourceRepairLastTriggeredAt = new Map<string, number>();
  const sourceRepairInFlight = new Map<string, Promise<void>>();
  const sourceDetailCache = new Map<string, SourceDetail>();
  const sourceChunkRedirects = new Map<string, string>();

  const clearFilesPollingTimer = () => {
    if (filesPollingTimer) {
      clearTimeout(filesPollingTimer);
      filesPollingTimer = null;
    }
  };

  const cacheSourceDetail = (
    detail: SourceDetail | null,
    requestedChunkIds: Array<string | null | undefined> = []
  ) => {
    const actualChunkId = normalizeComparableText(detail?.chunk_id);
    if (!actualChunkId || !detail) {
      return;
    }

    sourceDetailCache.set(actualChunkId, detail);
    for (const requestedChunkId of requestedChunkIds) {
      const normalizedRequestedChunkId =
        normalizeComparableText(requestedChunkId);
      if (!normalizedRequestedChunkId) {
        continue;
      }
      sourceDetailCache.set(normalizedRequestedChunkId, detail);
      if (normalizedRequestedChunkId !== actualChunkId) {
        sourceChunkRedirects.set(normalizedRequestedChunkId, actualChunkId);
      }
    }
  };

  const getCachedSourceDetail = (chunkId: string): SourceDetail | null => {
    const normalizedChunkId = normalizeComparableText(chunkId);
    if (!normalizedChunkId) {
      return null;
    }
    const redirectedChunkId =
      sourceChunkRedirects.get(normalizedChunkId) ?? normalizedChunkId;
    return (
      sourceDetailCache.get(normalizedChunkId) ??
      sourceDetailCache.get(redirectedChunkId) ??
      null
    );
  };

  const resolveSourceDetailByCitation = async (
    citation: SourceFocusRequest,
    projectId: string
  ): Promise<SourceDetail | null> => {
    const matchingFileIds = get()
      .files.filter(
        (file) =>
          normalizeSearchableText(file.filename) ===
          normalizeSearchableText(citation.filename)
      )
      .map((file) => file.id);

    const queries = buildReplacementQueries(citation);
    for (const query of queries) {
      const searchResponse = await ragApi.search({
        project_id: projectId,
        query,
        top_k: 12,
        filters:
          matchingFileIds.length > 0 ? { file_ids: matchingFileIds } : undefined,
      });
      const replacementChunkId = pickBestReplacementChunkId(
        toSearchResultCandidates(searchResponse?.data?.results),
        citation
      );
      if (!replacementChunkId) {
        continue;
      }
      const detailResponse = await ragApi.getSourceDetail(
        replacementChunkId,
        projectId
      );
      return detailResponse?.data ?? null;
    }
    return null;
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

    toggleLibrarySelection: (libraryId: string) => {
      set((state) => ({
        selectedLibraryIds: state.selectedLibraryIds.includes(libraryId)
          ? state.selectedLibraryIds.filter((id) => id !== libraryId)
          : [...state.selectedLibraryIds, libraryId],
      }));
    },

    toggleArtifactSourceSelection: (sourceId: string) => {
      set((state) => ({
        selectedArtifactSourceIds: state.selectedArtifactSourceIds.includes(
          sourceId
        )
          ? state.selectedArtifactSourceIds.filter((id) => id !== sourceId)
          : [...state.selectedArtifactSourceIds, sourceId],
      }));
    },

    setSelectedLibraryIds: (libraryIds: string[]) => {
      set({
        selectedLibraryIds: Array.from(
          new Set(
            libraryIds
              .map((libraryId) => String(libraryId || "").trim())
              .filter((libraryId) => libraryId.length > 0)
          )
        ),
      });
    },

    setSelectedArtifactSourceIds: (sourceIds: string[]) => {
      set({
        selectedArtifactSourceIds: Array.from(
          new Set(
            sourceIds
              .map((sourceId) => String(sourceId || "").trim())
              .filter((sourceId) => sourceId.length > 0)
          )
        ),
      });
    },

    focusSourceByChunk: async (
      chunkId: string,
      projectId?: string | null,
      citation?: SourceFocusRequest | null
    ) => {
      try {
        const activeSourceDetail = get().activeSourceDetail;
        const cachedDetail = getCachedSourceDetail(chunkId);
        if (cachedDetail) {
          set((state) => ({
            activeSourceDetail: cachedDetail,
            activeSourceFocusNonce: state.activeSourceFocusNonce + 1,
          }));
          return;
        }
        if (activeSourceDetail?.chunk_id === chunkId) {
          set((state) => ({
            activeSourceFocusNonce: state.activeSourceFocusNonce + 1,
          }));
          return;
        }

        const currentProjectId = projectId ?? get().project?.id ?? undefined;
        let detail: SourceDetail | null = null;
        try {
          const response = await ragApi.getSourceDetail(
            chunkId,
            projectId ?? undefined
          );
          detail = response?.data ?? null;
        } catch (error) {
          if (
            currentProjectId &&
            citation &&
            isChunkMissingError(error)
          ) {
            detail = await resolveSourceDetailByCitation(citation, currentProjectId);
          } else {
            throw error;
          }
        }
        if (!detail) {
          throw new Error(`分块不存在: ${chunkId}`);
        }
        cacheSourceDetail(detail, [chunkId, citation?.chunkId]);
        set((state) => ({
          activeSourceDetail: detail,
          activeSourceFocusNonce: state.activeSourceFocusNonce + 1,
        }));

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
                let refreshedDetail: SourceDetail | null = null;
                try {
                  const refreshed = await ragApi.getSourceDetail(
                    chunkId,
                    currentProjectId
                  );
                  refreshedDetail = refreshed?.data ?? null;
                } catch (refreshError) {
                  if (currentProjectId) {
                    refreshedDetail = await resolveSourceDetailByCitation(
                      {
                        chunkId,
                        filename:
                          normalizeComparableText(detail?.source?.filename) ||
                          normalizeComparableText(detail?.file_info?.filename),
                        pageNumber:
                          typeof detail?.source?.page_number === "number"
                            ? detail.source.page_number
                            : undefined,
                        timestamp:
                          typeof detail?.source?.timestamp === "number"
                            ? detail.source.timestamp
                            : undefined,
                        contentPreview:
                          normalizeComparableText(detail?.content) || undefined,
                      },
                      currentProjectId
                    );
                  }
                  if (!refreshedDetail && !isChunkMissingError(refreshError)) {
                    throw refreshError;
                  }
                }
                if (!refreshedDetail) {
                  return;
                }
                cacheSourceDetail(refreshedDetail, [chunkId]);
                set((state) => {
                  const activeDetail = state.activeSourceDetail;
                  const expectedChunkId =
                    sourceChunkRedirects.get(chunkId) ?? chunkId;
                  if (
                    activeDetail?.chunk_id !== chunkId &&
                    activeDetail?.chunk_id !== expectedChunkId
                  ) {
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
