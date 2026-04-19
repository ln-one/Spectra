"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { AnimatePresence } from "framer-motion";
import { File } from "lucide-react";
import { projectSpaceApi, projectsApi, type ArtifactBackedSource } from "@/lib/sdk";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AddLibraryDialog,
  type SelectableLibrary,
} from "../library/AddLibraryDialog";
import type { ProjectReference } from "../library/types";
import { WEB_SOURCE_CARD_ID } from "./constants";
import { FileItem } from "./components/FileItem";
import { ReferencedLibraryDetailPanel } from "./components/ReferencedLibraryDetailPanel";
import { SourcesHeader } from "./components/SourcesHeader";
import { WebSourceCard } from "./components/WebSourceCard";
import type { UploadedFile } from "./types";
import { useReferencedLibraryDetail } from "./useReferencedLibraryDetail";
import { useSourcesPanelController } from "./useSourcesPanelController";
import { getReadableLibraryName } from "./utils";
import type { ReferencedLibraryCitationTarget } from "./useReferencedLibraryDetail";

interface ReferencedLibraryCardData {
  id: string;
  displayName: string;
  reference: ProjectReference;
  file: UploadedFile;
  statusText: string;
}

interface ArtifactSourceCardData {
  id: string;
  artifactId: string;
  toolType: string;
  title: string;
  surfaceKind?: string | null;
  source: ArtifactBackedSource;
  file: UploadedFile;
  statusText: string;
  sessionId?: string | null;
}

interface ReferencedLibrarySummary {
  filesCount?: number;
  lastActivity?: string | null;
}

function formatLibrarySummaryDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${month}-${day}`;
}

function buildLibraryStatusText(summary?: ReferencedLibrarySummary): string {
  if (!summary) {
    return "用于对话与生成检索";
  }

  const parts: string[] = [];
  if (typeof summary.filesCount === "number") {
    parts.push(`含 ${summary.filesCount} 份资料`);
  }

  const formattedDate = formatLibrarySummaryDate(summary.lastActivity);
  if (formattedDate) {
    parts.push(`更新于 ${formattedDate}`);
  }

  return parts.join(" · ") || "用于对话与生成检索";
}

function buildArtifactSourceStatusText(source: ArtifactBackedSource): string {
  const surfaceLabel =
    source.tool_type === "ppt"
      ? "课件成果"
      : source.tool_type === "word"
        ? "教学文档"
        : source.tool_type === "mindmap"
          ? "思维导图"
          : "已沉淀成果";
  const date = formatLibrarySummaryDate(source.updated_at ?? source.created_at);
  return date ? `${surfaceLabel} · 更新于 ${date}` : `${surfaceLabel} · 默认用于检索`;
}

function toArtifactSourceFileType(
  artifactType: string | null | undefined
): UploadedFile["file_type"] {
  if (artifactType === "pptx") {
    return "ppt";
  }
  if (artifactType === "docx") {
    return "word";
  }
  return "pdf";
}

interface SourcesPanelProps {
  projectId: string;
  referencedLibraries?: ProjectReference[];
  onReferencesChanged?: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: (action?: "collapse" | "expand" | "toggle") => void;
  isStudioExpanded?: boolean;
  isExpandedContentCollapsed?: boolean;
  onToggleExpandedContentCollapsed?: () => void;
}

export function SourcesPanel({
  projectId,
  referencedLibraries = [],
  onReferencesChanged,
  isCollapsed = false,
  onToggleCollapsed,
  isStudioExpanded = false,
  isExpandedContentCollapsed = false,
  onToggleExpandedContentCollapsed,
  ...props
}: SourcesPanelProps & React.HTMLAttributes<HTMLDivElement>) {
  const {
    files,
    selectedFileIds,
    selectedLibraryIds,
    selectedArtifactSourceIds,
    toggleFileSelection,
    toggleLibrarySelection,
    toggleArtifactSourceSelection,
    setSelectedArtifactSourceIds,
    focusedFileId,
    focusPayload,
    fileInputRef,
    containerRef,
    horizontalViewportRef,
    headerActionsRef,
    registerFileRef,
    expandedIds,
    uploadingTasksCount,
    isHorizontalIconMode,
    isEffectiveCompact,
    isHeaderCompact,
    handleFileSelect,
    handleDelete,
    collapseFile,
  } = useSourcesPanelController({
    projectId,
    isCollapsed,
    isStudioExpanded,
    isExpandedContentCollapsed,
  });
  const activeReferencedLibraries = useMemo(
    () =>
      [...referencedLibraries]
        .filter((reference) => reference.status === "active")
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)),
    [referencedLibraries]
  );
  const [librarySummaries, setLibrarySummaries] = useState<
    Record<string, ReferencedLibrarySummary>
  >({});
  const [artifactSources, setArtifactSources] = useState<ArtifactBackedSource[]>([]);
  const [artifactSourcesError, setArtifactSourcesError] = useState<string | null>(null);
  const [pendingArtifactSourceIds, setPendingArtifactSourceIds] = useState<
    Record<string, true>
  >({});
  const previousArtifactSourceIdsRef = useRef<string[]>([]);
  const referencedLibraryCards = useMemo<ReferencedLibraryCardData[]>(
    () =>
      activeReferencedLibraries.map((reference) => {
        const displayName = getReadableLibraryName(
          reference.targetProjectName,
          reference.targetProjectId ?? reference.id
        );
        const statusText = buildLibraryStatusText(
          reference.targetProjectId
            ? librarySummaries[reference.targetProjectId]
            : undefined
        );
        const syntheticFile: UploadedFile = {
          id: `reference-${reference.id}`,
          filename: `${displayName}.library`,
          file_type: "pdf",
          file_size: 0,
          status: "ready",
          created_at: reference.createdAt,
          updated_at: reference.updatedAt,
        };
        return {
          id: reference.id,
          file: syntheticFile,
          displayName,
          reference,
          statusText,
        };
      }),
    [activeReferencedLibraries, librarySummaries]
  );
  const artifactSourceCards = useMemo<ArtifactSourceCardData[]>(
    () =>
      artifactSources.map((source) => {
        const syntheticFile: UploadedFile = {
          id: source.id,
          filename:
            source.filename ||
            `${source.title || "artifact-source"}.${source.artifact_type || "json"}`,
          file_type: toArtifactSourceFileType(source.artifact_type),
          file_size: 0,
          status: "ready",
          created_at: source.created_at || source.updated_at || new Date().toISOString(),
          updated_at: source.updated_at || source.created_at || new Date().toISOString(),
        };
        return {
          id: source.id,
          artifactId: source.artifact_id,
          toolType: source.tool_type,
          title: source.title,
          surfaceKind: source.surface_kind,
          source,
          file: syntheticFile,
          statusText: buildArtifactSourceStatusText(source),
          sessionId: source.session_id ?? null,
        };
      }),
    [artifactSources]
  );
  const shouldAnimateList =
    files.length + referencedLibraryCards.length + artifactSourceCards.length <= 12;
  const hasAnyMaterialSources =
    files.length > 0 ||
    referencedLibraryCards.length > 0 ||
    artifactSourceCards.length > 0;
  const [isLibraryDialogOpen, setIsLibraryDialogOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryKeyword, setLibraryKeyword] = useState("");
  const [availableLibraries, setAvailableLibraries] = useState<
    SelectableLibrary[]
  >([]);
  const [deletingReferenceIds, setDeletingReferenceIds] = useState<
    Record<string, true>
  >({});

  const attachedLibraryIds = useMemo(
    () =>
      activeReferencedLibraries
        .map((reference) => reference.targetProjectId)
        .filter((targetProjectId): targetProjectId is string =>
          Boolean(targetProjectId)
        ),
    [activeReferencedLibraries]
  );
  const referencedLibraryCardsByProjectId = useMemo(
    () =>
      new Map(
        referencedLibraryCards
          .map((card) => {
            const targetProjectId = card.reference.targetProjectId;
            if (!targetProjectId) return null;
            return [targetProjectId, card] as const;
          })
          .filter(
            (
              entry
            ): entry is readonly [string, ReferencedLibraryCardData] =>
              entry !== null
          )
      ),
    [referencedLibraryCards]
  );

  useEffect(() => {
    if (activeReferencedLibraries.length === 0) {
      setLibrarySummaries({});
      return;
    }

    let cancelled = false;
    const targetProjectIds = activeReferencedLibraries
      .map((reference) => reference.targetProjectId)
      .filter((targetProjectId): targetProjectId is string =>
        Boolean(targetProjectId)
      );

    void Promise.all(
      targetProjectIds.map(async (targetProjectId) => {
        try {
          const response = await projectsApi.getProjectStatistics(targetProjectId);
          return [
            targetProjectId,
            {
              filesCount: response?.data?.files_count,
              lastActivity: response?.data?.last_activity ?? null,
            },
          ] as const;
        } catch {
          return [targetProjectId, {}] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setLibrarySummaries(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [activeReferencedLibraries]);

  const loadArtifactSources = useCallback(async () => {
    try {
      setArtifactSourcesError(null);
      const response = await projectsApi.getArtifactSources(projectId);
      const nextSources = Array.isArray(response?.data?.sources)
        ? response.data.sources
        : [];
      setArtifactSources(nextSources);
    } catch (error) {
      setArtifactSourcesError(
        error instanceof Error ? error.message : "获取沉淀来源失败"
      );
    }
  }, [projectId]);

  useEffect(() => {
    void loadArtifactSources();
  }, [loadArtifactSources]);

  useEffect(() => {
    if (artifactSources.length === 0) {
      previousArtifactSourceIdsRef.current = [];
      return;
    }
    const ids = artifactSources
      .map((source) => source.id)
      .filter((sourceId): sourceId is string => Boolean(sourceId));
    if (!ids.length) {
      previousArtifactSourceIdsRef.current = [];
      return;
    }
    const previousIds = new Set(previousArtifactSourceIdsRef.current);
    const nextIds = ids.filter((id) => !previousIds.has(id));
    previousArtifactSourceIdsRef.current = ids;
    if (!nextIds.length) return;
    setSelectedArtifactSourceIds(
      Array.from(new Set([...selectedArtifactSourceIds, ...nextIds]))
    );
  }, [artifactSources, selectedArtifactSourceIds, setSelectedArtifactSourceIds]);

  const normalizeLibrary = useCallback(
    (raw: unknown): SelectableLibrary | null => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const project = raw as Record<string, unknown>;
      const id = typeof project.id === "string" ? project.id : "";
      if (!id) return null;
      const name =
        typeof project.name === "string" && project.name.trim()
          ? project.name
          : id;
      const description =
        typeof project.description === "string" ? project.description : "";
      const visibilityRaw = project.visibility;
      const visibility =
        visibilityRaw === "shared" || visibilityRaw === "private"
          ? visibilityRaw
          : "unknown";
      const isReferenceableRaw =
        project.is_referenceable ?? project.isReferenceable;
      return {
        id,
        name,
        description,
        visibility,
        isReferenceable: isReferenceableRaw === true,
      };
    },
    []
  );

  const loadAvailableLibraries = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const response = await projectsApi.getProjects({ page: 1, limit: 100 });
      const projects = Array.isArray(response?.data?.projects)
        ? response.data.projects
        : [];
      setAvailableLibraries(
        projects
          .map((item) => normalizeLibrary(item))
          .filter((item): item is SelectableLibrary => item !== null)
          .filter((item) => item.id !== projectId)
      );
    } catch (error) {
      setLibraryError(
        error instanceof Error ? error.message : "获取资料库列表失败"
      );
    } finally {
      setLibraryLoading(false);
    }
  }, [normalizeLibrary, projectId]);

  useEffect(() => {
    if (!isLibraryDialogOpen) return;
    void loadAvailableLibraries();
  }, [isLibraryDialogOpen, loadAvailableLibraries]);

  const visibleLibraries = useMemo(() => {
    const keyword = libraryKeyword.trim().toLowerCase();
    if (!keyword) return availableLibraries;
    return availableLibraries.filter((library) =>
      `${library.name} ${library.id} ${library.description}`
        .toLowerCase()
        .includes(keyword)
    );
  }, [availableLibraries, libraryKeyword]);

  const handleImportLibrary = useCallback(async (libraryId: string) => {
    try {
      setLibraryError(null);
      await projectSpaceApi.createReference(projectId, {
        target_project_id: libraryId,
        relation_type: "auxiliary",
        mode: "follow",
      });
      setIsLibraryDialogOpen(false);
      onReferencesChanged?.();
    } catch (error) {
      setLibraryError(
        error instanceof Error ? error.message : "导入资料库失败"
      );
    }
  }, [onReferencesChanged, projectId]);

  const handleDeleteLibrary = useCallback(
    async (referenceId: string) => {
      try {
        setDeletingReferenceIds((prev) => ({ ...prev, [referenceId]: true }));
        await projectSpaceApi.deleteReference(projectId, referenceId);
        onReferencesChanged?.();
      } catch (error) {
        setLibraryError(
          error instanceof Error ? error.message : "移除资料库失败"
        );
      } finally {
        setDeletingReferenceIds((prev) => {
          const next = { ...prev };
          delete next[referenceId];
          return next;
        });
      }
    },
    [onReferencesChanged, projectId]
  );

  const handleCreateArtifactSource = useCallback(
    async ({
      artifactId,
      surfaceKind,
    }: {
      artifactId: string;
      surfaceKind?: string | null;
    }) => {
      try {
        setPendingArtifactSourceIds((prev) => ({ ...prev, [artifactId]: true }));
        setArtifactSourcesError(null);
        const response = await projectsApi.createArtifactSource(projectId, {
          artifact_id: artifactId,
          surface_kind: surfaceKind ?? undefined,
        });
        const nextSource = response?.data?.source ?? null;
        if (nextSource?.id) {
          setArtifactSources((prev) => {
            const existing = prev.filter((item) => item.id !== nextSource.id);
            return [nextSource, ...existing];
          });
          window.dispatchEvent(
            new CustomEvent("spectra:artifact-source-added", {
              detail: { artifactId },
            })
          );
          setSelectedArtifactSourceIds(
            Array.from(
              new Set([...selectedArtifactSourceIds, String(nextSource.id)])
            )
          );
        } else {
          await loadArtifactSources();
        }
      } catch (error) {
        setArtifactSourcesError(
          error instanceof Error ? error.message : "加入项目来源失败"
        );
      } finally {
        setPendingArtifactSourceIds((prev) => {
          const next = { ...prev };
          delete next[artifactId];
          return next;
        });
      }
    },
    [
      loadArtifactSources,
      projectId,
      selectedArtifactSourceIds,
      setSelectedArtifactSourceIds,
    ]
  );

  const handleDeleteArtifactSource = useCallback(
    async (sourceId: string) => {
      try {
        setPendingArtifactSourceIds((prev) => ({ ...prev, [sourceId]: true }));
        setArtifactSourcesError(null);
        await projectsApi.deleteArtifactSource(projectId, sourceId);
        setArtifactSources((prev) => prev.filter((item) => item.id !== sourceId));
        window.dispatchEvent(
          new CustomEvent("spectra:artifact-source-removed", {
            detail: { sourceId },
          })
        );
        setSelectedArtifactSourceIds(
          selectedArtifactSourceIds.filter((id) => id !== sourceId)
        );
      } catch (error) {
        setArtifactSourcesError(
          error instanceof Error ? error.message : "移出项目来源失败"
        );
      } finally {
        setPendingArtifactSourceIds((prev) => {
          const next = { ...prev };
          delete next[sourceId];
          return next;
        });
      }
    },
    [projectId, selectedArtifactSourceIds, setSelectedArtifactSourceIds]
  );

  const handleOpenArtifactSource = useCallback((card: ArtifactSourceCardData) => {
    window.dispatchEvent(
      new CustomEvent("spectra:open-history-item", {
        detail: {
          id: `artifact:${card.artifactId}`,
          origin: "artifact",
          toolType: card.toolType,
          title: card.title,
          status: "completed",
          createdAt: card.source.updated_at || card.source.created_at || new Date().toISOString(),
          sessionId: card.sessionId ?? null,
          step: "preview",
          artifactId: card.artifactId,
        },
      })
    );
  }, []);

  const {
    isOpen: isLibraryDetailOpen,
    loading: libraryDetailLoading,
    error: libraryDetailError,
    selectedLibrary: selectedLibraryCard,
    citationTarget: selectedLibraryCitationTarget,
    sessions: libraryDetailSessions,
    historyByTool: libraryDetailHistoryByTool,
    references: libraryDetailReferences,
    sourceFiles: libraryDetailFiles,
    openDetail: openLibraryDetail,
    closeDetail: closeLibraryDetailPanel,
    refreshDetail: refreshLibraryDetail,
  } = useReferencedLibraryDetail();

  useEffect(() => {
    const handleOpenLibraryCitation = (event: Event) => {
      const detail = (event as CustomEvent<ReferencedLibraryCitationTarget>).detail;
      const sourceLibraryId = String(detail?.sourceLibraryId || "").trim();
      if (!sourceLibraryId) return;
      const targetCard = referencedLibraryCardsByProjectId.get(sourceLibraryId);
      if (!targetCard) return;
      openLibraryDetail(
        {
          displayName: targetCard.displayName,
          reference: targetCard.reference,
        },
        detail
      );
    };

    window.addEventListener(
      "spectra:open-library-citation",
      handleOpenLibraryCitation as EventListener
    );
    return () => {
      window.removeEventListener(
        "spectra:open-library-citation",
        handleOpenLibraryCitation as EventListener
      );
    };
  }, [openLibraryDetail, referencedLibraryCardsByProjectId]);

  useEffect(() => {
    const handleAddArtifactSource = (
      event: Event
    ) => {
      const detail = (
        event as CustomEvent<{ artifactId?: string; surfaceKind?: string | null }>
      ).detail;
      const artifactId = String(detail?.artifactId || "").trim();
      if (!artifactId) return;
      void handleCreateArtifactSource({
        artifactId,
        surfaceKind: detail?.surfaceKind ?? null,
      });
    };

    window.addEventListener(
      "spectra:add-artifact-source",
      handleAddArtifactSource as EventListener
    );
    return () => {
      window.removeEventListener(
        "spectra:add-artifact-source",
        handleAddArtifactSource as EventListener
      );
    };
  }, [handleCreateArtifactSource]);

  return (
    <div
      ref={containerRef}
      className="project-panel-root h-full w-full bg-transparent"
      style={{ transform: "translateZ(0)" }}
      {...props}
    >
      <Card className="project-panel-card project-sources-panel h-full rounded-2xl border border-[var(--project-border)] bg-[var(--project-surface)] text-[var(--project-text-primary)] shadow-lg backdrop-blur-xl will-change-[box-shadow,transform]">
        <SourcesHeader
          isCollapsed={isCollapsed}
          isHeaderCompact={isHeaderCompact}
          isStudioExpanded={isStudioExpanded}
          isExpandedContentCollapsed={isExpandedContentCollapsed}
          uploadingTasksCount={uploadingTasksCount}
          fileCount={files.length}
          libraryCount={referencedLibraryCards.length}
          artifactSourceCount={artifactSourceCards.length}
          selectedCount={
            selectedFileIds.length +
            selectedLibraryIds.length +
            selectedArtifactSourceIds.length
          }
          fileInputRef={fileInputRef}
          headerActionsRef={headerActionsRef}
          onToggleCollapsed={onToggleCollapsed}
          onToggleExpandedContentCollapsed={onToggleExpandedContentCollapsed}
          onFileSelect={handleFileSelect}
          onImportLibrary={() => setIsLibraryDialogOpen(true)}
        />

        <CardContent className="h-[calc(100%-52px)] overflow-hidden p-0">
          {artifactSourcesError ? (
            <div className="px-3 pt-2 text-[11px] text-red-500">
              {artifactSourcesError}
            </div>
          ) : null}
          {isHorizontalIconMode ? (
            <div className="h-full overflow-hidden px-3 py-1">
              {!hasAnyMaterialSources ? (
                <div className="flex h-full flex-col">
                  <div className="pb-2 pt-1">
                    <WebSourceCard isCompact={true} />
                  </div>
                  <div className="project-sources-empty-state flex flex-1 flex-col items-center justify-center py-12 text-center">
                    <div className="project-sources-empty-icon mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--project-surface-muted)] shadow-inner">
                      <File className="h-7 w-7 text-[var(--project-text-muted)] opacity-50" />
                    </div>
                    <p className="text-sm font-medium text-[var(--project-text-primary)]">
                      暂无文件
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-start">
                  <ScrollAreaPrimitive.Root className="relative h-full w-full overflow-hidden">
                    <ScrollAreaPrimitive.Viewport
                      ref={horizontalViewportRef}
                      className="project-sources-horizontal-viewport h-[calc(100%-10px)] w-full rounded-[inherit]"
                      onWheel={(event) => {
                        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                          event.preventDefault();
                          horizontalViewportRef.current?.scrollBy({
                            left: event.deltaY * 0.55,
                            behavior: "smooth",
                          });
                        }
                      }}
                    >
                      <div className="project-sources-horizontal-track flex min-w-max items-center gap-3 px-0.5 py-1">
                        <div
                          key={WEB_SOURCE_CARD_ID}
                          ref={(element) =>
                            registerFileRef(WEB_SOURCE_CARD_ID, element)
                          }
                          className="shrink-0"
                        >
                          <WebSourceCard isCompact={true} />
                        </div>
                        {referencedLibraryCards.map((referenceCard) => (
                          <div
                            key={referenceCard.id}
                            ref={(element) =>
                              registerFileRef(
                                `ref-${referenceCard.id}`,
                                element
                              )
                            }
                            className="shrink-0"
                          >
                            <FileItem
                              file={referenceCard.file}
                              isSelected={selectedLibraryIds.includes(
                                referenceCard.reference.targetProjectId
                              )}
                              onToggle={() =>
                                toggleLibrarySelection(
                                  referenceCard.reference.targetProjectId
                                )
                              }
                              isCompact={true}
                              isFocused={false}
                              focusDetail={null}
                              isExpanded={false}
                              onCollapse={() => undefined}
                              onDelete={() =>
                                void handleDeleteLibrary(referenceCard.reference.id)
                              }
                              displayName={referenceCard.displayName}
                              iconTypeOverride="library"
                              statusText={
                                deletingReferenceIds[referenceCard.reference.id]
                                  ? "移除中"
                                  : referenceCard.statusText
                              }
                              hideDeleteAction={
                                deletingReferenceIds[referenceCard.reference.id]
                              }
                            />
                          </div>
                        ))}
                        {artifactSourceCards.map((sourceCard) => (
                          <div
                            key={sourceCard.id}
                            ref={(element) =>
                              registerFileRef(`artifact-source-${sourceCard.id}`, element)
                            }
                            className="shrink-0"
                          >
                            <FileItem
                              file={sourceCard.file}
                              isSelected={selectedArtifactSourceIds.includes(
                                sourceCard.id
                              )}
                              onToggle={() =>
                                toggleArtifactSourceSelection(sourceCard.id)
                              }
                              onOpen={() => handleOpenArtifactSource(sourceCard)}
                              isCompact={true}
                              isFocused={false}
                              focusDetail={null}
                              isExpanded={false}
                              onCollapse={() => undefined}
                              onDelete={() =>
                                void handleDeleteArtifactSource(sourceCard.id)
                              }
                              displayName={sourceCard.title}
                              iconTypeOverride="artifact"
                              statusText={
                                pendingArtifactSourceIds[sourceCard.id]
                                  ? "处理中"
                                  : sourceCard.statusText
                              }
                              hideDeleteAction={
                                pendingArtifactSourceIds[sourceCard.id]
                              }
                            />
                          </div>
                        ))}
                        {files.map((file) => (
                          <div
                            key={file.id}
                            ref={(element) => registerFileRef(file.id, element)}
                            className="shrink-0"
                          >
                            <FileItem
                              file={file}
                              isSelected={selectedFileIds.includes(file.id)}
                              onToggle={() => toggleFileSelection(file.id)}
                              onDelete={() => handleDelete(file.id)}
                              isCompact={true}
                              isFocused={focusedFileId === file.id}
                              focusDetail={
                                focusedFileId === file.id ? focusPayload : null
                              }
                              isExpanded={false}
                              onCollapse={() => collapseFile(file.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </ScrollAreaPrimitive.Viewport>
                    <ScrollAreaPrimitive.ScrollAreaScrollbar
                      orientation="horizontal"
                      className="flex h-2.5 touch-none select-none flex-col border-t border-t-transparent p-[1px] transition-colors"
                    >
                      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
                    </ScrollAreaPrimitive.ScrollAreaScrollbar>
                    <ScrollAreaPrimitive.Corner />
                  </ScrollAreaPrimitive.Root>
                </div>
              )}
            </div>
          ) : (
            <ScrollArea className="h-full w-full">
              <div className="min-h-full w-full max-w-full overflow-hidden px-3 py-3">
                {!hasAnyMaterialSources ? (
                  <div className="flex h-full flex-col">
                    <div className="mb-2">
                      <WebSourceCard isCompact={isEffectiveCompact} />
                    </div>
                    <div className="project-sources-empty-state flex flex-1 flex-col items-center justify-center py-12 text-center">
                      <div className="project-sources-empty-icon mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--project-surface-muted)] shadow-inner">
                        <File className="h-7 w-7 text-[var(--project-text-muted)] opacity-50" />
                      </div>
                      <p className="text-sm font-medium text-[var(--project-text-primary)]">
                        暂无文件
                      </p>
                      <p className="mt-1 text-xs text-[var(--project-text-muted)]">
                        导入资料以开始使用
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-2 w-full max-w-full",
                      isEffectiveCompact && "flex flex-col gap-2"
                    )}
                  >
                    {shouldAnimateList ? (
                      <AnimatePresence mode="popLayout">
                        <div
                          key={WEB_SOURCE_CARD_ID}
                          ref={(element) =>
                            registerFileRef(WEB_SOURCE_CARD_ID, element)
                          }
                        >
                          <WebSourceCard isCompact={isEffectiveCompact} />
                        </div>
                        {referencedLibraryCards.map((referenceCard) => (
                          <div
                            key={referenceCard.id}
                            ref={(element) =>
                              registerFileRef(
                                `ref-${referenceCard.id}`,
                                element
                              )
                            }
                          >
                            <FileItem
                              file={referenceCard.file}
                              isSelected={selectedLibraryIds.includes(
                                referenceCard.reference.targetProjectId
                              )}
                              onToggle={() =>
                                toggleLibrarySelection(
                                  referenceCard.reference.targetProjectId
                                )
                              }
                              isCompact={isEffectiveCompact}
                              isFocused={false}
                              focusDetail={null}
                              isExpanded={false}
                              onCollapse={() => undefined}
                              onDelete={() =>
                                void handleDeleteLibrary(referenceCard.reference.id)
                              }
                              displayName={referenceCard.displayName}
                              iconTypeOverride="library"
                              statusText={
                                deletingReferenceIds[referenceCard.reference.id]
                                  ? "移除中"
                                  : referenceCard.statusText
                              }
                              hideDeleteAction={
                                deletingReferenceIds[referenceCard.reference.id]
                              }
                            />
                          </div>
                        ))}
                        {artifactSourceCards.map((sourceCard) => (
                          <div
                            key={sourceCard.id}
                            ref={(element) =>
                              registerFileRef(`artifact-source-${sourceCard.id}`, element)
                            }
                          >
                            <FileItem
                              file={sourceCard.file}
                              isSelected={selectedArtifactSourceIds.includes(
                                sourceCard.id
                              )}
                              onToggle={() =>
                                toggleArtifactSourceSelection(sourceCard.id)
                              }
                              onOpen={() => handleOpenArtifactSource(sourceCard)}
                              isCompact={isEffectiveCompact}
                              isFocused={false}
                              focusDetail={null}
                              isExpanded={false}
                              onCollapse={() => undefined}
                              onDelete={() =>
                                void handleDeleteArtifactSource(sourceCard.id)
                              }
                              displayName={sourceCard.title}
                              iconTypeOverride="artifact"
                              statusText={
                                pendingArtifactSourceIds[sourceCard.id]
                                  ? "处理中"
                                  : sourceCard.statusText
                              }
                              hideDeleteAction={
                                pendingArtifactSourceIds[sourceCard.id]
                              }
                            />
                          </div>
                        ))}
                        {files.map((file) => (
                          <div
                            key={file.id}
                            ref={(element) => registerFileRef(file.id, element)}
                          >
                            <FileItem
                              file={file}
                              isSelected={selectedFileIds.includes(file.id)}
                              onToggle={() => toggleFileSelection(file.id)}
                              onDelete={() => handleDelete(file.id)}
                              isCompact={isEffectiveCompact}
                              isFocused={focusedFileId === file.id}
                              focusDetail={
                                focusedFileId === file.id ? focusPayload : null
                              }
                              isExpanded={!!expandedIds[file.id]}
                              onCollapse={() => collapseFile(file.id)}
                            />
                          </div>
                        ))}
                      </AnimatePresence>
                    ) : (
                      <>
                        <div
                          key={WEB_SOURCE_CARD_ID}
                          ref={(element) =>
                            registerFileRef(WEB_SOURCE_CARD_ID, element)
                          }
                        >
                          <WebSourceCard isCompact={isEffectiveCompact} />
                        </div>
                        {referencedLibraryCards.map((referenceCard) => (
                          <div
                            key={referenceCard.id}
                            ref={(element) =>
                              registerFileRef(
                                `ref-${referenceCard.id}`,
                                element
                              )
                            }
                          >
                            <FileItem
                              file={referenceCard.file}
                              isSelected={selectedLibraryIds.includes(
                                referenceCard.reference.targetProjectId
                              )}
                              onToggle={() =>
                                toggleLibrarySelection(
                                  referenceCard.reference.targetProjectId
                                )
                              }
                              isCompact={isEffectiveCompact}
                              isFocused={false}
                              focusDetail={null}
                              isExpanded={false}
                              onCollapse={() => undefined}
                              onDelete={() =>
                                void handleDeleteLibrary(referenceCard.reference.id)
                              }
                              displayName={referenceCard.displayName}
                              iconTypeOverride="library"
                              statusText={
                                deletingReferenceIds[referenceCard.reference.id]
                                  ? "移除中"
                                  : referenceCard.statusText
                              }
                              hideDeleteAction={
                                deletingReferenceIds[referenceCard.reference.id]
                              }
                            />
                          </div>
                        ))}
                        {artifactSourceCards.map((sourceCard) => (
                          <div
                            key={sourceCard.id}
                            ref={(element) =>
                              registerFileRef(`artifact-source-${sourceCard.id}`, element)
                            }
                          >
                            <FileItem
                              file={sourceCard.file}
                              isSelected={selectedArtifactSourceIds.includes(
                                sourceCard.id
                              )}
                              onToggle={() =>
                                toggleArtifactSourceSelection(sourceCard.id)
                              }
                              onOpen={() => handleOpenArtifactSource(sourceCard)}
                              isCompact={isEffectiveCompact}
                              isFocused={false}
                              focusDetail={null}
                              isExpanded={false}
                              onCollapse={() => undefined}
                              onDelete={() =>
                                void handleDeleteArtifactSource(sourceCard.id)
                              }
                              displayName={sourceCard.title}
                              iconTypeOverride="artifact"
                              statusText={
                                pendingArtifactSourceIds[sourceCard.id]
                                  ? "处理中"
                                  : sourceCard.statusText
                              }
                              hideDeleteAction={
                                pendingArtifactSourceIds[sourceCard.id]
                              }
                            />
                          </div>
                        ))}
                        {files.map((file) => (
                          <div
                            key={file.id}
                            ref={(element) => registerFileRef(file.id, element)}
                          >
                            <FileItem
                              file={file}
                              isSelected={selectedFileIds.includes(file.id)}
                              onToggle={() => toggleFileSelection(file.id)}
                              onDelete={() => handleDelete(file.id)}
                              isCompact={isEffectiveCompact}
                              isFocused={focusedFileId === file.id}
                              focusDetail={
                                focusedFileId === file.id ? focusPayload : null
                              }
                              isExpanded={!!expandedIds[file.id]}
                              onCollapse={() => collapseFile(file.id)}
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
      <ReferencedLibraryDetailPanel
        open={isLibraryDetailOpen}
        loading={libraryDetailLoading}
        error={libraryDetailError}
        libraryDisplayName={selectedLibraryCard?.displayName ?? "未命名库"}
        reference={selectedLibraryCard?.reference ?? null}
        sessions={libraryDetailSessions}
        historyByTool={libraryDetailHistoryByTool}
        references={libraryDetailReferences}
        sourceFiles={libraryDetailFiles}
        citationTarget={selectedLibraryCitationTarget}
        onClose={closeLibraryDetailPanel}
        onRefresh={refreshLibraryDetail}
      />
      <AddLibraryDialog
        open={isLibraryDialogOpen}
        onOpenChange={setIsLibraryDialogOpen}
        loading={libraryLoading}
        error={libraryError}
        libraries={visibleLibraries}
        keyword={libraryKeyword}
        onKeywordChange={setLibraryKeyword}
        selectedLibraryId={null}
        attachedLibraryIds={attachedLibraryIds}
        onSelectLibrary={(libraryId) => {
          void handleImportLibrary(libraryId);
        }}
        onReload={() => {
          void loadAvailableLibraries();
        }}
      />
    </div>
  );
}
