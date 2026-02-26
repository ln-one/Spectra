"use client";

import { useCallback, useState } from "react";
import {
  Upload,
  File,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  useUploadStore,
  type Upload as UploadFile,
  type UploadStatus,
} from "@/stores/uploadStore";

interface FileUploadDropzoneProps {
  projectId?: string;
  onUpload?: (files: File[]) => void | Promise<void>;
  onUploadComplete?: (files: UploadFile[]) => void;
  acceptedTypes?: string[];
  maxSize?: number;
  multiple?: boolean;
}

const DEFAULT_ACCEPTED_TYPES = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "mp4",
  "webm",
  "avi",
  "mov",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
];

export function FileUploadDropzone({
  projectId,
  onUpload,
  onUploadComplete,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  maxSize = 104857600,
  multiple = true,
}: FileUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const {
    uploads,
    failedUploads,
    addUpload,
    addBatchUploads,
    isLoading,
    error,
    clearError,
    clearFailedUploads,
  } = useUploadStore();

  const validateFiles = useCallback(
    (files: File[]): File[] => {
      const exts = acceptedTypes.map((ext) => ext.toLowerCase());

      return files.filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !exts.includes(ext)) {
          return false;
        }
        if (file.size > maxSize) {
          return false;
        }
        return true;
      });
    },
    [acceptedTypes, maxSize]
  );

  const handleFilesSelected = useCallback(
    async (selectedFiles: File[]) => {
      const validFiles = validateFiles(selectedFiles);

      if (validFiles.length === 0) {
        return;
      }

      if (!projectId) {
        onUpload?.(validFiles);
        return;
      }

      if (multiple) {
        await addBatchUploads(projectId, validFiles);
      } else if (validFiles.length > 0) {
        await addUpload(projectId, validFiles[0]);
      }

      const uploadedFiles = useUploadStore.getState().uploads;
      onUploadComplete?.(uploadedFiles);
    },
    [
      projectId,
      multiple,
      addUpload,
      addBatchUploads,
      onUpload,
      onUploadComplete,
      validateFiles,
    ]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      handleFilesSelected(droppedFiles);
    },
    [handleFilesSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selectedFiles = Array.from(e.target.files);
        handleFilesSelected(selectedFiles);
        e.target.value = "";
      }
    },
    [handleFilesSelected]
  );

  const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
      case "uploading":
      case "parsing":
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case "ready":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <File className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusText = (upload: UploadFile): string => {
    switch (upload.status) {
      case "uploading":
        return "上传中...";
      case "parsing":
        return `解析中 ${upload.parseProgress || 0}%`;
      case "ready":
        return "已就绪";
      case "failed":
        return upload.error || "上传失败";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-6">
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-12 text-center transition-all",
          isDragging
            ? "border-primary bg-accent"
            : "border-border hover:border-muted-foreground",
          isLoading && "pointer-events-none opacity-50"
        )}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">上传文件</h3>
        <p className="text-sm text-muted-foreground mb-4">
          拖拽文件到此处，或点击选择文件
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          支持文件类型：{acceptedTypes.join(", ")}
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          最大文件大小：{Math.round(maxSize / 1024 / 1024)}MB
        </p>
        <input
          type="file"
          multiple={multiple}
          onChange={handleFileInput}
          className="hidden"
          id="file-upload"
          aria-label="选择文件"
          accept={acceptedTypes.map((ext) => `.${ext}`).join(",")}
        />
        <Button asChild disabled={isLoading}>
          <label htmlFor="file-upload" className="cursor-pointer">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                上传中...
              </>
            ) : (
              "选择文件"
            )}
          </label>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearError}
            className="ml-auto"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {failedUploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-orange-600">
              上传失败 ({failedUploads.length})
            </h4>
            <Button variant="ghost" size="sm" onClick={clearFailedUploads}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          {failedUploads.map((failed, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 text-sm text-orange-600 bg-orange-50 rounded"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{failed.filename}</span>
              <span className="text-xs opacity-75">- {failed.error}</span>
            </div>
          ))}
        </div>
      )}

      {uploads.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <h4 className="text-sm font-semibold">
            已上传文件 ({uploads.length})
          </h4>
          <div className="space-y-2">
            {uploads.map((upload) => (
              <Card
                key={upload.id}
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {getStatusIcon(upload.status)}
                  <div className="min-w-0">
                    <p className="text-sm truncate">{upload.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {getStatusText(upload)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(upload.status === "uploading" ||
                    upload.status === "parsing") &&
                    upload.parseProgress !== undefined && (
                      <Progress value={upload.parseProgress} className="w-20" />
                    )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      useUploadStore.getState().deleteUpload(upload.id)
                    }
                    className="h-8 w-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
