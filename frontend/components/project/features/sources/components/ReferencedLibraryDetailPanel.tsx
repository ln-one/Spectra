"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownNarrowWide,
  Library,
  Link2,
  Pin,
  RefreshCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectReference } from "../../library/types";

interface ReferencedLibraryDetailPanelProps {
  reference: ProjectReference;
  displayName: string;
  onClose: () => void;
}

function toDisplayTime(raw?: string): string {
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function resolveRelationLabel(value: ProjectReference["relation_type"]): string {
  return value === "base" ? "主基底" : "辅助引用";
}

function resolveModeLabel(value: ProjectReference["mode"]): string {
  return value === "follow" ? "跟随更新" : "固定版本";
}

function resolveStatusLabel(value: ProjectReference["status"]): string {
  return value === "active" ? "已启用" : "已停用";
}

export function ReferencedLibraryDetailPanel({
  reference,
  displayName,
  onClose,
}: ReferencedLibraryDetailPanelProps) {
  const effectiveVersion =
    reference.effective_target_version_id ||
    reference.pinned_version_id ||
    reference.upstream_current_version_id ||
    "-";

  const statusToneClass =
    reference.status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-zinc-200 bg-zinc-50 text-zinc-500";

  return (
    <motion.div
      key={`library-detail-${reference.id}`}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto rounded-2xl border border-[var(--project-border-strong)] bg-[var(--project-surface-elevated)] p-4 shadow-[0_18px_48px_-24px_rgba(0,0,0,0.35)] backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-yellow-100 text-amber-700 shadow-sm">
            <Library className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.08em] text-[var(--project-text-muted)]">
              引用库详情
            </p>
            <p
              className="truncate text-sm font-semibold text-[var(--project-text-primary)]"
              title={displayName}
            >
              {displayName}
            </p>
            <p
              className="mt-0.5 truncate text-[11px] text-[var(--project-text-muted)]"
              title={reference.target_project_id}
            >
              {reference.target_project_id}
            </p>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-lg text-[var(--project-text-muted)]"
          onClick={onClose}
          title="关闭详情"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700">
          <Link2 className="h-3 w-3" />
          {resolveRelationLabel(reference.relation_type)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-700">
          <Pin className="h-3 w-3" />
          {resolveModeLabel(reference.mode)}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 ${statusToneClass}`}
        >
          {resolveStatusLabel(reference.status)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-zinc-200/70 bg-white/70 px-2.5 py-2">
          <p className="text-[10px] text-zinc-500">生效版本</p>
          <p
            className="mt-0.5 truncate font-mono text-[11px] text-zinc-700"
            title={effectiveVersion}
          >
            {effectiveVersion}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200/70 bg-white/70 px-2.5 py-2">
          <p className="text-[10px] text-zinc-500">优先级</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-700">
            <ArrowDownNarrowWide className="h-3.5 w-3.5 text-zinc-500" />
            {reference.priority ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200/70 bg-white/70 px-2.5 py-2">
          <p className="text-[10px] text-zinc-500">创建时间</p>
          <p className="mt-0.5 text-[11px] text-zinc-700">
            {toDisplayTime(reference.created_at)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200/70 bg-white/70 px-2.5 py-2">
          <p className="text-[10px] text-zinc-500">最近同步</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-zinc-700">
            <RefreshCcw className="h-3 w-3 text-zinc-500" />
            {toDisplayTime(reference.updated_at)}
          </p>
        </div>
      </div>

      {reference.upstream_updated ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>上游版本已变化，当前引用可能与最新内容不一致。</p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-[var(--project-text-muted)]">
          点击其他库卡片可快速切换详情。
        </p>
      )}
    </motion.div>
  );
}
