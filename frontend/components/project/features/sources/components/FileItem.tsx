"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FILE_TYPE_CONFIG, STATUS_CONFIG } from "../constants";
import type { SourceFocusDetail, UploadedFile } from "../types";
import {
  getFileStatusText,
  getFileTypeFromExtension,
  getSourceTypeLabel,
  toSeconds,
} from "../utils";

interface FileItemProps {
  file: UploadedFile;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isCompact: boolean;
  isFocused: boolean;
  focusDetail?: SourceFocusDetail | null;
  isExpanded: boolean;
  onCollapse: () => void;
}

export function FileItem({
  file,
  isSelected,
  onToggle,
  onDelete,
  isCompact,
  isFocused,
  focusDetail,
  isExpanded,
  onCollapse,
}: FileItemProps) {
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
          isSelected ? "bg-white/50" : "hover:bg-white/30"
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
              收起
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
              <span>文件解析摘要</span>
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
              <span>引用片段</span>
              <div className="flex items-center gap-1.5">
                {focusDetail.source?.source_type ? (
                  <span>{getSourceTypeLabel(focusDetail.source.source_type)}</span>
                ) : null}
                {focusDetail.source?.page_number ? (
                  <span>页码 P{focusDetail.source.page_number}</span>
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
                  <div className="mb-1">上文：{focusDetail.context.previous_chunk}</div>
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
