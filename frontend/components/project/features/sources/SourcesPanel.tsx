"use client";

import { AnimatePresence } from "framer-motion";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { File } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WEB_SOURCE_CARD_ID } from "./constants";
import { FileItem } from "./components/FileItem";
import { SourcesHeader } from "./components/SourcesHeader";
import { WebSourceCard } from "./components/WebSourceCard";
import { useSourcesPanelController } from "./useSourcesPanelController";

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

  return (
    <div ref={containerRef} className="h-full w-full bg-transparent" style={{ transform: "translateZ(0)" }}>
      <Card className="h-full rounded-2xl shadow-lg border border-white/60 bg-white/95 backdrop-blur-xl will-change-[box-shadow,transform]">
        <SourcesHeader
          isCollapsed={isCollapsed}
          isHeaderCompact={isHeaderCompact}
          isStudioExpanded={isStudioExpanded}
          isExpandedContentCollapsed={isExpandedContentCollapsed}
          uploadingTasksCount={uploadingTasksCount}
          fileCount={files.length}
          selectedCount={selectedFileIds.length}
          fileInputRef={fileInputRef}
          headerActionsRef={headerActionsRef}
          onToggleCollapsed={onToggleCollapsed}
          onToggleExpandedContentCollapsed={onToggleExpandedContentCollapsed}
          onFileSelect={handleFileSelect}
        />

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
                    <p className="text-sm font-medium text-zinc-700">暂无文件</p>
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
                          ref={(el) => registerFileRef(WEB_SOURCE_CARD_ID, el)}
                          className="shrink-0"
                        >
                          <WebSourceCard isCompact={true} />
                        </div>
                        {files.map((file) => (
                          <div
                            key={file.id}
                            ref={(el) => registerFileRef(file.id, el)}
                            className="shrink-0"
                          >
                            <FileItem
                              file={file}
                              isSelected={selectedFileIds.includes(file.id)}
                              onToggle={() => toggleFileSelection(file.id)}
                              onDelete={() => handleDelete(file.id)}
                              isCompact={true}
                              isFocused={focusedFileId === file.id}
                              focusDetail={focusedFileId === file.id ? focusPayload : null}
                              isExpanded={false}
                              onCollapse={() => collapseFile(file.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </ScrollAreaPrimitive.Viewport>
                    <ScrollAreaPrimitive.ScrollAreaScrollbar orientation="horizontal" className="flex touch-none select-none transition-colors h-2.5 flex-col border-t border-t-transparent p-[1px]">
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
                      <p className="text-sm font-medium text-zinc-700">暂无文件</p>
                      <p className="text-xs text-zinc-400 mt-1">上传文件以开始使用</p>
                    </div>
                  </div>
                ) : (
                  <div className={cn("grid grid-cols-1 gap-2 w-full max-w-full", isEffectiveCompact && "flex flex-col gap-2")}>
                    <AnimatePresence mode="popLayout">
                      <div
                        key={WEB_SOURCE_CARD_ID}
                        ref={(el) => registerFileRef(WEB_SOURCE_CARD_ID, el)}
                      >
                        <WebSourceCard isCompact={isEffectiveCompact} />
                      </div>
                      {files.map((file) => (
                        <div
                          key={file.id}
                          ref={(el) => registerFileRef(file.id, el)}
                        >
                          <FileItem
                            file={file}
                            isSelected={selectedFileIds.includes(file.id)}
                            onToggle={() => toggleFileSelection(file.id)}
                            onDelete={() => handleDelete(file.id)}
                            isCompact={isEffectiveCompact}
                            isFocused={focusedFileId === file.id}
                            focusDetail={focusedFileId === file.id ? focusPayload : null}
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
