"use client";

import { useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, File, Trash2, Check, Loader2, AlertCircle } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/types/api";

type UploadedFile = components["schemas"]["UploadedFile"];

const FILE_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  pdf: { icon: FileText, color: "text-red-500" },
  word: { icon: FileText, color: "text-blue-500" },
  video: { icon: File, color: "text-purple-500" },
  image: { icon: File, color: "text-green-500" },
  ppt: { icon: File, color: "text-orange-500" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  uploading: { label: "上传中", color: "text-zinc-500" },
  parsing: { label: "解析中", color: "text-blue-500" },
  ready: { label: "就绪", color: "text-emerald-500" },
  failed: { label: "失败", color: "text-red-500" },
};

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
  const config = FILE_TYPE_CONFIG[file.file_type] || FILE_TYPE_CONFIG.pdf;
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG.uploading;
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onClick={onToggle}
      className={cn(
        "group relative flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all",
        isSelected
          ? "bg-zinc-900 text-white ring-2 ring-zinc-900"
          : "bg-zinc-50 hover:bg-zinc-100"
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
          isSelected ? "bg-white/10" : "bg-white shadow-sm"
        )}
      >
        <Icon className={cn("w-5 h-5", isSelected ? "text-white" : config.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium truncate",
            isSelected ? "text-white" : "text-zinc-800"
          )}
        >
          {file.filename}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={cn(
              "text-[10px]",
              isSelected ? "text-white/70" : statusConfig.color
            )}
          >
            {statusConfig.label}
          </span>
          {file.file_size && (
            <span className={cn("text-[10px]", isSelected ? "text-white/50" : "text-zinc-400")}>
              {(file.file_size / 1024).toFixed(1)} KB
            </span>
          )}
        </div>

        {file.status === "parsing" && file.parse_progress !== undefined && (
          <div className="mt-2">
            <div className="h-1 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${file.parse_progress}%` }}
                className="h-full bg-white rounded-full"
              />
            </div>
          </div>
        )}
      </div>

      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white flex items-center justify-center">
          <Check className="w-3 h-3 text-zinc-900" />
        </div>
      )}

      {file.status === "failed" && (
        <div className="absolute top-2 right-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
        </div>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={cn(
          "absolute bottom-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity",
          isSelected
            ? "bg-white/10 hover:bg-white/20 text-white"
            : "bg-zinc-200 hover:bg-zinc-300 text-zinc-600"
        )}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export function SourcesPanel({ projectId }: SourcesPanelProps) {
  const { files, selectedFileIds, isUploading, uploadFile, deleteFile, toggleFileSelection } =
    useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      for (const file of Array.from(selectedFiles)) {
        await uploadFile(file, projectId);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadFile, projectId]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFiles = e.dataTransfer.files;
      if (!droppedFiles || droppedFiles.length === 0) return;

      for (const file of Array.from(droppedFiles)) {
        await uploadFile(file, projectId);
      }
    },
    [uploadFile, projectId]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Sources</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {files.length} 个文件 · {selectedFileIds.length} 已选
            </p>
          </div>
          <label className="relative">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.mov,.avi"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="hidden"
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={isUploading}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                isUploading
                  ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                  : "bg-zinc-900 text-white hover:bg-zinc-800"
              )}
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {isUploading ? "上传中" : "上传"}
            </motion.button>
          </label>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-3"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
              <Upload className="w-7 h-7 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-700">上传素材</p>
            <p className="text-xs text-zinc-500 mt-1">拖拽文件到此处或点击上传按钮</p>
            <p className="text-[10px] text-zinc-400 mt-2">
              支持 PDF、Word、PPT、视频等格式
            </p>
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
                  onDelete={() => deleteFile(file.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
