"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ChevronDown,
  ChevronRight,
  Sparkles,
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
import type { components } from "@/lib/types/api";

type UploadedFile = components["schemas"]["UploadedFile"];

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

interface SourcesPanelProps {
  projectId: string;
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
  onToggleExpand,
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
    source?: { page_number?: number | null };
    context?: {
      previous_chunk?: string | null;
      next_chunk?: string | null;
    } | null;
  } | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const fileType = getFileTypeFromExtension(file.filename);
  const config = FILE_TYPE_CONFIG[fileType] || FILE_TYPE_CONFIG.other;
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG.uploading;
  const Icon = config.icon;

  if (isCompact) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={onToggle}
        className={cn(
          "group relative flex items-center justify-center p-2.5 rounded-xl cursor-pointer transition-all duration-200 overflow-visible",
          isSelected
            ? "bg-white shadow-sm border-2 border-zinc-200"
            : "bg-white hover:bg-zinc-50 shadow-sm hover:shadow-md border border-zinc-100"
        )}
        style={{ minHeight: "52px" }}
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
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
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

        <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
          {file.status === "ready" &&
          file.parse_result?.indexed_count !== undefined
            ? `已索引 ${file.parse_result.indexed_count} 段`
            : file.status === "ready"
              ? "已完成解析"
              : file.status === "parsing"
                ? "解析中"
                : file.status === "uploading"
                  ? "上传中"
                  : file.parse_error
                    ? `失败：${file.parse_error}`
                    : "解析失败"}
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
            onToggleExpand();
          }}
          className="w-6 h-6 rounded-md bg-zinc-50 hover:bg-zinc-100 text-zinc-500 transition-colors shrink-0"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </Button>

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
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="col-span-3 mt-2 rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 text-[11px] text-zinc-700 leading-relaxed shadow-inner"
          >
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <Sparkles className="w-3 h-3" />
              <span>文件解析摘要</span>
            </div>
            <div className="mt-1 text-zinc-700">
              {file.status === "ready" &&
              file.parse_result?.indexed_count !== undefined
                ? `已索引 ${file.parse_result.indexed_count} 段`
                : file.status === "ready"
                  ? "已完成解析"
                  : file.status === "parsing"
                    ? "解析中"
                    : file.status === "uploading"
                      ? "上传中"
                      : file.parse_error
                        ? `失败：${file.parse_error}`
                        : "解析失败"}
            </div>
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
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="col-span-3 mt-2 rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 text-[11px] text-zinc-700 leading-relaxed shadow-inner"
          >
            <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
              <span>引用片段</span>
              {focusDetail.source?.page_number ? (
                <span>页码 P{focusDetail.source.page_number}</span>
              ) : null}
            </div>
            <div className="whitespace-pre-wrap text-zinc-800">
              {focusDetail.content}
            </div>
            {focusDetail.context?.previous_chunk ||
            focusDetail.context?.next_chunk ? (
              <div className="mt-2 border-t border-zinc-200 pt-2 text-[10px] text-zinc-500">
                {focusDetail.context?.previous_chunk ? (
                  <div className="mb-1">
                    上文：{focusDetail.context.previous_chunk}
                  </div>
                ) : null}
                {focusDetail.context?.next_chunk ? (
                  <div>下文：{focusDetail.context.next_chunk}</div>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function SourcesPanel({ projectId }: SourcesPanelProps) {
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
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [focusView, setFocusView] = useState<"current" | "prev" | "next">(
    "current"
  );
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const checkWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setIsCompact(width < 140);
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
  }, []);

  const focusedFileId = activeSourceDetail?.file_info?.id;
  const focusedExpanded = focusedFileId ? !!expandedIds[focusedFileId] : false;
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
  }, [focusedFileId]);

  useEffect(() => {
    if (focusedFileId) {
      setExpandedIds((prev) => ({ ...prev, [focusedFileId]: true }));
      setFocusView("current");
    }
  }, [focusedFileId]);

  const toggleExpand = useCallback((fileId: string) => {
    setExpandedIds((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
  }, []);

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
          <div className="flex flex-col justify-center shrink-0">
            <CardTitle className="text-sm font-semibold leading-tight">
              Sources
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 leading-tight">
              {files.length} 个文件 · {selectedFileIds.length} 已选
            </CardDescription>
          </div>
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
              className={cn(
                "gap-1.5 rounded-full text-[11px] h-7 transition-all",
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
              {isUploading ? "上传中" : "上传"}
            </Button>
          </label>
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-52px)] overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="min-h-full px-3 py-3 w-full max-w-full overflow-hidden">
              {activeSourceDetail &&
              activeSourceDetail.file_info &&
              focusedExpanded ? (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="mb-3 rounded-2xl border border-zinc-200 bg-white shadow-md p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-zinc-800">
                        {activeSourceDetail.file_info.filename}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {activeSourceDetail.source?.page_number
                          ? `页码 P${activeSourceDetail.source.page_number}`
                          : "未提供页码"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={clearActiveSource}
                    >
                      返回列表
                    </Button>
                  </div>
                  <div className="mt-2 rounded-xl bg-zinc-50 border border-zinc-100 p-2 text-[11px] text-zinc-800 whitespace-pre-wrap leading-relaxed">
                    {focusView === "current"
                      ? activeSourceDetail.content
                      : focusView === "prev"
                        ? activeSourceDetail.context?.previous_chunk ||
                          "暂无上文"
                        : activeSourceDetail.context?.next_chunk || "暂无下文"}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px]">
                    <Button
                      variant={focusView === "prev" ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setFocusView("prev")}
                    >
                      上文
                    </Button>
                    <Button
                      variant={focusView === "current" ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setFocusView("current")}
                    >
                      当前
                    </Button>
                    <Button
                      variant={focusView === "next" ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setFocusView("next")}
                    >
                      下文
                    </Button>
                  </div>
                  {activeSourceDetail.context?.previous_chunk ||
                  activeSourceDetail.context?.next_chunk ? (
                    <div className="mt-2 text-[10px] text-zinc-500 border-t border-zinc-200 pt-2">
                      {activeSourceDetail.context?.previous_chunk ? (
                        <div className="mb-1">
                          上文：{activeSourceDetail.context.previous_chunk}
                        </div>
                      ) : null}
                      {activeSourceDetail.context?.next_chunk ? (
                        <div>下文：{activeSourceDetail.context.next_chunk}</div>
                      ) : null}
                    </div>
                  ) : null}
                </motion.div>
              ) : null}
              {files.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center mb-4 shadow-inner">
                    <File className="w-7 h-7 text-zinc-300" />
                  </div>
                  <p className="text-sm font-medium text-zinc-700">暂无文件</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    上传文件以开始使用
                  </p>
                </div>
              ) : (
                <div
                  className={cn(
                    "grid grid-cols-1 gap-2 w-full max-w-full",
                    isCompact && "flex flex-col gap-2"
                  )}
                >
                  <AnimatePresence mode="popLayout">
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
                          isCompact={isCompact}
                          isFocused={focusedFileId === file.id}
                          focusDetail={
                            focusedFileId === file.id ? focusPayload : null
                          }
                          isExpanded={!!expandedIds[file.id]}
                          onToggleExpand={() => toggleExpand(file.id)}
                        />
                      </div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
