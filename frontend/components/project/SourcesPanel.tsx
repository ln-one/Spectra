"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import {
  Upload,
  FileText,
  File,
  Trash2,
  Check,
  Loader2,
  FileVideo,
  Presentation,
  Image,
  FileType,
  Music,
  Archive,
  Code,
  FileSpreadsheet,
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
  ChevronsDown,
  ChevronsUp,
  Globe,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
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
import type { components } from "@/lib/sdk/types";

type UploadedFile = components["schemas"]["UploadedFile"];
const COMPACT_MODE_WIDTH = 140;
const HEADER_FORCE_NORMAL_WIDTH = 260;
const HEADER_MIN_VISIBLE_WIDTH = 96;
const HEADER_COMPACT_HYSTERESIS = 16;
const WEB_SOURCE_CARD_ID = "__web_source_default__";

const FILE_TYPE_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; bgGradient: string }
> = {
  pdf: {
    icon: FileText,
    color: "text-rose-500",
    bgGradient: "bg-gradient-to-br from-rose-50 to-red-50",
  },
  word: {
    icon: FileType,
    color: "text-blue-500",
    bgGradient: "bg-gradient-to-br from-blue-50 to-indigo-50",
  },
  video: {
    icon: FileVideo,
    color: "text-purple-500",
    bgGradient: "bg-gradient-to-br from-purple-50 to-violet-50",
  },
  image: {
    icon: Image,
    color: "text-emerald-500",
    bgGradient: "bg-gradient-to-br from-emerald-50 to-teal-50",
  },
  ppt: {
    icon: Presentation,
    color: "text-orange-500",
    bgGradient: "bg-gradient-to-br from-orange-50 to-amber-50",
  },
  txt: {
    icon: FileText,
    color: "text-slate-500",
    bgGradient: "bg-gradient-to-br from-slate-50 to-gray-50",
  },
  excel: {
    icon: FileSpreadsheet,
    color: "text-green-500",
    bgGradient: "bg-gradient-to-br from-green-50 to-emerald-50",
  },
  audio: {
    icon: Music,
    color: "text-pink-500",
    bgGradient: "bg-gradient-to-br from-pink-50 to-rose-50",
  },
  archive: {
    icon: Archive,
    color: "text-yellow-600",
    bgGradient: "bg-gradient-to-br from-yellow-50 to-orange-50",
  },
  code: {
    icon: Code,
    color: "text-cyan-500",
    bgGradient: "bg-gradient-to-br from-cyan-50 to-blue-50",
  },
  other: {
    icon: File,
    color: "text-zinc-400",
    bgGradient: "bg-gradient-to-br from-zinc-50 to-zinc-100",
  },
};

const STATUS_CONFIG: Record<string, { color: string; pulse?: boolean }> = {
  uploading: { color: "bg-amber-400", pulse: true },
  parsing: { color: "bg-amber-400", pulse: true },
  ready: { color: "bg-emerald-400" },
  failed: { color: "bg-red-400" },
};

function getFileTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv"].includes(ext))
    return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext))
    return "image";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "java",
      "cpp",
      "c",
      "go",
      "rs",
      "rb",
      "php",
      "swift",
      "kt",
    ].includes(ext)
  )
    return "code";
  if (ext === "txt") return "txt";
  return "other";
}

function getFileStatusText(file: UploadedFile): string {
  if (
    file.status === "ready" &&
    file.parse_result?.indexed_count !== undefined
  ) {
    return `\u5df2\u7d22\u5f15 ${file.parse_result.indexed_count} \u6bb5`;
  }
  if (file.status === "ready") return "\u4e0a\u4f20\u5b8c\u6210";
  if (file.status === "parsing") return "\u89e3\u6790\u4e2d";
  if (file.status === "uploading") return "\u4e0a\u4f20\u4e2d";
  if (file.parse_error) return `\u5931\u8d25\uff1a${file.parse_error}`;
  return "\u89e3\u6790\u5931\u8d25";
}

function getSourceTypeLabel(type?: string): string {
  if (type === "web") return "网页";
  if (type === "video") return "视频";
  if (type === "audio") return "音频";
  if (type === "ai_generated") return "AI";
  return "文档";
}

