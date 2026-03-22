"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock3, Download, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StudioHistoryItem } from "../history/types";

interface SessionArtifactsProps {
  groupedHistory: Array<[string, StudioHistoryItem[]]>;
  toolLabels: Record<string, string>;
  onRefresh: () => void;
  onOpenHistoryItem: (item: StudioHistoryItem) => void;
  onExportArtifact: (artifactId: string) => void;
}

function statusText(status: StudioHistoryItem["status"]) {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "processing") return "生成中";
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
  return <Clock3 className="h-3.5 w-3.5 text-amber-500" />;
}

export function SessionArtifacts({
  groupedHistory,
  toolLabels,
  onRefresh,
  onOpenHistoryItem,
  onExportArtifact,
}: SessionArtifactsProps) {
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
            <motion.div
              key={toolKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-1.5"
            >
              <p className="text-[10px] uppercase tracking-wide text-[var(--project-text-muted)]">
                {toolLabels[toolKey] ?? toolKey}
              </p>
              {items.slice(0, 4).map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: index * 0.04 }}
                  className="flex items-center gap-2 rounded-xl bg-[var(--project-surface-muted)] p-2 transition-colors hover:brightness-95"
                >
                  <button
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--project-surface-elevated)] shadow-sm"
                    onClick={() => onOpenHistoryItem(item)}
                  >
                    {statusIcon(item.status)}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-[var(--project-text-primary)]">
                      {item.title}
                    </p>
                    <p className="flex items-center gap-1.5 text-[10px] text-[var(--project-text-muted)]">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5",
                          item.status === "processing"
                            ? "bg-blue-100 text-blue-700"
                            : item.status === "draft"
                              ? "bg-amber-100 text-amber-700"
                              : item.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-700"
                        )}
                      >
                        {statusText(item.status)}
                      </span>
                      <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                    </p>
                  </div>
                  {item.artifactId ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg"
                      onClick={() => {
                        if (!item.artifactId) return;
                        onExportArtifact(item.artifactId);
                      }}
                    >
                      <Download className="h-3.5 w-3.5 text-[var(--project-text-muted)]" />
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className="h-7 rounded-lg border border-[var(--project-control-border)] px-2 text-[10px] text-[var(--project-text-muted)]"
                      onClick={() => onOpenHistoryItem(item)}
                    >
                      继续
                    </button>
                  )}
                </motion.div>
              ))}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
