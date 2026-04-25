"use client";

import {
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  Database,
  FileText,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SourcesHeaderProps {
  isCollapsed: boolean;
  isHeaderCompact: boolean;
  isStudioExpanded: boolean;
  isExpandedContentCollapsed: boolean;
  uploadingTasksCount: number;
  fileCount: number;
  libraryCount: number;
  artifactSourceCount: number;
  selectedCount: number;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  headerActionsRef: React.RefObject<HTMLDivElement | null>;
  onToggleCollapsed?: (action?: "collapse" | "expand" | "toggle") => void;
  onToggleExpandedContentCollapsed?: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onImportLibrary: () => void;
}

export function SourcesHeader({
  isCollapsed,
  isHeaderCompact,
  isStudioExpanded,
  isExpandedContentCollapsed,
  uploadingTasksCount,
  fileCount,
  libraryCount,
  artifactSourceCount,
  selectedCount,
  fileInputRef,
  headerActionsRef,
  onToggleCollapsed,
  onToggleExpandedContentCollapsed,
  onFileSelect,
  onImportLibrary,
}: SourcesHeaderProps) {
  const handleOpenFilePicker = () => fileInputRef.current?.click();
  const importButtonClassName =
    "h-9 rounded-full border-0 bg-white/90 text-zinc-600 shadow-sm ring-1 ring-zinc-100 transition-all hover:bg-white hover:text-zinc-900 hover:ring-zinc-200 focus-visible:ring-2 focus-visible:ring-zinc-200";

  const importMenu = (
    <DropdownMenuContent
      align="end"
      sideOffset={8}
      className="mt-1 w-52 rounded-2xl border-zinc-100 bg-white/95 p-2 text-zinc-900 shadow-2xl backdrop-blur-xl"
    >
      <DropdownMenuItem
        onSelect={handleOpenFilePicker}
        className="group cursor-pointer gap-3 rounded-xl px-3 py-2.5 focus:bg-zinc-50 data-[highlighted]:bg-zinc-50"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-50 text-zinc-500 transition-colors">
          <FileText className="h-4 w-4" />
        </div>
        <span className="text-[14px] font-medium text-zinc-800">资料</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={onImportLibrary}
        className="group cursor-pointer gap-3 rounded-xl px-3 py-2.5 focus:bg-zinc-50 data-[highlighted]:bg-zinc-50"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-50 text-zinc-500 transition-colors">
          <Database className="h-4 w-4" />
        </div>
        <span className="text-[14px] font-medium text-zinc-800">资料库</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

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
          <label className="hidden">
            <input
              ref={fileInputRef as React.RefObject<HTMLInputElement>}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.mov,.avi,.mp3,.wav,.jpg,.png"
              onChange={onFileSelect}
              className="hidden"
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                aria-label="导入"
                className={cn(importButtonClassName, "w-9 px-0")}
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            {importMenu}
          </DropdownMenu>
        </div>
      ) : (
        <>
          {!isHeaderCompact ? (
            <div className="min-w-0 flex-1 flex-col justify-center">
              <CardTitle className="truncate text-lg font-bold leading-tight">
                <span className="truncate whitespace-nowrap">资料来源</span>
              </CardTitle>
              <CardDescription className="mt-0.5 truncate text-xs font-medium leading-tight text-[var(--project-text-muted)]">
                {`${fileCount} 个文件${
                  libraryCount > 0 ? ` · ${libraryCount} 个资料库` : ""
                }${
                  artifactSourceCount > 0
                    ? ` · ${artifactSourceCount} 个沉淀成果`
                    : ""
                } · ${selectedCount} 已选${
                  uploadingTasksCount > 0
                    ? ` · 处理中 ${uploadingTasksCount} 个`
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

            <label className="hidden">
              <input
                ref={fileInputRef as React.RefObject<HTMLInputElement>}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.mov,.avi,.mp3,.wav,.jpg,.png"
                onChange={onFileSelect}
                className="hidden"
              />
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  aria-label="导入"
                  className={cn(
                    importButtonClassName,
                    "gap-1.5 text-[13px] font-medium",
                    isHeaderCompact ? "w-9 justify-center px-0" : "px-3.5"
                  )}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {!isHeaderCompact && (
                    <>
                      <span>导入</span>
                      <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              {importMenu}
            </DropdownMenu>
          </div>
        </>
      )}
    </CardHeader>
  );
}
