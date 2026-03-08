"use client";

import { useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, File, Trash2, Check, Loader2, FileVideo, Presentation, Image, FileType, Music, Archive, Code, FileSpreadsheet } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/types/api";

type UploadedFile = components["schemas"]["UploadedFile"];

const FILE_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bgGradient: string }> = {
  pdf: {
    icon: FileText,
    color: "text-rose-500",
    bgGradient: "bg-gradient-to-br from-rose-50 to-red-50"
  },
  word: {
    icon: FileType,
    color: "text-blue-500",
    bgGradient: "bg-gradient-to-br from-blue-50 to-indigo-50"
  },
  video: {
    icon: FileVideo,
    color: "text-purple-500",
    bgGradient: "bg-gradient-to-br from-purple-50 to-violet-50"
  },
  image: {
    icon: Image,
    color: "text-emerald-500",
    bgGradient: "bg-gradient-to-br from-emerald-50 to-teal-50"
  },
  ppt: {
    icon: Presentation,
    color: "text-orange-500",
    bgGradient: "bg-gradient-to-br from-orange-50 to-amber-50"
  },
  txt: {
    icon: FileText,
    color: "text-slate-500",
    bgGradient: "bg-gradient-to-br from-slate-50 to-gray-50"
  },
  excel: {
    icon: FileSpreadsheet,
    color: "text-green-500",
    bgGradient: "bg-gradient-to-br from-green-50 to-emerald-50"
  },
  audio: {
    icon: Music,
    color: "text-pink-500",
    bgGradient: "bg-gradient-to-br from-pink-50 to-rose-50"
  },
  archive: {
    icon: Archive,
    color: "text-yellow-600",
    bgGradient: "bg-gradient-to-br from-yellow-50 to-orange-50"
  },
  code: {
    icon: Code,
    color: "text-cyan-500",
    bgGradient: "bg-gradient-to-br from-cyan-50 to-blue-50"
  },
  other: {
    icon: File,
    color: "text-zinc-400",
    bgGradient: "bg-gradient-to-br from-zinc-50 to-zinc-100"
  },
};

const STATUS_CONFIG: Record<string, { color: string; pulse?: boolean }> = {
  uploading: { color: "bg-blue-400", pulse: true },
  parsing: { color: "bg-amber-400", pulse: true },
  ready: { color: "bg-emerald-400" },
  failed: { color: "bg-red-400" },
};

function getFileTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["js", "ts", "jsx", "tsx", "py", "java", "cpp", "c", "go", "rs", "rb", "php", "swift", "kt"].includes(ext)) return "code";
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
}: {
  file: UploadedFile;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const fileType = getFileTypeFromExtension(file.filename);
  const config = FILE_TYPE_CONFIG[fileType] || FILE_TYPE_CONFIG.other;
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG.uploading;
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onToggle}
      className={cn(
        "group relative flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all duration-200",
        isSelected
          ? "bg-white shadow-sm border-2 border-zinc-200"
          : "bg-white hover:bg-zinc-50 shadow-sm hover:shadow-md border border-zinc-100"
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105",
          config.bgGradient
        )}
      >
        <Icon className={cn(
          "w-4 h-4 transition-colors",
          config.color
        )} />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-xs font-medium truncate transition-colors",
            "text-zinc-800"
          )}
        >
          {file.filename}
        </p>

        {file.status === "parsing" && file.parse_progress !== undefined && (
          <div className="mt-1.5">
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

      <div className="flex items-center gap-1.5 shrink-0">
        <div className={cn(
          "w-2 h-2 rounded-full transition-all",
          statusConfig.color,
          statusConfig.pulse && "animate-pulse"
        )} />

        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-6 h-6 rounded-md bg-zinc-100 hover:bg-red-100 text-zinc-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
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

export function SourcesPanel({ projectId }: SourcesPanelProps) {
  const { files, selectedFileIds, isUploading, uploadFile, deleteFile, toggleFileSelection } = useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        await uploadFile(projectId, file);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [projectId, uploadFile]
  );

  const handleDelete = useCallback(
    async (fileId: string) => {
      await deleteFile(projectId, fileId);
    },
    [projectId, deleteFile]
  );

  return (
    <div className="h-full bg-transparent" style={{ transform: "translateZ(0)" }}>
      <Card className="h-full rounded-2xl shadow-lg border border-white/60 bg-white/95 backdrop-blur-xl overflow-hidden will-change-[box-shadow,transform]">
        <CardHeader className="flex flex-row items-center justify-between px-4 border-b border-zinc-100 space-y-0 py-0 shrink-0" style={{ height: "52px" }}>
          <div className="flex flex-col justify-center shrink-0">
            <CardTitle className="text-sm font-semibold leading-tight">Sources</CardTitle>
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

        <CardContent className="p-0 h-[calc(100%-52px)]">
          <ScrollArea className="h-full">
            <div className="min-h-full p-3">
              {files.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center mb-4 shadow-inner">
                    <File className="w-7 h-7 text-zinc-300" />
                  </div>
                  <p className="text-sm font-medium text-zinc-700">暂无文件</p>
                  <p className="text-xs text-zinc-400 mt-1">上传文件以开始使用</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {files.map((file) => (
                      <FileItem
                        key={file.id}
                        file={file}
                        isSelected={selectedFileIds.includes(file.id)}
                        onToggle={() => toggleFileSelection(file.id)}
                        onDelete={() => handleDelete(file.id)}
                      />
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
