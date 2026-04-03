"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownNarrowWide,
  BookOpen,
  Clock3,
  Files,
  FolderTree,
  Library,
  Link2,
  Pin,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import type { ProjectReference } from "../../library/types";
import type { UploadedFile } from "../types";
import type { ReferencedLibrarySession } from "../useReferencedLibraryDetail";

interface ReferencedLibraryDetailPanelProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  libraryDisplayName: string;
  reference: ProjectReference | null;
  sessions: ReferencedLibrarySession[];
  historyByTool: Array<[string, ArtifactHistoryItem[]]>;
  references: ProjectReference[];
  sourceFiles: UploadedFile[];
  onClose: () => void;
  onRefresh: () => void;
}

const toolLabelMap: Record<string, string> = {
  ppt: "PPT",
  word: "Word",
  mindmap: "脑图",
  outline: "游戏",
  quiz: "测验",
  summary: "讲稿",
  animation: "动画",
  handout: "仿真",
};

function formatTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relationLabel(value?: ProjectReference["relation_type"]): string {
  if (value === "base") return "主基底";
  if (value === "auxiliary") return "辅助引用";
  return "-";
}

function modeLabel(value?: ProjectReference["mode"]): string {
  if (value === "follow") return "跟随更新";
  if (value === "pinned") return "固定版本";
  return "-";
}

function statusLabel(value?: ProjectReference["status"]): string {
  if (value === "active") return "已启用";
  if (value === "disabled") return "已停用";
  return "-";
}

