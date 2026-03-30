"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronUp, Sparkles, Trash2 } from "lucide-react";
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
          "group relative flex cursor-pointer items-center justify-center overflow-visible rounded-xl p-2.5 transition-all duration-200",
          isSelected
            ? "bg-[var(--project-surface)]"
            : "hover:bg-[var(--project-surface)]"
        )}
        style={{ minHeight: "52px" }}
        title={compactHint}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105",
            config.bgGradient
          )}
        >
          <Icon className={cn("h-4 w-4 transition-colors", config.color)} />
        </div>

        {isSelected ? (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--project-accent)] text-[var(--project-accent-text)] shadow-lg"
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </motion.div>
        ) : null}
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
        "group relative grid w-full max-w-full cursor-pointer grid-cols-[32px_1fr_auto] items-center gap-2.5 overflow-visible rounded-xl p-2.5 transition-all duration-200",
        isSelected
          ? "border border-[var(--project-border-strong)] bg-[var(--project-surface-elevated)] shadow-md ring-1 ring-[var(--project-border-strong)]/25"
          : "border border-[var(--project-border)] bg-[var(--project-surface-elevated)] shadow-sm hover:bg-[var(--project-surface)] hover:shadow-md"
      )}
      style={{ minHeight: "52px" }}
    >
      {isFocused ? (
        <motion.div
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 -z-10 rounded-2xl"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--project-accent) 8%, white), transparent 30%)",
          }}
        />
      ) : null}

      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105",
          config.bgGradient
        )}
      >
        <Icon className={cn("h-4 w-4 transition-colors", config.color)} />
      </div>

      <div className="min-w-0 flex flex-col justify-center">
        <p
          className="truncate text-xs font-medium text-[var(--project-text-primary)] transition-colors"
          title={file.filename}
        >
          {file.filename}
        </p>

        <p className="mt-0.5 truncate text-[10px] text-[var(--project-text-muted)]">
          {getFileStatusText(file)}
        </p>

        {file.status === "parsing" && file.parse_progress !== undefined ? (
          <div className="mt-1.5 w-full overflow-hidden">
            <div className="h-1 overflow-hidden rounded-full bg-[var(--project-surface-muted)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${file.parse_progress}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="h-full rounded-full bg-primary"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 border-l border-[var(--project-border)] pl-1.5">
        <div
          className={cn(
            "h-2 w-2 shrink-0 rounded-full transition-all",
            statusConfig.color,
            statusConfig.pulse && "animate-pulse"
          )}
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="h-6 w-6 shrink-0 rounded-md bg-[var(--project-surface-muted)] text-[var(--project-text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {isSelected ? (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--project-accent)] text-[var(--project-accent-text)] shadow-lg"
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </motion.div>
      ) : null}

      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            key={`expand-${file.id}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="col-span-3 mt-2 rounded-xl border border-[var(--project-border)] bg-[var(--project-surface-muted)] p-2.5 text-[11px] leading-relaxed text-[var(--project-text-primary)] shadow-inner relative group/expanded"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] text-[var(--project-text-muted)]">
                <Sparkles className="h-3 w-3" />
                <span>文件解析摘要</span>
              </div>

              {!(isFocused && focusDetail?.content) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCollapse();
                  }}
                  className="h-5 gap-1 rounded-full bg-white/80 backdrop-blur-sm px-2 text-[9px] font-black uppercase tracking-wider text-zinc-500 shadow-sm border border-zinc-200/50 hover:bg-white hover:text-zinc-900 transition-all active:scale-95"
                >
                  <ChevronUp className="h-2.5 w-2.5" />
                  收起
                </Button>
              )}
            </div>
            <div className="mt-1 text-[var(--project-text-primary)]">
              {getFileStatusText(file)}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded && isFocused && focusDetail?.content ? (
          <motion.div
            key={`focus-${focusDetail.chunk_id}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="col-span-3 mt-2 rounded-xl border border-[var(--project-border)] bg-[var(--project-surface-muted)] p-2.5 text-[11px] leading-relaxed text-[var(--project-text-primary)] shadow-inner relative group/expanded"
          >
            <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--project-text-muted)]">
              <div className="flex items-center gap-2">
                <span>引用片段</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCollapse();
                  }}
                  className="h-5 gap-1 rounded-full bg-white/80 backdrop-blur-sm px-2 text-[9px] font-black uppercase tracking-wider text-zinc-500 shadow-sm border border-zinc-200/50 hover:bg-white hover:text-zinc-900 transition-all active:scale-95"
                >
                  <ChevronUp className="h-2.5 w-2.5" />
                  收起内容
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                {focusDetail.source?.source_type ? (
                  <span>
                    {getSourceTypeLabel(focusDetail.source.source_type)}
                  </span>
                ) : null}
                {focusDetail.source?.page_number ? (
                  <span>页码 P{focusDetail.source.page_number}</span>
                ) : null}
                {focusTimestampSeconds !== null ? (
                  <span>{Math.round(focusTimestampSeconds)}s</span>
                ) : null}
              </div>
            </div>
            <div className="whitespace-pre-wrap text-[var(--project-text-primary)]">
              {focusDetail.content}
            </div>
            {focusDetail.context?.previous_chunk ||
            focusDetail.context?.next_chunk ? (
              <div className="mt-2 border-t border-[var(--project-border)] pt-2 text-[10px] text-[var(--project-text-muted)]">
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
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
