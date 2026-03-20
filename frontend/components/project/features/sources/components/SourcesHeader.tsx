"use client";

import { ChevronsDown, ChevronsUp, PanelRightClose, PanelRightOpen, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SourcesHeaderProps {
  isCollapsed: boolean;
  isHeaderCompact: boolean;
  isStudioExpanded: boolean;
  isExpandedContentCollapsed: boolean;
  uploadingTasksCount: number;
  fileCount: number;
  selectedCount: number;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  headerActionsRef: React.RefObject<HTMLDivElement | null>;
  onToggleCollapsed?: (action?: "collapse" | "expand" | "toggle") => void;
  onToggleExpandedContentCollapsed?: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function SourcesHeader({
  isCollapsed,
  isHeaderCompact,
  isStudioExpanded,
  isExpandedContentCollapsed,
  uploadingTasksCount,
  fileCount,
  selectedCount,
  fileInputRef,
  headerActionsRef,
  onToggleCollapsed,
  onToggleExpandedContentCollapsed,
  onFileSelect,
}: SourcesHeaderProps) {
  return (
    <CardHeader
      className="flex flex-row items-center justify-between px-4 space-y-0 py-0 shrink-0"
      style={{ height: "52px" }}
    >
      {isCollapsed ? (
        <div className="w-full flex items-center justify-between">
          <Button
            size="icon"
            variant="ghost"
            aria-label="展开 Sources 面板"
            className="h-7 w-7 rounded-full text-zinc-500 hover:text-zinc-700 hover:bg-transparent"
            onClick={() => onToggleCollapsed?.("expand")}
          >
            <PanelRightOpen className="w-3.5 h-3.5" />
          </Button>
          <label className="relative shrink-0">
            <input
              ref={fileInputRef as React.RefObject<HTMLInputElement>}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.mov,.avi,.mp3,.wav,.jpg,.png"
              onChange={onFileSelect}
              className="hidden"
            />
            <Button
              size="sm"
              aria-label="上传"
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
              <CardTitle className="text-sm font-semibold leading-tight">Sources</CardTitle>
              <CardDescription className="text-xs text-zinc-500 leading-tight truncate">
                {`${fileCount} 个文件 · ${selectedCount} 已选${
                  uploadingTasksCount > 0 ? ` · 上传中 ${uploadingTasksCount} 个` : ""
                }`}
              </CardDescription>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div
            ref={headerActionsRef as React.RefObject<HTMLDivElement>}
            className={cn("flex items-center gap-1.5 shrink-0", isHeaderCompact ? "ml-0" : "ml-2")}
          >
            <Button
              size="icon"
              variant="ghost"
              aria-label={
                isStudioExpanded
                  ? isExpandedContentCollapsed
                    ? "向下展开 Sources 内容"
                    : "向上收起 Sources 内容"
                  : "收起 Sources 面板"
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
                ref={fileInputRef as React.RefObject<HTMLInputElement>}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.mov,.avi,.mp3,.wav,.jpg,.png"
                onChange={onFileSelect}
                className="hidden"
              />
              <Button
                size="sm"
                aria-label="上传"
                className={cn(
                  "gap-1.5 rounded-full text-[11px] h-7 transition-all",
                  isHeaderCompact && "w-7 px-0 justify-center",
                  "bg-zinc-900 hover:bg-zinc-800 shadow-sm hover:shadow-md"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3 h-3" />
                {!isHeaderCompact && "上传"}
              </Button>
            </label>
          </div>
        </>
      )}
    </CardHeader>
  );
}
