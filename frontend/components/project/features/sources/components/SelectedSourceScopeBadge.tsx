"use client";

import { useMemo } from "react";
import { Database, FileText } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { FILE_TYPE_CONFIG } from "../constants";
import { getFileTypeFromExtension } from "../utils";

interface SelectedSourceScopeBadgeProps {
  emptyModeLabel?: string;
  maxVisibleItems?: number;
  className?: string;
}

export function SelectedSourceScopeBadge({
  emptyModeLabel = "全部资料",
  maxVisibleItems = 5,
  className,
}: SelectedSourceScopeBadgeProps) {
  const selectedFileIds = useProjectStore((state) => state.selectedFileIds);
  const files = useProjectStore((state) => state.files);

  const selectedFiles = useMemo(() => {
    return selectedFileIds
      .map((id) => {
        const file = files?.find((f) => f.id === id);
        if (!file) {
          return {
            name: `未知文件 (${id.slice(0, 4)})`,
            Icon: FileText,
            iconClass: "text-[var(--project-text-muted)]",
          };
        }
        const fileType = getFileTypeFromExtension(file.filename);
        const config = FILE_TYPE_CONFIG[fileType] || FILE_TYPE_CONFIG.other;
        return {
          name: file.filename,
          Icon: config.icon,
          iconClass: config.color,
        };
      })
      .filter(Boolean);
  }, [selectedFileIds, files]);

  const isAll = selectedFileIds.length === 0;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <motion.div
          layout
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[var(--project-chip-radius,6px)] px-2 py-1 text-[11px] font-medium transition-all duration-300 cursor-default select-none shadow-sm",
            isAll
              ? "bg-[var(--project-surface-muted)] text-[var(--project-text-muted)] hover:bg-[var(--project-surface)] hover:text-[var(--project-text-primary)] border border-transparent"
              : "bg-blue-50/80 text-blue-600 hover:bg-blue-100/80 border border-transparent",
            className
          )}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {isAll ? (
              <motion.div
                key="all-icon"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="flex items-center"
              >
                <Database className="h-3.5 w-3.5 opacity-70" />
              </motion.div>
            ) : (
              <motion.div
                key="selected-icons"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="flex items-center -space-x-1 mr-0.5"
              >
                {selectedFiles.slice(0, 4).map((f, i) => {
                  const Icon = f.Icon;
                  return (
                    <motion.div
                      key={f.name + i}
                      initial={{ opacity: 0, scale: 0.5, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      transition={{
                        delay: i * 0.04,
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                      }}
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white shadow-sm relative ring-2 ring-blue-50/80"
                      style={{ zIndex: 10 - i }}
                    >
                      <Icon className={cn("h-2.5 w-2.5", f.iconClass)} />
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
          <motion.span layout className="ml-0.5">
            {isAll ? emptyModeLabel : `已选 ${selectedFileIds.length} 个文件`}
          </motion.span>
        </motion.div>
      </HoverCardTrigger>
      <HoverCardContent
        className="project-panel-card z-50 w-auto min-w-[160px] max-w-[240px] p-2.5 text-xs shadow-lg backdrop-blur-xl"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="space-y-1.5">
          <p className="font-semibold text-[var(--project-text-primary)] mb-1 px-0.5">
            {isAll ? "当前范围：全部可用资料" : "当前范围：手动指定的文件"}
          </p>
          {!isAll && (
            <div className="flex flex-col gap-1 text-[var(--project-text-primary)]/80">
              {selectedFiles.slice(0, maxVisibleItems).map((fileInfo, idx) => {
                const Icon = fileInfo.Icon;
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-1.5 px-0.5 truncate"
                  >
                    <Icon
                      className={cn(
                        "mt-[2px] h-3 w-3 shrink-0",
                        fileInfo.iconClass
                      )}
                    />
                    <span className="truncate">{fileInfo.name}</span>
                  </div>
                );
              })}
              {selectedFiles.length > maxVisibleItems && (
                <div className="text-[10px] text-[var(--project-text-muted)] pl-5 pt-0.5">
                  + 还有 {selectedFiles.length - maxVisibleItems} 个文件
                </div>
              )}
            </div>
          )}
          {isAll && (
            <p className="text-[11px] leading-relaxed text-[var(--project-text-muted)] px-0.5 mt-0.5">
              默认使用项目内的所有资料辅助生成。可在 Sources
              面板中勾选指定文件以缩小范围。
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
