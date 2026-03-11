"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadDropzoneProps {
  onUpload?: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
}

export function FileUploadDropzone({
  onUpload,
  disabled = false,
}: FileUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || disabled) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;
      await onUpload?.(files);
    },
    [disabled, onUpload]
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDragging(false);
        await handleFiles(e.dataTransfer.files);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={cn(
        "rounded-lg border-2 border-dashed p-5 text-center transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-accent/40"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        disabled={disabled}
        className="hidden"
        onChange={async (e) => {
          await handleFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <Upload className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium">Drop files here or click to upload</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Supports multiple files
      </p>
    </div>
  );
}
