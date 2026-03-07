"use client";

import { useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, File, Trash2, Check, Loader2, AlertCircle } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { components } from "@/lib/types/api";

type UploadedFile = components["schemas"]["UploadedFile"];

const FILE_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  pdf: { icon: FileText, color: "text-red-500" },
  word: { icon: FileText, color: "text-blue-500" },
  video: { icon: File, color: "text-purple-500" },
  image: { icon: File, color: "text-green-500" },
  ppt: { icon: File, color: "text-orange-500" },
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  uploading: { label: "上传中", variant: "secondary" },
  parsing: { label: "解析中", variant: "outline" },
  ready: { label: "就绪", variant: "default" },
  failed: { label: "失败", variant: "destructive" },
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
        "group relative flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all",
        isSelected
          ? "bg-zinc-900 text-white ring-2 ring-zinc-900"
          : "bg-zinc-50 hover:bg-zinc-100"
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
          isSelected ? "bg-white/10" : "bg-white shadow-sm"
        )}
      >
        <Icon className={cn("w-4.5 h-4.5", isSelected ? "text-white" : config.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-[11px] font-medium truncate",
            isSelected ? "text-white" : "text-zinc-800"
          )}
        >
          {file.filename}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant={statusConfig.variant} className="text-[10px] px-1.5 py-0">
            {statusConfig.label}
          </Badge>
          {file.file_size && (
            <span className={cn("text-[10px]", isSelected ? "text-white/50" : "text-zinc-400")}>
              {(file.file_size / 1024).toFixed(1)} KB
            </span>
          )}
        </div>

        {file.status === "parsing" && file.parse_progress !== undefined && (
          <div className="mt-1.5">
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
        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-zinc-900" />
        </div>
      )}

      {file.status === "failed" && (
        <div className="absolute top-1.5 right-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={cn(
          "absolute bottom-1.5 right-1.5 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity",
          isSelected
            ? "bg-white/10 hover:bg-white/20 text-white"
            : "bg-zinc-200 hover:bg-zinc-300 text-zinc-600"
        )}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
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
    <div className="h-full p-2.5 bg-transparent">
      <Card className="h-full rounded-2xl shadow-lg border border-white/60 bg-white/95 backdrop-blur-xl overflow-hidden">
        <CardHeader className="px-4 py-3 space-y-0 border-b border-zinc-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Sources</CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                {files.length} 个文件 · {selectedFileIds.length} 已选
              </CardDescription>
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
              <Button
                size="sm"
                disabled={isUploading}
                className={cn(
                  "gap-1.5 rounded-full text-[11px] h-7",
                  isUploading
                    ? "bg-zinc-100 text-zinc-400"
                    : "bg-zinc-900 hover:bg-zinc-800"
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
          </div>
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-52px)]">
          <ScrollArea className="h-full">
            <div
              className="min-h-full p-2.5"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {files.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mb-3">
                    <Upload className="w-6 h-6 text-zinc-400" />
                  </div>
                  <p className="text-sm font-medium text-zinc-700">上传素材</p>
                  <p className="text-xs text-zinc-500 mt-1">拖拽文件到此处或点击上传按钮</p>
                  <p className="text-[10px] text-zinc-400 mt-1.5">
                    支持 PDF、Word、PPT、视频等格式
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
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
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
