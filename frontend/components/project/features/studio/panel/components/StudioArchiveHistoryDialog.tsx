"use client";

import { motion } from "framer-motion";
import { ArchiveRestore, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TOOL_LABELS } from "../../constants";
import type { StudioHistoryItem } from "../../history/types";

interface StudioArchiveHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  archivedHistory: StudioHistoryItem[];
  onUnarchiveHistoryItem: (id: string) => void;
}

export function StudioArchiveHistoryDialog({
  isOpen,
  onClose,
  archivedHistory,
  onUnarchiveHistoryItem,
}: StudioArchiveHistoryDialogProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[210] bg-[var(--project-overlay)] backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[220] flex items-start justify-center px-4 pt-20 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="flex w-full max-w-2xl max-h-[min(72vh,820px)] flex-col overflow-hidden rounded-[var(--project-menu-radius)] border border-[var(--project-menu-border)] bg-[var(--project-menu-bg)] shadow-[var(--project-menu-shadow)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[var(--project-control-border)] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--project-text-primary)]">
                归档历史记录
              </h3>
              <p className="text-xs text-[var(--project-text-muted)]">
                共 {archivedHistory.length} 条
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-[var(--project-chip-radius)] text-[var(--project-text-muted)] hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-text-primary)]"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {archivedHistory.length === 0 ? (
              <p className="rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-3 py-3 text-xs text-[var(--project-text-muted)]">
                暂无归档记录
              </p>
            ) : (
              <div className="space-y-2">
                {archivedHistory.map((item) => (
                  <div
                    key={`archive-panel-${item.id}`}
                    className="flex items-center gap-3 rounded-[var(--project-chip-radius)] border border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--project-text-primary)]">
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-[var(--project-text-muted)]">
                        {TOOL_LABELS[item.toolType] ?? item.toolType} · {new Date(item.createdAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 rounded-[var(--project-chip-radius)] border-[var(--project-control-border)] bg-[var(--project-surface)] text-xs text-[var(--project-text-muted)] hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-text-primary)]"
                      onClick={() => onUnarchiveHistoryItem(item.id)}
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      取消归档
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}

