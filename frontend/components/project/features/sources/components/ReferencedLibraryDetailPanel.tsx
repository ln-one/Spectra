"use client";

import type { ReactNode } from "react";
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
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import { TOOL_COLORS, TOOL_ICONS, TOOL_LABELS } from "../../studio/constants";
import { FILE_TYPE_CONFIG } from "../constants";
import type { ProjectReference } from "../../library/types";
import type { UploadedFile } from "../types";
import { getFileTypeFromExtension } from "../utils";
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

function sessionStateLabel(value?: string): string | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === "RENDERING") return null;
  if (upper === "COMPLETED" || upper === "SUCCEEDED") return "已完成";
  if (upper === "FAILED") return "失败";
  if (upper === "RUNNING") return "进行中";
  if (upper === "PENDING") return "排队中";
  return value;
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: string | number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200/85 bg-white/90 p-4 shadow-[0_10px_24px_-24px_rgba(0,0,0,0.55)]">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-zinc-800">
          <Icon className="h-3.5 w-3.5 text-zinc-500" />
          {title}
        </p>
        {typeof count !== "undefined" ? (
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
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
  const summaryStats = [
    { label: "会话", value: sessions.length },
    { label: "记录", value: totalHistoryCount },
    { label: "引用", value: references.length },
    { label: "文件", value: sourceFiles.length },
  ];

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="library-detail-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-transparent backdrop-blur-[5px]"
            onClick={onClose}
          />
          <motion.aside
            key="library-detail-panel"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed inset-y-3 left-3 right-3 z-[71] flex flex-col overflow-hidden rounded-3xl border border-white/75 bg-[color:var(--project-surface-elevated)] shadow-[0_28px_90px_-24px_rgba(0,0,0,0.4)] backdrop-blur-2xl md:bottom-4 md:left-auto md:right-4 md:top-4 md:w-[min(680px,calc(100vw-32px))]"
          >
            <div className="relative shrink-0 border-b border-zinc-200/70 bg-gradient-to-br from-amber-50/65 via-white/95 to-white px-6 py-5">
              <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-400/12 blur-3xl" />
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200/75 bg-amber-100/70 text-amber-700">
                      <Library className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="truncate text-lg font-semibold tracking-tight text-[var(--project-text-primary)]">
                      引用库详情
                    </h3>
                  </div>
                  <p
                    className="mt-1.5 truncate text-sm font-semibold text-[var(--project-text-primary)]"
                    title={libraryDisplayName}
                  >
                    {libraryDisplayName}
                  </p>
                  <p
                    className="mt-0.5 truncate font-mono text-[11px] text-zinc-500"
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
              <div className="relative z-10 mt-4 grid grid-cols-4 gap-2">
                {summaryStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-zinc-200/80 bg-white/85 px-2.5 py-2 text-center"
                  >
                    <p className="text-[10px] text-zinc-500">{stat.label}</p>
                    <p className="mt-0.5 text-sm font-semibold text-zinc-800">
                      {stat.value}
                    </p>
                  </div>
                ))}
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

                <Section icon={BookOpen} title="引用状态概览" count="基础信息">
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
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                        生效版本
                      </p>
                      <p
                        className="mt-0.5 truncate font-mono text-[11px] text-zinc-700"
                        title={effectiveVersion}
                      >
                        {effectiveVersion}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                        优先级
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-700">
                        <ArrowDownNarrowWide className="h-3.5 w-3.5 text-zinc-500" />
                        {reference?.priority ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                        创建时间
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-zinc-700">
                        {formatTime(reference?.created_at)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                        最近同步
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-zinc-700">
                        {formatTime(reference?.updated_at)}
                      </p>
                    </div>
                  </div>
                  {showUpstreamWarning ? (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/85 px-3 py-2 text-[11px] text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <p>上游版本已变化，当前固定引用可能与最新内容不一致。</p>
                    </div>
                  ) : null}
                </Section>

                <Section icon={Clock3} title="会话列表" count={sessions.length}>
                  <div className="mt-1 space-y-1.5">
                    {sessions.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">暂无会话记录</p>
                    ) : (
                      sessions.slice(0, 12).map((session) => {
                        const state = sessionStateLabel(session.state);
                        return (
                          <div
                            key={session.id}
                            className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-2.5 py-2"
                          >
                            <p className="truncate text-[11px] font-semibold text-zinc-800">
                              {session.title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-600">
                              {state ? `${state} · ` : ""}
                              {formatTime(session.createdAt)}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Section>

                <Section
                  icon={FolderTree}
                  title="库工具生成记录"
                  count={totalHistoryCount}
                >
                  <div className="mt-1 space-y-2">
                    {historyByTool.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">暂无生成记录</p>
                    ) : (
                      historyByTool.map(([toolKey, items]) => {
                        const toolLabel = TOOL_LABELS[toolKey] || toolKey;
                        const toolColor = TOOL_COLORS[toolKey] || TOOL_COLORS.ppt;
                        const ToolIcon = TOOL_ICONS[toolKey] || FolderTree;
                        return (
                          <div key={toolKey} className="space-y-1">
                            <p
                              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide"
                              style={{
                                color: toolColor.primary,
                                borderColor: toolColor.glow,
                                backgroundColor: toolColor.soft,
                              }}
                            >
                              <ToolIcon className="h-3 w-3" />
                              {toolLabel}
                            </p>
                            {items.slice(0, 3).map((item) => (
                              <div
                                key={item.artifactId}
                                className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-2.5 py-2"
                                style={{
                                  boxShadow: `inset 2px 0 0 ${toolColor.primary}`,
                                }}
                              >
                                <p className="truncate text-[11px] font-semibold text-zinc-800">
                                  {item.title}
                                </p>
                                <p className="mt-0.5 text-[11px] text-zinc-600">
                                  {item.status} · {formatTime(item.createdAt)}
                                </p>
                              </div>
                            ))}
                            <Separator className="mt-2 bg-zinc-200/70" />
                          </div>
                        );
                      })
                    )}
                  </div>
                </Section>

                <Section
                  icon={Files}
                  title="来源面板内容"
                  count={references.length + sourceFiles.length}
                >
                  <div className="mt-1 grid gap-2 text-[11px] text-zinc-600 md:grid-cols-2">
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-2.5">
                      <p className="mb-1 flex items-center justify-between gap-2 text-zinc-800">
                        <span className="font-semibold">该库的引用</span>
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
                              className="rounded-lg border border-zinc-200/70 bg-zinc-50 px-2 py-1.5 text-[11px]"
                            >
                              <span className="font-medium text-zinc-800">
                                {item.target_project_name?.trim() ||
                                  item.target_project_id}
                              </span>
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
                        <span className="font-semibold">该库文件</span>
                        <span className="text-[10px] text-zinc-500">
                          {sourceFiles.length}
                        </span>
                      </p>
                      {sourceFiles.length === 0 ? (
                        <p className="text-zinc-500">暂无文件或无权限查看</p>
                      ) : (
                        <div className="space-y-1">
                          {sourceFiles.slice(0, 8).map((file) => {
                            const fileType = getFileTypeFromExtension(file.filename);
                            const fileConfig =
                              FILE_TYPE_CONFIG[fileType] || FILE_TYPE_CONFIG.other;
                            const FileIcon = fileConfig.icon;
                            return (
                              <div
                                key={file.id}
                                className="flex items-center gap-2 rounded-lg border border-zinc-200/70 bg-zinc-50 px-2 py-1.5"
                                title={file.filename}
                              >
                                <span
                                  className={cn(
                                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                                    fileConfig.bgGradient
                                  )}
                                >
                                  <FileIcon
                                    className={cn("h-3.5 w-3.5", fileConfig.color)}
                                  />
                                </span>
                                <span className="truncate text-[11px] font-medium text-zinc-700">
                                  {file.filename}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              </div>
            </ScrollArea>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
