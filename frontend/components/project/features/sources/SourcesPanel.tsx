"use client";

import { useMemo } from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { AnimatePresence } from "framer-motion";
import { File } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectReference } from "../library/types";
import { WEB_SOURCE_CARD_ID } from "./constants";
import { FileItem } from "./components/FileItem";
import { ReferencedLibraryDetailPanel } from "./components/ReferencedLibraryDetailPanel";
import { SourcesHeader } from "./components/SourcesHeader";
import { WebSourceCard } from "./components/WebSourceCard";
import type { UploadedFile } from "./types";
import { useReferencedLibraryDetail } from "./useReferencedLibraryDetail";
import { useSourcesPanelController } from "./useSourcesPanelController";

interface ReferencedLibraryCardData {
  id: string;
  displayName: string;
  reference: ProjectReference;
  file: UploadedFile;
  statusText: string;
}

interface SourcesPanelProps {
  projectId: string;
  referencedLibraries?: ProjectReference[];
  isCollapsed?: boolean;
  onToggleCollapsed?: (action?: "collapse" | "expand" | "toggle") => void;
  isStudioExpanded?: boolean;
  isExpandedContentCollapsed?: boolean;
  onToggleExpandedContentCollapsed?: () => void;
}

export function SourcesPanel({
  projectId,
  referencedLibraries = [],
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
    toggleFileSelection,
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
        .sort((a, b) => {
          if (a.relation_type !== b.relation_type) {
            return a.relation_type === "base" ? -1 : 1;
          }
          return (a.priority ?? 999) - (b.priority ?? 999);
        }),
    [referencedLibraries]
  );
  const referencedLibraryCards = useMemo<ReferencedLibraryCardData[]>(
    () =>
      activeReferencedLibraries.map((reference) => {
        const relationLabel =
          reference.relation_type === "base" ? "主基底" : "辅助";
        const modeLabel =
          reference.mode === "follow" ? "跟随更新" : "固定版本";
        const statusText = `引用库 · ${relationLabel} · ${modeLabel}`;
        const displayName =
          reference.target_project_name?.trim() || reference.target_project_id;
        const syntheticFile: UploadedFile = {
          id: `reference-${reference.id}`,
          filename: `${reference.target_project_id}.library`,
          file_type: "pdf",
          file_size: 0,
          status: "ready",
          created_at: reference.created_at,
          updated_at: reference.updated_at,
        };
        return {
          id: reference.id,
          file: syntheticFile,
          displayName,
          reference,
          statusText,
        };
      }),
    [activeReferencedLibraries]
  );
  const shouldAnimateList = files.length + referencedLibraryCards.length <= 12;
  const hasAnyMaterialSources =
    files.length > 0 || referencedLibraryCards.length > 0;

  const {
    isOpen: isLibraryDetailOpen,
    loading: libraryDetailLoading,
    error: libraryDetailError,
    selectedLibrary: selectedLibraryCard,
    sessions: libraryDetailSessions,
    historyByTool: libraryDetailHistoryByTool,
    references: libraryDetailReferences,
    sourceFiles: libraryDetailFiles,
    openDetail: openLibraryDetailPanel,
    closeDetail: closeLibraryDetailPanel,
    refreshDetail: refreshLibraryDetail,
  } = useReferencedLibraryDetail();

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
          selectedCount={selectedFileIds.length}
          fileInputRef={fileInputRef}
          headerActionsRef={headerActionsRef}
          onToggleCollapsed={onToggleCollapsed}
          onToggleExpandedContentCollapsed={onToggleExpandedContentCollapsed}
          onFileSelect={handleFileSelect}
        />

        <CardContent className="h-[calc(100%-52px)] overflow-hidden p-0">
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
                              isSelected={false}
                              onToggle={() =>
                                openLibraryDetailPanel(referenceCard)
                              }
                              isCompact={true}
                              isFocused={false}
                              focusDetail={null}
                              isExpanded={false}
                              onCollapse={() => undefined}
                              displayName={referenceCard.displayName}
                              iconTypeOverride="library"
                              statusText={referenceCard.statusText}
                              hideDeleteAction={true}
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
                      <ScrollAreaPrimitive.ScrollAreaScrollbar className="relative flex-1 rounded-full bg-border" />
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
                        上传文件以开始使用
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
                              isSelected={false}
                              onToggle={() =>
                                openLibraryDetailPanel(referenceCard)
                              }
                              isCompact={isEffectiveCompact}
                              isFocused={false}
                              focusDetail={null}
                              isExpanded={false}
                              onCollapse={() => undefined}
                              displayName={referenceCard.displayName}
                              iconTypeOverride="library"
                              statusText={referenceCard.statusText}
                              hideDeleteAction={true}
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
                              isSelected={false}
                              onToggle={() =>
                                openLibraryDetailPanel(referenceCard)
                              }
                              isCompact={isEffectiveCompact}
                              isFocused={false}
                              focusDetail={null}
                              isExpanded={false}
                              onCollapse={() => undefined}
                              displayName={referenceCard.displayName}
                              iconTypeOverride="library"
                              statusText={referenceCard.statusText}
                              hideDeleteAction={true}
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
        onClose={closeLibraryDetailPanel}
        onRefresh={refreshLibraryDetail}
      />
    </div>
  );
}