export function ReferencedLibraryDetailPanel({
  open,
  loading,
  error,
  libraryDisplayName,
  reference,
  sessions,
  historyByTool,
  references,
  sourceFiles,
  onClose,
  onRefresh,
}: ReferencedLibraryDetailPanelProps) {
  const effectiveVersion =
    reference?.effective_target_version_id ||
    reference?.pinned_version_id ||
    reference?.upstream_current_version_id ||
    "-";
  const showUpstreamWarning = !!reference?.upstream_updated;
  const totalHistoryCount = historyByTool.reduce(
    (count, [, items]) => count + items.length,
    0
  );

  const sectionClass =
    "rounded-2xl border border-zinc-200/80 bg-white/88 p-4 shadow-[0_10px_24px_-22px_rgba(0,0,0,0.35)]";
  const titleRowClass = "mb-2 flex items-center justify-between gap-2";
  const titleClass = "flex items-center gap-1.5 text-xs font-semibold text-zinc-800";
  const countBadgeClass =
    "rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500";

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="library-detail-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-white/10 backdrop-blur-[6px]"
            onClick={onClose}
          />
          <motion.aside
            key="library-detail-panel"
            initial={{ x: 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed right-3 top-[72px] z-[71] flex h-[min(860px,calc(100dvh-84px))] w-[min(620px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-white/70 bg-[color:var(--project-surface-elevated)] shadow-[0_28px_90px_-24px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:right-4 md:top-[84px] md:h-[min(900px,calc(100dvh-100px))]"
          >
            <div className="relative shrink-0 border-b border-zinc-200/70 px-6 py-5">
              <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-400/12 blur-3xl" />
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
                      <Library className="h-4 w-4" />
                    </span>
                    <h3 className="truncate text-base font-semibold text-[var(--project-text-primary)]">
                      引用库详情
                    </h3>
                  </div>
                  <p
                    className="mt-1 truncate text-sm font-medium text-[var(--project-text-primary)]"
                    title={libraryDisplayName}
                  >
                    {libraryDisplayName}
                  </p>
                  <p
                    className="mt-0.5 truncate font-mono text-[11px] text-[var(--project-text-muted)]"
                    title={reference?.target_project_id || "-"}
                  >
                    {reference?.target_project_id || "-"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={onRefresh}
                    className="h-9 w-9 rounded-xl border-zinc-200/70 bg-white/80"
                    title="刷新"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onClose}
                    className="h-9 w-9 rounded-xl text-zinc-500 hover:bg-zinc-100"
                    title="关闭"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-6 py-5">
              <div className="space-y-4 pb-8">
                {error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {error}
                  </div>
                ) : null}
                {loading ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                    正在加载库详情...
                  </div>
                ) : null}

                <section className={sectionClass}>
                  <div className={titleRowClass}>
                    <p className={titleClass}>
                      <BookOpen className="h-3.5 w-3.5 text-zinc-500" />
                      引用状态概览
                    </p>
                    <span className={countBadgeClass}>基础信息</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700">
                      <Link2 className="h-3 w-3" />
                      {relationLabel(reference?.relation_type)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-700">
                      <Pin className="h-3 w-3" />
                      {modeLabel(reference?.mode)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      {statusLabel(reference?.status)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2">
                      <p className="text-[10px] text-zinc-500">生效版本</p>
                      <p
                        className="mt-0.5 truncate font-mono text-[11px] text-zinc-700"
                        title={effectiveVersion}
                      >
                        {effectiveVersion}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2">
                      <p className="text-[10px] text-zinc-500">优先级</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-700">
                        <ArrowDownNarrowWide className="h-3.5 w-3.5 text-zinc-500" />
                        {reference?.priority ?? 0}
                      </p>
                    </div>
                  </div>
                  {showUpstreamWarning ? (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/85 px-3 py-2 text-[11px] text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <p>上游版本已变化，当前固定引用可能与最新内容不一致。</p>
                    </div>
                  ) : null}
                </section>

                <section className={sectionClass}>
                  <div className={titleRowClass}>
                    <p className={titleClass}>
                      <Clock3 className="h-3.5 w-3.5 text-zinc-500" />
                      会话列表
                    </p>
                    <span className={countBadgeClass}>{sessions.length}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {sessions.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">暂无会话记录</p>
                    ) : (
                      sessions.slice(0, 12).map((session) => (
                        <div
                          key={session.id}
                          className="rounded-lg border border-zinc-200/70 bg-zinc-50 px-2.5 py-2 text-[11px] text-zinc-600"
                        >
                          <p className="truncate font-medium text-zinc-800">
                            {session.title}
                          </p>
                          <p className="mt-0.5">
                            {session.state} · {formatTime(session.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className={sectionClass}>
                  <div className={titleRowClass}>
                    <p className={titleClass}>
                      <FolderTree className="h-3.5 w-3.5 text-zinc-500" />
                      库工具生成记录
                    </p>
                    <span className={countBadgeClass}>{totalHistoryCount}</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {historyByTool.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">暂无生成记录</p>
                    ) : (
                      historyByTool.map(([toolKey, items]) => (
                        <div key={toolKey} className="space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            {toolLabelMap[toolKey] || toolKey}
                          </p>
                          {items.slice(0, 3).map((item) => (
                            <div
                              key={item.artifactId}
                              className="rounded-lg border border-zinc-200/70 bg-zinc-50 px-2.5 py-2 text-[11px] text-zinc-600"
                            >
                              <p className="truncate font-medium text-zinc-800">
                                {item.title}
                              </p>
                              <p className="mt-0.5">
                                {item.status} · {formatTime(item.createdAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className={sectionClass}>
                  <div className={titleRowClass}>
                    <p className={titleClass}>
                      <Files className="h-3.5 w-3.5 text-zinc-500" />
                      来源面板内容
                    </p>
                    <span className={countBadgeClass}>
                      {references.length + sourceFiles.length}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-[11px] text-zinc-600 md:grid-cols-2">
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-2.5">
                      <p className="mb-1 flex items-center justify-between gap-2 text-zinc-800">
                        <span>该库的引用</span>
                        <span className="text-[10px] text-zinc-500">
                          {references.length}
                        </span>
                      </p>
                      {references.length === 0 ? (
                        <p className="text-zinc-500">无引用库</p>
                      ) : (
                        <div className="space-y-1">
                          {references.slice(0, 8).map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg border border-zinc-200/70 bg-zinc-50 px-2 py-1.5"
                            >
                              {item.target_project_name?.trim() ||
                                item.target_project_id}
                              <span className="ml-1 text-zinc-500">
                                · {item.relation_type} · {item.mode}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-2.5">
                      <p className="mb-1 flex items-center justify-between gap-2 text-zinc-800">
                        <span>该库文件</span>
                        <span className="text-[10px] text-zinc-500">
                          {sourceFiles.length}
                        </span>
                      </p>
                      {sourceFiles.length === 0 ? (
                        <p className="text-zinc-500">暂无文件或无权限查看</p>
                      ) : (
                        <div className="space-y-1">
                          {sourceFiles.slice(0, 8).map((file) => (
                            <div
                              key={file.id}
                              className="truncate rounded-lg border border-zinc-200/70 bg-zinc-50 px-2 py-1.5"
                              title={file.filename}
                            >
                              {file.filename}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
