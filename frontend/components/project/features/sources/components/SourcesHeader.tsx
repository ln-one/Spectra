"use client";

import {
  ChevronsDown,
  ChevronsUp,
  PanelRightClose,
  PanelRightOpen,
  Upload,
} from "lucide-react";
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
  libraryCount: number;
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
  libraryCount,
  selectedCount,
  fileInputRef,
  headerActionsRef,
  onToggleCollapsed,
  onToggleExpandedContentCollapsed,
  onFileSelect,
}: SourcesHeaderProps) {
  return (
    <CardHeader
      className="flex flex-row items-center justify-between px-4 py-0 shrink-0 space-y-0"
      style={{ height: "52px" }}
    >
      {isCollapsed ? (
        <div className="flex w-full items-center justify-between">
          <Button
            size="icon"
            variant="ghost"
            aria-label="展开 Sources 面板"
            className="h-7 w-7 rounded-full text-[var(--project-text-muted)] hover:bg-transparent hover:text-[var(--project-text-primary)]"
            onClick={() => onToggleCollapsed?.("expand")}
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
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
                "h-7 w-7 rounded-full px-0 transition-all",
                "bg-[var(--project-accent)] text-[var(--project-accent-text)] shadow-sm hover:bg-[var(--project-accent-hover)] hover:shadow-md"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3 w-3" />
            </Button>
          </label>
        </div>
      ) : (
        <>
          {!isHeaderCompact ? (
            <div className="min-w-0 flex-1 flex-col justify-center">
              <CardTitle className="truncate text-lg font-bold leading-tight">
                <span className="truncate whitespace-nowrap">教学资料</span>
              </CardTitle>
              <CardDescription className="mt-0.5 truncate text-xs font-medium leading-tight text-[var(--project-text-muted)]">
                {`${fileCount} 个文件${
                  libraryCount > 0 ? ` · ${libraryCount} 个引用库` : ""
                } · ${selectedCount} 已选${
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
            ref={headerActionsRef as React.RefObject<HTMLDivElement>}
            className={cn(
              "ml-2 flex shrink-0 items-center gap-1.5",
              isHeaderCompact && "ml-0"
            )}
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
              className="h-7 w-7 rounded-full px-0 text-[var(--project-text-muted)] hover:bg-transparent hover:text-[var(--project-text-primary)]"
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
                  <ChevronsDown className="h-3 w-3" />
                ) : (
                  <ChevronsUp className="h-3 w-3" />
                )
              ) : (
                <PanelRightClose className="h-3 w-3" />
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
                  "h-7 gap-1.5 rounded-full text-[11px] transition-all",
                  isHeaderCompact && "w-7 justify-center px-0",
                  "bg-[var(--project-accent)] text-[var(--project-accent-text)] shadow-sm hover:bg-[var(--project-accent-hover)] hover:shadow-md"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3" />
                {!isHeaderCompact && "上传"}
              </Button>
            </label>
          </div>
        </>
      )}
    </CardHeader>
  );
}