function toSeconds(value?: string | number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function WebSourceCard({ isCompact }: { isCompact: boolean }) {
  const hint = "网页检索（即将上线）\n入口预留中";

  if (isCompact) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{
          layout: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
          duration: 0.12,
        }}
        className="group relative flex items-center justify-center p-2.5 rounded-xl hover:bg-white/30 transition-colors"
        style={{ minHeight: "52px" }}
        title={hint}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/50">
          <Globe className="w-4 h-4 text-blue-500" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{
        layout: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
        duration: 0.12,
      }}
      className="grid grid-cols-[32px_1fr_auto] items-center gap-2.5 p-2.5 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm"
      style={{ minHeight: "52px" }}
      title={hint}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/80 border border-blue-100">
        <Globe className="w-4 h-4 text-blue-500" />
      </div>
      <div className="min-w-0 flex flex-col justify-center">
        <p className="text-xs font-medium text-zinc-800 truncate">
          网页检索（即将上线）
        </p>
        <p className="text-[10px] text-zinc-500 mt-0.5 truncate">入口预留中</p>
      </div>
      <div className="flex items-center gap-1.5 pl-1.5 border-l border-blue-100">
        <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
      </div>
    </motion.div>
  );
}

interface SourcesPanelProps {
  projectId: string;
  isCollapsed?: boolean;
  onToggleCollapsed?: (action?: "collapse" | "expand" | "toggle") => void;
  isStudioExpanded?: boolean;
  isExpandedContentCollapsed?: boolean;
  onToggleExpandedContentCollapsed?: () => void;
}

