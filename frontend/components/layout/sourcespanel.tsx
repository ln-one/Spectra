"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  FileText,
  Trash2,
  Search,
  Database,
  CheckCircle2,
  FileIcon,
  X,
  Sparkles,
} from "lucide-react";

interface FileItem {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  selected?: boolean;
}

interface SourcesPanelProps {
  projectId: string;
  files?: FileItem[];
  onFileUpload?: (files: File[]) => void;
  onFileDelete?: (fileId: string) => void;
  onFileSelect?: (fileId: string, selected: boolean) => void;
}

export function SourcesPanel({
  projectId: _projectId,
  files = [],
  onFileUpload,
  onFileDelete,
  onFileSelect,
}: SourcesPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [_isUploading, setIsUploading] = useState(false);

  const filteredFiles = files.filter((file) =>
    file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCount = files.filter((f) => f.selected).length;

  const handleUpload = useCallback(
    async (uploadedFiles: File[]) => {
      setIsUploading(true);
      try {
        onFileUpload?.(uploadedFiles);
      } finally {
        setIsUploading(false);
      }
    },
    [onFileUpload]
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes("pdf")) return "📄";
    if (fileType.includes("word") || fileType.includes("document")) return "📝";
    if (fileType.includes("image")) return "🖼️";
    if (fileType.includes("video")) return "🎬";
    return <FileIcon className="h-4 w-4" />;
  };

  return (
    <div className="flex flex-col h-full">
      {/* 标题 */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" />
            素材库
          </h3>
          {selectedCount > 0 && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
              {selectedCount} 已选
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          上传教学素材，用于 RAG 检索
        </p>
      </div>

      {/* 搜索栏 */}
      <div className="px-4 py-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索素材..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* 上传区域 */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              上传文件
            </h4>
            <label
              htmlFor="legacy-sources-upload"
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 px-4 py-6 text-center cursor-pointer hover:bg-accent/40 transition-colors"
            >
              <Upload className="mb-2 h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Drop files here or click to upload</span>
              <span className="mt-1 text-xs text-muted-foreground">
                Supports multiple files
              </span>
            </label>
            <input
              id="legacy-sources-upload"
              type="file"
              multiple
              className="hidden"
              onChange={async (e) => {
                const selectedFiles = e.target.files
                  ? Array.from(e.target.files)
                  : [];
                await handleUpload(selectedFiles);
                e.currentTarget.value = "";
              }}
            />
          </div>

          <Separator />

          {/* RAG 检索入口 */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Database className="h-4 w-4" />
              知识库检索
            </h4>
            <Button variant="outline" size="sm" className="w-full">
              <Search className="h-4 w-4 mr-2" />
              检索相关素材
            </Button>
          </div>

          <Separator />

          {/* 文件列表 */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              已上传文件
              <span className="text-muted-foreground font-normal">
                ({filteredFiles.length})
              </span>
            </h4>

            {filteredFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {searchQuery ? "没有找到相关文件" : "暂无上传文件"}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      file.selected
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-accent"
                    }`}
                  >
                    {/* 选择框 */}
                    <button
                      onClick={() => onFileSelect?.(file.id, !file.selected)}
                      className="shrink-0"
                    >
                      {file.selected ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2" />
                      )}
                    </button>

                    {/* 文件信息 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getFileIcon(file.file_type)} {file.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.file_size)} · {file.file_type}
                      </p>
                    </div>

                    {/* 删除按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => onFileDelete?.(file.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* 底部操作栏 */}
      {selectedCount > 0 && (
        <div className="p-4 border-t bg-muted/30">
          <Button className="w-full" size="sm">
            <Sparkles className="h-4 w-4 mr-2" />
            使用选中素材生成
          </Button>
        </div>
      )}
    </div>
  );
}
