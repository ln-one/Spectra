"use client";

import { motion } from "framer-motion";
import { ArchiveRestore, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TOOL_LABELS } from "../../constants";
import type { StudioHistoryItem } from "../../history/types";
import {
  resolveHistoryStatusBadgeClass,
  resolveHistoryStatusText,
  resolveHistoryStatusVisual,
  resolveHistoryTypeColor,
  resolveHistoryTypeIcon,
} from "../../history/display";

interface StudioArchiveHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  archivedHistory: StudioHistoryItem[];
  onUnarchiveHistoryItem: (id: string) => void;
  onDeleteHistoryItem: (id: string) => void;
}

export function StudioArchiveHistoryDialog({
  isOpen,
  onClose,
  archivedHistory,
  onUnarchiveHistoryItem,
  onDeleteHistoryItem,
}: StudioArchiveHistoryDialogProps) {
  if (!isOpen) return null;

  const renderHistoryLeadingVisual = (item: StudioHistoryItem) => {
    const TypeIcon = resolveHistoryTypeIcon(item.toolType);
    const typeColor = resolveHistoryTypeColor(item.toolType);
    const statusVisual = resolveHistoryStatusVisual(item);
    const StatusIcon = statusVisual.icon;

    return (
      <div className="relative shrink-0">
        <div
          className="project-tool-icon flex h-9 w-9 items-center justify-center rounded-[var(--project-chip-radius)] border border-white/40 backdrop-blur-md"
          style={{
            background: `linear-gradient(135deg, ${typeColor.glow}, transparent)`,
            boxShadow: `0 8px 22px ${typeColor.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
          }}
        >
          <TypeIcon className="h-4 w-4" style={{ color: typeColor.primary }} />
        </div>
        <div
          className={cn(
            "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border",
            statusVisual.className
          )}
        >
          {StatusIcon ? (
            <StatusIcon className={statusVisual.iconClassName} />
          ) : (
            <span className={statusVisual.dotClassName} />
          )}
        </div>
      </div>
    );
  };

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
                    {renderHistoryLeadingVisual(item)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--project-text-primary)]">
                        {item.title}
                      </p>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[var(--project-text-muted)]">
                        <span className="truncate">
                          {TOOL_LABELS[item.toolType] ?? item.toolType}
                        </span>
                        <span className="shrink-0">·</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 whitespace-nowrap",
                            resolveHistoryStatusBadgeClass(item)
                          )}
                        >
                          {resolveHistoryStatusText(item)}
                        </span>
                        <span className="shrink-0">·</span>
                        <span className="truncate">
                          {new Date(item.createdAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 rounded-[var(--project-chip-radius)] border-[var(--project-control-border)] bg-[var(--project-surface)] text-xs text-[var(--project-text-muted)] hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-text-primary)]"
                        onClick={() => onUnarchiveHistoryItem(item.id)}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        取消归档
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 rounded-[var(--project-chip-radius)] border-red-200 bg-red-50 text-xs text-red-700 hover:bg-red-100 hover:text-red-800"
                        onClick={() => onDeleteHistoryItem(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
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