function FileItem({
  file,
  isSelected,
  onToggle,
  onDelete,
  isCompact,
  isFocused,
  focusDetail,
  isExpanded,
  onCollapse,
}: {
  file: UploadedFile;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isCompact: boolean;
  isFocused: boolean;
  focusDetail?: {
    chunk_id?: string;
    content?: string;
    source?: {
      page_number?: number | null;
      source_type?: string;
      timestamp?: number | string | null;
    };
    context?: {
      previous_chunk?: string | null;
      next_chunk?: string | null;
    } | null;
  } | null;
  isExpanded: boolean;
  onCollapse: () => void;
}) {
  const fileType = getFileTypeFromExtension(file.filename);
  const config = FILE_TYPE_CONFIG[fileType] || FILE_TYPE_CONFIG.other;
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG.uploading;
  const Icon = config.icon;
  const focusTimestampSeconds = toSeconds(focusDetail?.source?.timestamp);

  if (isCompact) {
    const compactHint = `${file.filename}\n${getFileStatusText(file)}`;
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{
          layout: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
          duration: 0.12,
        }}
        onClick={onToggle}
        className={cn(
          "group relative flex items-center justify-center p-2.5 rounded-xl cursor-pointer transition-all duration-200 overflow-visible",
          isSelected
            ? "bg-white/50"
            : "hover:bg-white/30"
        )}
        style={{ minHeight: "52px" }}
        title={compactHint}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105",
            config.bgGradient
          )}
        >
          <Icon className={cn("w-4 h-4 transition-colors", config.color)} />
        </div>

        {isSelected && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 flex items-center justify-center shadow-lg"
          >
            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
          </motion.div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{
        layout: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
        duration: 0.12,
      }}
      onClick={onToggle}
      className={cn(
        "group relative grid grid-cols-[32px_1fr_auto] items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all duration-200 w-full max-w-full overflow-visible",
        isSelected
          ? "bg-white shadow-sm border-2 border-zinc-200"
          : "bg-white hover:bg-zinc-50 shadow-sm hover:shadow-md border border-zinc-100"
      )}
      style={{ minHeight: "52px" }}
    >
      {isFocused && (
        <motion.div
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-r from-amber-50 via-white to-emerald-50"
        />
      )}
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-105",
          config.bgGradient
        )}
      >
        <Icon className={cn("w-4 h-4 transition-colors", config.color)} />
      </div>

      <div className="min-w-0 flex flex-col justify-center">
        <p
          className="text-xs font-medium transition-colors text-zinc-800 truncate"
          title={file.filename}
        >
          {file.filename}
        </p>

        {isExpanded && (
          <div className="mt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCollapse();
              }}
              className="h-5 px-2 text-[10px] rounded-md bg-zinc-50 hover:bg-zinc-100 text-zinc-500"
            >
              {"\u6536\u8d77"}
            </Button>
          </div>
        )}

        <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
          {getFileStatusText(file)}
        </p>

        {file.status === "parsing" && file.parse_progress !== undefined && (
          <div className="mt-1.5 w-full overflow-hidden">
            <div className="h-1 rounded-full overflow-hidden bg-zinc-100">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${file.parse_progress}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="h-full rounded-full bg-primary"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 pl-1.5 border-l border-zinc-50">
        <div
          className={cn(
            "w-2 h-2 rounded-full transition-all shrink-0",
            statusConfig.color,
            statusConfig.pulse && "animate-pulse"
          )}
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-6 h-6 rounded-md bg-zinc-50 hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {isSelected && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 flex items-center justify-center shadow-lg"
        >
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </motion.div>
      )}

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key={`expand-${file.id}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="col-span-3 mt-2 rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 text-[11px] text-zinc-700 leading-relaxed shadow-inner"
          >
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <Sparkles className="w-3 h-3" />
              <span>{"\u6587\u4ef6\u89e3\u6790\u6458\u8981"}</span>
            </div>
            <div className="mt-1 text-zinc-700">{getFileStatusText(file)}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded && isFocused && focusDetail?.content && (
          <motion.div
            key={`focus-${focusDetail.chunk_id}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="col-span-3 mt-2 rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 text-[11px] text-zinc-700 leading-relaxed shadow-inner"
          >
            <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
              <span>{"\u5f15\u7528\u7247\u6bb5"}</span>
              <div className="flex items-center gap-1.5">
                {focusDetail.source?.source_type ? (
                  <span>
                    {getSourceTypeLabel(focusDetail.source.source_type)}
                  </span>
                ) : null}
                {focusDetail.source?.page_number ? (
                  <span>
                    {"\u9875\u7801 P"}
                    {focusDetail.source.page_number}
                  </span>
                ) : null}
                {focusTimestampSeconds !== null ? (
                  <span>{Math.round(focusTimestampSeconds)}s</span>
                ) : null}
              </div>
            </div>
            <div className="whitespace-pre-wrap text-zinc-800">
              {focusDetail.content}
            </div>
            {focusDetail.context?.previous_chunk ||
            focusDetail.context?.next_chunk ? (
              <div className="mt-2 border-t border-zinc-200 pt-2 text-[10px] text-zinc-500">
                {focusDetail.context?.previous_chunk ? (
                  <div className="mb-1">
                    {"\u4e0a\u6587\uff1a"}
                    {focusDetail.context.previous_chunk}
                  </div>
                ) : null}
                {focusDetail.context?.next_chunk ? (
                  <div>
                    {"\u4e0b\u6587\uff1a"}
                    {focusDetail.context.next_chunk}
                  </div>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
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
    isUploading,
    uploadFile,
    deleteFile,
    toggleFileSelection,
    activeSourceDetail,
    clearActiveSource,
  } = useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalViewportRef = useRef<HTMLDivElement>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [isCompact, setIsCompact] = useState(false);
  const [isHeaderTight, setIsHeaderTight] = useState(false);
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
  }, [files.length, selectedFileIds.length, isUploading]);

  const focusedFileId = activeSourceDetail?.file_info?.id;
  const focusPayload = useMemo(() => {
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
    if (targetId) {
      setExpandedIds((prev) => ({ ...prev, [targetId]: true }));
    }
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

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        await uploadFile(file, projectId);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [projectId, uploadFile]
  );

  const handleDelete = useCallback(
    async (fileId: string) => {
      await deleteFile(fileId);
    },
    [projectId, deleteFile]
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
                aria-label="展开 Sources 面板"
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
                  disabled={isUploading}
                  className="hidden"
                />
                <Button
                  size="sm"
                  disabled={isUploading}
                  aria-label={isUploading ? "上传中" : "上传"}
                  className={cn(
                    "w-7 h-7 px-0 rounded-full transition-all",
                    isUploading
                      ? "bg-zinc-100 text-zinc-400"
                      : "bg-zinc-900 hover:bg-zinc-800 shadow-sm hover:shadow-md"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
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
                    {`${files.length} 个文件 · ${selectedFileIds.length} 已选`}
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
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.mov,.avi,.mp3,.wav,.jpg,.png"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    disabled={isUploading}
                    aria-label={isUploading ? "上传中" : "上传"}
                    className={cn(
                      "gap-1.5 rounded-full text-[11px] h-7 transition-all",
                      isHeaderCompact && "w-7 px-0 justify-center",
                      isUploading
                        ? "bg-zinc-100 text-zinc-400"
                        : "bg-zinc-900 hover:bg-zinc-800 shadow-sm hover:shadow-md"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    {!isHeaderCompact && (isUploading ? "上传中" : "上传")}
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
