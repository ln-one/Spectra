"use client";

import { useCallback } from "react";
import { FileText, Trash2, Loader2, CheckCircle, AlertCircle, MoreVertical, Edit3 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUploadStore, type Upload as UploadFile, type UploadStatus } from "@/stores/uploadStore";

interface FileListProps {
  projectId: string;
  className?: string;
  onFileSelect?: (file: UploadFile) => void;
  onFileDelete?: (fileId: string) => void;
}

const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: "📄",
  word: "📝",
  ppt: "📊",
  video: "🎬",
  image: "🖼️",
  default: "📁",
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getStatusIcon(status: UploadStatus) {
  switch (status) {
    case "uploading":
    case "parsing":
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    case "ready":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "failed":
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    default:
      return <FileText className="w-4 h-4 text-muted-foreground" />;
  }
}

function getStatusText(file: UploadFile): string {
  switch (file.status) {
    case "uploading":
      return "上传中...";
    case "parsing":
      return `解析中 ${file.parseProgress || 0}%`;
    case "ready":
      return "已就绪";
    case "failed":
      return file.error || "处理失败";
    default:
      return "";
  }
}

export function FileList({
  projectId,
  className,
  onFileSelect,
  onFileDelete,
}: FileListProps) {
  const { uploads, fetchUploads, deleteUpload, annotateUpload, isLoading, error } = useUploadStore();

  const handleRefresh = useCallback(() => {
    fetchUploads(projectId);
  }, [projectId, fetchUploads]);

  const handleDelete = useCallback(async (fileId: string) => {
    await deleteUpload(fileId);
    onFileDelete?.(fileId);
  }, [deleteUpload, onFileDelete]);

  const handleAnnotate = useCallback(async (fileId: string, intent: string) => {
    await annotateUpload(fileId, intent);
  }, [annotateUpload]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          项目文件 ({uploads.length})
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "刷新"
          )}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
          {error}
        </div>
      )}

      {uploads.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>暂无上传文件</p>
        </div>
      ) : (
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            <AnimatePresence>
              {uploads.map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-2xl">
                      {FILE_TYPE_ICONS[file.fileType] || FILE_TYPE_ICONS.default}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {file.filename}
                        </p>
                        {getStatusIcon(file.status)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.size)}</span>
                        <span>·</span>
                        <span className="capitalize">{file.fileType}</span>
                        <span>·</span>
                        <span>{getStatusText(file)}</span>
                      </div>

                      {file.status === "ready" && file.parseDetails && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {file.parseDetails.pages_extracted !== undefined && (
                            <span>{file.parseDetails.pages_extracted} 页</span>
                          )}
                          {file.parseDetails.images_extracted !== undefined && (
                            <span>{file.parseDetails.images_extracted} 图片</span>
                          )}
                          {file.parseDetails.text_length !== undefined && (
                            <span>{file.parseDetails.text_length} 字符</span>
                          )}
                        </div>
                      )}

                      {file.usageIntent && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          用途：{file.usageIntent}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-2">
                    {(file.status === "uploading" || file.status === "parsing") && (
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${file.parseProgress || 0}%` }}
                        />
                      </div>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onFileSelect?.(file)}>
                          <FileText className="w-4 h-4 mr-2" />
                          查看详情
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const intent = prompt("请输入文件用途标注：", file.usageIntent || "");
                            if (intent !== null) {
                              handleAnnotate(file.id, intent);
                            }
                          }}
                        >
                          <Edit3 className="w-4 h-4 mr-2" />
                          添加标注
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(file.id)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
