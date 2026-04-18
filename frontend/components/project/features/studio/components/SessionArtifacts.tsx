"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  Loader2,
  XCircle,
  RotateCw,
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

type HistoryDisplayState =
  | "outline_generating"
  | "outline_pending_confirm"
  | "slides_generating"
  | "slide_preview_ready"
  | "completed"
  | "failed"
  | "processing"
  | "previewing"
  | "pending"
  | "draft";

function resolveDisplayState(item: StudioHistoryItem): HistoryDisplayState {
  if (item.toolType === "ppt") {
    if (item.status === "failed") return "failed";
    if (item.status === "completed") return "completed";
    if (item.ppt_status) return item.ppt_status;
    if (item.status === "previewing") return "slide_preview_ready";
    if (item.status === "processing") return "slides_generating";
    if (item.status === "draft") return "outline_generating";
  }
  if (item.status === "completed") return "completed";
  if (item.status === "failed") return "failed";
  if (item.status === "processing") return "processing";
  if (item.status === "previewing") return "previewing";
  if (item.status === "pending") return "pending";
  return "draft";
}

function statusText(item: StudioHistoryItem): string {
  const state = resolveDisplayState(item);
  if (state === "outline_generating") return "大纲生成中";
  if (state === "outline_pending_confirm") return "大纲待确认";
  if (state === "slides_generating") return "课件生成中";
  if (state === "slide_preview_ready") return "单页可预览";
  if (state === "completed") {
    return item.toolType === "ppt" ? "已完成" : "可预览";
  }
  if (state === "failed") return "失败";
  if (state === "processing") return "生成中";
  if (state === "previewing") return "可预览";
  if (state === "pending") return "排队中";
  return "草稿中";
}

function statusIcon(item: StudioHistoryItem) {
  const state = resolveDisplayState(item);
  if (state === "completed" || state === "slide_preview_ready") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  }
  if (state === "failed") {
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  }
  if (state === "slides_generating" || state === "processing") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  }
  if (state === "outline_pending_confirm") {
    return <Clock3 className="h-3.5 w-3.5 text-orange-500" />;
  }
  if (state === "pending") {
    return <Clock3 className="h-3.5 w-3.5 text-zinc-500" />;
  }
  return <Clock3 className="h-3.5 w-3.5 text-amber-500" />;
}

function statusBadgeClass(item: StudioHistoryItem): string {
  const state = resolveDisplayState(item);
  if (state === "slides_generating" || state === "processing") {
    return "bg-blue-100 text-blue-700";
  }
  if (
    state === "completed" ||
    state === "previewing" ||
    state === "slide_preview_ready"
  ) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (state === "failed") {
    return "bg-red-100 text-red-700";
  }
  if (state === "pending") {
    return "bg-zinc-100 text-zinc-700";
  }
  if (state === "outline_pending_confirm") {
    return "bg-orange-100 text-orange-700";
  }
  return "bg-amber-100 text-amber-700";
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );

  const handleOpen = (item: StudioHistoryItem) => {
    void Promise.resolve(onOpenHistoryItem(item)).catch(() => {
      // Keep history interactions responsive even if navigation request fails.
    });
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      // 保证至少旋转 600ms，避免刷新动效过快闪烁
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

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
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--project-text-muted)] hover:text-[var(--project-text-primary)] transition-colors"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="刷新历史记录"
        >
          <RotateCw
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-500",
              isRefreshing && "animate-spin"
            )}
          />
        </Button>
      </div>
      <div className="space-y-2">
        <AnimatePresence>
          {groupedHistory.map(([toolKey, items]) =>
            (() => {
              const toolAccent = getToolAccentColor(toolKey);
              const isExpanded = Boolean(expandedTools[toolKey]);
              const canExpand = items.length > 4;
              const visibleItems = isExpanded ? items : items.slice(0, 4);

              return (
                <motion.div
                  key={toolKey}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--project-text-muted)]">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: toolAccent }}
                      />
                      <span>{toolLabels[toolKey] ?? toolKey}</span>
                    </p>
                    {canExpand ? (
                      <button
                        type="button"
                        className="inline-flex h-5 items-center gap-1 rounded-md px-1 text-[10px] text-[var(--project-text-muted)] transition-colors hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-text-primary)]"
                        onClick={() =>
                          setExpandedTools((prev) => ({
                            ...prev,
                            [toolKey]: !Boolean(prev[toolKey]),
                          }))
                        }
                        aria-label={isExpanded ? "收起历史记录" : "展开历史记录"}
                      >
                        <span>{isExpanded ? "收起" : "展开"}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "space-y-1.5",
                      isExpanded && "max-h-[20rem] overflow-y-auto pr-1"
                    )}
                  >
                    {visibleItems.map((item, index) => {
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
                            type="button"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--project-surface-elevated)] shadow-sm"
                            onClick={() => handleOpen(item)}
                          >
                            {statusIcon(item)}
                          </button>
                          <div className="flex flex-1 min-w-0 flex-col justify-center">
                            <p className="w-full truncate text-[11px] font-medium text-[var(--project-text-primary)]">
                              {item.title}
                            </p>
                            <p className="flex w-full min-w-0 items-center gap-1.5 text-[10px] text-[var(--project-text-muted)]">
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-1.5 py-0.5 whitespace-nowrap",
                                  statusBadgeClass(item)
                                )}
                              >
                                {statusText(item)}
                              </span>
                              <span
                                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: toolAccent }}
                              />
                              <span
                                className="min-w-0 flex-1 truncate whitespace-nowrap"
                                title={new Date(item.createdAt).toLocaleString(
                                  "zh-CN"
                                )}
                              >
                                {formatHistoryTime(item.createdAt)}
                              </span>
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg text-[var(--project-text-muted)]"
                              onClick={() => handleOpen(item)}
                              aria-label="查看预览"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>

                            <Button
                              type="button"
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
                  </div>
                </motion.div>
              );
            })()
          )}
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
