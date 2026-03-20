"use client";

import { motion } from "framer-motion";
import { Globe } from "lucide-react";

export function WebSourceCard({ isCompact }: { isCompact: boolean }) {
  const hint = "网页检索（即将上线）\n入口预留中";

  if (isCompact) {
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
        className="group relative flex items-center justify-center rounded-xl p-2.5 transition-colors hover:bg-[var(--project-surface)]"
        style={{ minHeight: "52px" }}
        title={hint}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--project-surface)]">
          <Globe className="h-4 w-4 text-[var(--project-accent)]" />
        </div>
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
      className="grid grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-xl border border-[var(--project-border)] bg-[var(--project-surface-muted)] p-2.5 shadow-sm"
      style={{ minHeight: "52px" }}
      title={hint}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--project-border)] bg-[var(--project-surface-elevated)]">
        <Globe className="h-4 w-4 text-[var(--project-accent)]" />
      </div>
      <div className="min-w-0 flex flex-col justify-center">
        <p className="truncate text-xs font-medium text-[var(--project-text-primary)]">
          网页检索（即将上线）
        </p>
        <p className="mt-0.5 truncate text-[10px] text-[var(--project-text-muted)]">
          入口预留中
        </p>
      </div>
      <div className="flex items-center gap-1.5 border-l border-[var(--project-border)] pl-1.5">
        <div className="h-2 w-2 shrink-0 rounded-full bg-[var(--project-accent)]" />
      </div>
    </motion.div>
  );
}

