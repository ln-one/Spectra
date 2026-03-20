"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TabState = {
  loading: boolean;
  error: string | null;
};

interface PaneStateProps {
  state: TabState;
  hasData: boolean;
  emptyLabel: string;
  onRetry: () => void;
}

export function PaneState({
  state,
  hasData,
  emptyLabel,
  onRetry,
}: PaneStateProps) {
  if (state.loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-48 grid place-items-center text-zinc-500"
      >
        <div className="inline-flex items-center gap-2.5 rounded-full border border-zinc-200/50 bg-white/50 backdrop-blur-sm px-4 py-2 text-[13px] font-medium shadow-sm">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          加载中...
        </div>
      </motion.div>
    );
  }

  if (state.error) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="h-48 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-sm rounded-2xl border border-red-100/60 bg-red-50/40 backdrop-blur-sm p-5 text-center shadow-sm">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3 opacity-80" />
          <p className="mb-4 text-[13px] text-red-700/90 font-medium leading-relaxed">
            {state.error}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="bg-white/60 backdrop-blur-sm hover:bg-white/80 border-red-200/60 text-red-600 rounded-xl h-8 px-4"
          >
            重试
          </Button>
        </div>
      </motion.div>
    );
  }

  if (!hasData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-48 grid place-items-center p-4"
      >
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100/60 backdrop-blur-sm flex items-center justify-center mx-auto mb-3 border border-zinc-200/40">
            <Layers className="w-5 h-5 text-zinc-400" />
          </div>
          <p className="text-[13px] text-zinc-500 font-medium">{emptyLabel}</p>
        </div>
      </motion.div>
    );
  }

  return null;
}

interface RowCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}

export function RowCard({ title, subtitle, action, icon: Icon }: RowCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="group relative rounded-2xl border border-zinc-200/50 bg-white/40 hover:bg-white/60 p-3.5 shadow-sm hover:shadow-md hover:border-zinc-300/60 transition-all duration-300 backdrop-blur-sm"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-white/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
      <div className="flex items-start justify-between gap-4 relative z-10">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className="mt-0.5 shrink-0 p-2 rounded-xl bg-zinc-100/60 backdrop-blur-sm text-zinc-500 group-hover:text-zinc-900 group-hover:bg-zinc-100 transition-colors border border-zinc-200/40">
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-zinc-700 break-all leading-snug group-hover:text-zinc-900 transition-colors">
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 text-[11px] font-medium text-zinc-400 tracking-wide">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {action && (
          <div className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity mt-0.5">
            {action}
          </div>
        )}
      </div>
    </motion.div>
  );
}
