"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LightDeleteConfirm } from "@/components/project/features/shared/LightDeleteConfirm";
import type { StudioHistoryItem } from "../history/types";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";

interface SessionArtifactsProps {
  groupedHistory: Array<[string, StudioHistoryItem[]]>;
  toolLabels: Record<string, string>;
  onRefresh: () => void;
  onOpenHistoryItem: (item: StudioHistoryItem) => void;
  onArchiveHistoryItem: (item: StudioHistoryItem) => void;
}

const TOOL_ACCENT_COLORS: Record<GenerationToolType, string> = {
  ppt: "#f97316",
  word: "#3b82f6",
  mindmap: "#14b8a6",
  outline: "#f43f5e",
  quiz: "#8b5cf6",
  summary: "#0ea5e9",
  animation: "#22c55e",
  handout: "#eab308",
};

function getToolAccentColor(toolKey: string): string {
  return (
    TOOL_ACCENT_COLORS[toolKey as GenerationToolType] ?? "var(--project-accent)"
  );
}

function statusText(status: StudioHistoryItem["status"]) {
  if (status === "completed") return "可预览";
  if (status === "failed") return "失败";
  if (status === "processing") return "生成中";
  if (status === "previewing") return "可预览";
  if (status === "pending") return "排队中";
  return "草稿中";
}

function statusIcon(status: StudioHistoryItem["status"]) {
  if (status === "completed") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  }
  if (status === "failed") {
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  }
  if (status === "processing") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  }
  if (status === "previewing") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  }
  if (status === "pending") {
    return <Clock3 className="h-3.5 w-3.5 text-zinc-500" />;
  }
  return <Clock3 className="h-3.5 w-3.5 text-amber-500" />;
}

export function SessionArtifacts({
  groupedHistory,
  toolLabels,
  onRefresh,
  onOpenHistoryItem,
  onArchiveHistoryItem,
}: SessionArtifactsProps) {
  const [pendingArchiveItem, setPendingArchiveItem] =
    useState<StudioHistoryItem | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="border-t border-[var(--project-border)] pt-2"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium text-[var(--project-text-muted)]">
          历史记录
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] text-[var(--project-text-muted)]"
          onClick={onRefresh}
        >
          刷新
        </Button>
      </div>
      <div className="space-y-2">
        <AnimatePresence>
          {groupedHistory.map(([toolKey, items]) => (
            (() => {
              const toolAccent = getToolAccentColor(toolKey);

              return (
                <motion.div
                  key={toolKey}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="space-y-1.5"
                >
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--project-text-muted)]">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: toolAccent }}
                    />
                    <span>{toolLabels[toolKey] ?? toolKey}</span>
                  </p>
                  {items.slice(0, 4).map((item, index) => {
                    const runNo = item.runNo ?? items.length - index;
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ delay: index * 0.04 }}
                        className="group flex items-center gap-2 rounded-xl bg-[var(--project-surface-muted)] p-2 transition-colors hover:brightness-95"
                      >
                        <button
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--project-surface-elevated)] shadow-sm"
                          onClick={() => onOpenHistoryItem(item)}
                        >
                          {statusIcon(item.status)}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium text-[var(--project-text-primary)]">
                            第 {runNo} 次 · {item.title}
                          </p>
                          <p className="flex items-center gap-1.5 text-[10px] text-[var(--project-text-muted)]">
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5",
                                item.status === "processing"
                                  ? "bg-blue-100 text-blue-700"
                                  : item.status === "previewing"
                                    ? "bg-emerald-100 text-emerald-700"
                                  : item.status === "pending"
                                    ? "bg-zinc-100 text-zinc-700"
                                  : item.status === "draft"
                                    ? "bg-amber-100 text-amber-700"
                                    : item.status === "failed"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-emerald-100 text-emerald-700"
                              )}
                            >
                              {statusText(item.status)}
                            </span>
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: toolAccent }}
                            />
                            <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-[var(--project-text-muted)]"
                            onClick={() => onOpenHistoryItem(item)}
                            aria-label="查看预览"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-[var(--project-text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
                            onClick={() => setPendingArchiveItem(item)}
                            aria-label="归档历史记录"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              );
            })()
          ))}
        </AnimatePresence>
      </div>

      <LightDeleteConfirm
        open={Boolean(pendingArchiveItem)}
        title="归档历史记录"
        description={
          pendingArchiveItem
            ? `将「${pendingArchiveItem.title}」归档后，会从当前历史列表中移除。`
            : ""
        }
        confirmText="归档"
        kind="archive"
        onCancel={() => setPendingArchiveItem(null)}
        onConfirm={() => {
          if (!pendingArchiveItem) return;
          onArchiveHistoryItem(pendingArchiveItem);
          setPendingArchiveItem(null);
        }}
      />
    </motion.div>
  );
}
