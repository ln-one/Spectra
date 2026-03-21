"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, Download, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArtifactHistoryItem } from "@/lib/project-space";

interface SessionArtifactsProps {
  groupedArtifacts: Array<[string, ArtifactHistoryItem[]]>;
  toolLabels: Record<string, string>;
  onRefresh: () => void;
  onOpenArtifact: (item: ArtifactHistoryItem) => void;
  onExportArtifact: (artifactId: string) => void;
}

export function SessionArtifacts({
  groupedArtifacts,
  toolLabels,
  onRefresh,
  onOpenArtifact,
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
          历史生成成果
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
          {groupedArtifacts.map(([toolKey, items]) => (
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
              {items.slice(0, 3).map((item, index) => (
                <motion.div
                  key={item.artifactId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: index * 0.04 }}
                  className="flex items-center gap-2 rounded-xl bg-[var(--project-surface-muted)] p-2 transition-colors hover:brightness-95"
                >
                  <button
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--project-surface-elevated)] shadow-sm"
                    onClick={() => onOpenArtifact(item)}
                  >
                    {item.status === "completed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : item.status === "failed" ? (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-[var(--project-text-muted)]" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-[var(--project-text-primary)]">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-[var(--project-text-muted)]">
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg"
                    onClick={() => onExportArtifact(item.artifactId)}
                  >
                    <Download className="h-3.5 w-3.5 text-[var(--project-text-muted)]" />
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
