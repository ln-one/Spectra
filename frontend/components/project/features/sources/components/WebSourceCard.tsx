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
        className="group relative flex items-center justify-center p-2.5 rounded-xl hover:bg-white/30 transition-colors"
        style={{ minHeight: "52px" }}
        title={hint}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/50">
          <Globe className="w-4 h-4 text-blue-500" />
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
      className="grid grid-cols-[32px_1fr_auto] items-center gap-2.5 p-2.5 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-sm"
      style={{ minHeight: "52px" }}
      title={hint}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/80 border border-blue-100">
        <Globe className="w-4 h-4 text-blue-500" />
      </div>
      <div className="min-w-0 flex flex-col justify-center">
        <p className="text-xs font-medium text-zinc-800 truncate">
          网页检索（即将上线）
        </p>
        <p className="text-[10px] text-zinc-500 mt-0.5 truncate">入口预留中</p>
      </div>
      <div className="flex items-center gap-1.5 pl-1.5 border-l border-blue-100">
        <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
      </div>
    </motion.div>
  );
}
