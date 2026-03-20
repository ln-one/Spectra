"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import {
  ChevronsDown,
  ChevronsUp,
  File,
  PanelRightClose,
  PanelRightOpen,
  Upload,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  COMPACT_MODE_WIDTH,
  HEADER_COMPACT_HYSTERESIS,
  HEADER_FORCE_NORMAL_WIDTH,
  HEADER_MIN_VISIBLE_WIDTH,
  WEB_SOURCE_CARD_ID,
} from "./constants";
import { FileItem } from "./components/FileItem";
import { WebSourceCard } from "./components/WebSourceCard";
import { getUploadErrorMessage, normalizeUploadingProgress } from "./utils";
import type { SourceFocusDetail } from "./types";

interface SourcesPanelProps {
  projectId: string;
  isCollapsed?: boolean;
  onToggleCollapsed?: (action?: "collapse" | "expand" | "toggle") => void;
  isStudioExpanded?: boolean;
  isExpandedContentCollapsed?: boolean;
  onToggleExpandedContentCollapsed?: () => void;
}

export function SourcesPanel({
  projectId,
  isCollapsed = false,
  onToggleCollapsed,
  isStudioExpanded = false,
  isExpandedContentCollapsed = false,
  onToggleExpandedContentCollapsed,
}: SourcesPanelProps) {
  const {
    files,
    selectedFileIds,
    uploadFile,
    deleteFile,
    toggleFileSelection,
    activeSourceDetail,
    clearActiveSource,
  } = useProjectStore();
  const { addNotification, updateNotification, replaceNotification } =
    useNotificationStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalViewportRef = useRef<HTMLDivElement>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [isCompact, setIsCompact] = useState(false);
  const [isHeaderTight, setIsHeaderTight] = useState(false);
  const [uploadingTasksCount, setUploadingTasksCount] = useState(0);
  useEffect(() => {
    const checkWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        const nextCompact = width < COMPACT_MODE_WIDTH;
        setIsCompact(nextCompact);

        if (nextCompact) {
          setIsHeaderTight(true);
          return;
        }

        if (width >= HEADER_FORCE_NORMAL_WIDTH) {
          setIsHeaderTight(false);
          return;
        }

        if (headerActionsRef.current) {
          const horizontalPadding = 32;
          const gap = 8;
          const availableInfoWidth =
            width -
            horizontalPadding -
            headerActionsRef.current.offsetWidth -
            gap;

          setIsHeaderTight((prev) => {
            if (prev) {
              return (
                availableInfoWidth <
                HEADER_MIN_VISIBLE_WIDTH + HEADER_COMPACT_HYSTERESIS
              );
            }
            return availableInfoWidth < HEADER_MIN_VISIBLE_WIDTH;
          });
          return;
        }

        setIsHeaderTight(true);
      }
    };

    checkWidth();
    window.addEventListener("resize", checkWidth);

    const resizeObserver = new ResizeObserver(checkWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", checkWidth);
      resizeObserver.disconnect();
    };
  }, [files.length, selectedFileIds.length, uploadingTasksCount]);

  const focusedFileId = activeSourceDetail?.file_info?.id;
  const focusPayload = useMemo<SourceFocusDetail | null>(() => {
    if (!activeSourceDetail) return null;
    return {
      chunk_id: activeSourceDetail.chunk_id,
      content: activeSourceDetail.content,
      source: activeSourceDetail.source,
      context: activeSourceDetail.context,
    };
  }, [activeSourceDetail]);

  useEffect(() => {
    if (focusedFileId && fileRefs.current[focusedFileId]) {
      fileRefs.current[focusedFileId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [focusedFileId, activeSourceDetail?.chunk_id]);

  useEffect(() => {
    const targetId = activeSourceDetail?.file_info?.id;
    if (!targetId) return;

    const frame = requestAnimationFrame(() => {
      setExpandedIds((prev) => ({ ...prev, [targetId]: true }));
    });

    return () => cancelAnimationFrame(frame);
  }, [activeSourceDetail?.file_info?.id, activeSourceDetail?.chunk_id]);

  const collapseFile = useCallback(
    (fileId: string) => {
      setExpandedIds((prev) => ({ ...prev, [fileId]: false }));
      if (focusedFileId === fileId) {
        clearActiveSource();
      }
    },
    [focusedFileId, clearActiveSource]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      const selectedFiles = Array.from(fileList);

      selectedFiles.forEach((file) => {
        setUploadingTasksCount((count) => count + 1);
        const notificationId = addNotification({
          type: "upload",
          title: file.name,
          description: "上传中",
          duration: 0,
          progress: 5,
          status: "uploading",
          meta: {
            fileName: file.name,
          },
        });

        void uploadFile(file, projectId, {
          onProgress: (progress) => {
            const displayProgress = normalizeUploadingProgress(progress);
            updateNotification(notificationId, {
              progress: displayProgress,
              status: displayProgress >= 95 ? "parsing" : "uploading",
              description: displayProgress >= 95 ? "处理中" : "上传中",
              duration: 0,
            });
          },
        })
          .then((uploadedFile) => {
            replaceNotification(notificationId, {
              type: "upload",
              title: file.name,
              description: "解析中",
              duration: 0,
              progress: 95,
              status: "parsing",
              meta: {
                fileName: file.name,
                fileId: uploadedFile?.id,
              },
            });

            window.setTimeout(() => {
              replaceNotification(notificationId, {
                type: "success",
                title: file.name,
                description: "涓婁紶鎴愬姛",
                duration: 3000,
                progress: 100,
                status: "success",
                meta: {
                  fileName: file.name,
                  fileId: uploadedFile?.id,
                },
              });
            }, 450);
          })
          .catch((error) => {
            replaceNotification(notificationId, {
              type: "error",
              title: file.name,
              description: getUploadErrorMessage(error),
              duration: 6000,
              progress: 95,
              status: "failed",
              meta: {
                fileName: file.name,
              },
            });
          })
          .finally(() => {
            setUploadingTasksCount((count) => Math.max(0, count - 1));
          });
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [
      addNotification,
      projectId,
      replaceNotification,
      updateNotification,
      uploadFile,
    ]
  );

  const handleDelete = useCallback(
    async (fileId: string) => {
      await deleteFile(fileId);
    },
    [deleteFile]
  );

  const isHorizontalIconMode = isStudioExpanded && isExpandedContentCollapsed;
  const isEffectiveCompact = isCompact || isCollapsed || isHorizontalIconMode;
  const isHeaderCompact = isStudioExpanded
    ? isCompact || isCollapsed || isHeaderTight
    : isCollapsed;

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-transparent"
      style={{ transform: "translateZ(0)" }}
    >
      <Card className="h-full rounded-2xl shadow-lg border border-white/60 bg-white/95 backdrop-blur-xl will-change-[box-shadow,transform]">
        <CardHeader
          className="flex flex-row items-center justify-between px-4 space-y-0 py-0 shrink-0"
          style={{ height: "52px" }}
        >
          {isCollapsed ? (
            <div className="w-full flex items-center justify-between">
              <Button
                size="icon"
                variant="ghost"
                aria-label="灞曞紑 Sources 闈㈡澘"
                className="h-7 w-7 rounded-full text-zinc-500 hover:text-zinc-700 hover:bg-transparent"
                onClick={() => onToggleCollapsed?.("expand")}
              >
                <PanelRightOpen className="w-3.5 h-3.5" />
              </Button>

              <label className="relative shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.mov,.avi,.mp3,.wav,.jpg,.png"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  size="sm"
                  aria-label="涓婁紶"
                  className={cn(
                    "w-7 h-7 px-0 rounded-full transition-all",
                    "bg-zinc-900 hover:bg-zinc-800 shadow-sm hover:shadow-md"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3 h-3" />
                </Button>
              </label>
            </div>
          ) : (
            <>
              {!isHeaderCompact ? (
                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <CardTitle className="text-sm font-semibold leading-tight">
                    Sources
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500 leading-tight truncate">
                    {`${files.length} 个文件 · ${selectedFileIds.length} 已选${
                      uploadingTasksCount > 0
                        ? ` · 上传中 ${uploadingTasksCount} 个`
                        : ""
                    }`}
                  </CardDescription>
                </div>
              ) : (
                <div className="flex-1" />
              )}

              <div
                ref={headerActionsRef}
                className={cn(
                  "flex items-center gap-1.5 shrink-0",
                  isHeaderCompact ? "ml-0" : "ml-2"
                )}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={
                    isStudioExpanded
                      ? isExpandedContentCollapsed
                        ? "鍚戜笅灞曞紑 Sources 鍐呭"
                        : "鍚戜笂鏀惰捣 Sources 鍐呭"
                      : "鏀惰捣 Sources 闈㈡澘"
                  }
                  className="h-7 w-7 rounded-full px-0 text-zinc-500 hover:text-zinc-700 hover:bg-transparent"
                  onClick={() => {
                    if (isStudioExpanded) {
                      onToggleExpandedContentCollapsed?.();
                      return;
                    }
                    onToggleCollapsed?.("collapse");
                  }}
                >
                  {isStudioExpanded ? (
                    isExpandedContentCollapsed ? (
                      <ChevronsDown className="w-3 h-3" />
                    ) : (
                      <ChevronsUp className="w-3 h-3" />
                    )
                  ) : (
                    <PanelRightClose className="w-3 h-3" />
                  )}
                </Button>

                <label className="relative shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.mov,.avi,.mp3,.wav,.jpg,.png"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    aria-label="涓婁紶"
                    className={cn(
                      "gap-1.5 rounded-full text-[11px] h-7 transition-all",
                      isHeaderCompact && "w-7 px-0 justify-center",
                      "bg-zinc-900 hover:bg-zinc-800 shadow-sm hover:shadow-md"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3 h-3" />
                    {!isHeaderCompact && "涓婁紶"}
                  </Button>
                </label>
              </div>
            </>
          )}
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-52px)] overflow-hidden">
          {isHorizontalIconMode ? (
            <div className="h-full px-3 py-1 overflow-hidden">
              {files.length === 0 ? (
                <div className="h-full flex flex-col">
                  <div className="pt-1 pb-2">
                    <WebSourceCard isCompact={true} />
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center mb-4 shadow-inner">
                      <File className="w-7 h-7 text-zinc-300" />
                    </div>
                    <p className="text-sm font-medium text-zinc-700">
                      {"\u6682\u65e0\u6587\u4ef6"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-start">
                  <ScrollAreaPrimitive.Root className="relative h-full w-full overflow-hidden">
                    <ScrollAreaPrimitive.Viewport
                      ref={horizontalViewportRef}
                      className="h-[calc(100%-10px)] w-full rounded-[inherit]"
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
                      <div className="flex items-center gap-3 min-w-max pt-0 pb-1 px-0.5 -translate-y-1">
                        <div
                          key={WEB_SOURCE_CARD_ID}
                          ref={(el) => {
                            fileRefs.current[WEB_SOURCE_CARD_ID] = el;
                          }}
                          className="shrink-0"
                        >
                          <WebSourceCard isCompact={true} />
                        </div>
                        {files.map((file) => (
                          <div
                            key={file.id}
                            ref={(el) => {
                              fileRefs.current[file.id] = el;
                            }}
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
                      className="flex touch-none select-none transition-colors h-2.5 flex-col border-t border-t-transparent p-[1px]"
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
              <div className="min-h-full px-3 py-3 w-full max-w-full overflow-hidden">
                {files.length === 0 ? (
                  <div className="h-full flex flex-col">
                    <div className="mb-2">
                      <WebSourceCard isCompact={isEffectiveCompact} />
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center mb-4 shadow-inner">
                        <File className="w-7 h-7 text-zinc-300" />
                      </div>
                      <p className="text-sm font-medium text-zinc-700">
                        {"\u6682\u65e0\u6587\u4ef6"}
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">
                        {
                          "\u4e0a\u4f20\u6587\u4ef6\u4ee5\u5f00\u59cb\u4f7f\u7528"
                        }
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
                    <AnimatePresence mode="popLayout">
                      <div
                        key={WEB_SOURCE_CARD_ID}
                        ref={(el) => {
                          fileRefs.current[WEB_SOURCE_CARD_ID] = el;
                        }}
                      >
                        <WebSourceCard isCompact={isEffectiveCompact} />
                      </div>
                      {files.map((file) => (
                        <div
                          key={file.id}
                          ref={(el) => {
                            fileRefs.current[file.id] = el;
                          }}
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
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
