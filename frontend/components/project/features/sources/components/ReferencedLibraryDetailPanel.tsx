"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
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
import { getFileTypeFromExtension, getReadableLibraryName } from "../utils";
import type {
  ReferencedLibraryCitationTarget,
  ReferencedLibrarySession,
} from "../useReferencedLibraryDetail";

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
  citationTarget: ReferencedLibraryCitationTarget | null;
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

function relationLabel(value?: ProjectReference["relationType"]): string {
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
  const hiddenStates = new Set([
    "RENDERING",
    "AWAITING_OUTLINE_CONFIRM",
    "AWAITING_CONFIRM",
    "AWAITING_CONFIRMATION",
  ]);
  if (hiddenStates.has(upper)) return null;
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
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: string | number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border border-zinc-200/85 bg-white/92 p-4 shadow-[0_10px_24px_-24px_rgba(0,0,0,0.55)]",
        className
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-zinc-800">
          <Icon className="h-3.5 w-3.5 text-zinc-500" />
          {title}
        </p>
        {typeof count !== "undefined" ? (
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-500">
            {count}
          </span>
        ) : null}
      </div>
      <div className="min-h-0">{children}</div>
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
  citationTarget,
  onClose,
  onRefresh,
}: ReferencedLibraryDetailPanelProps) {
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const effectiveVersion = reference?.pinnedVersionId || "-";
  const showUpstreamWarning = false;
  const totalHistoryCount = historyByTool.reduce(
    (count, [, items]) => count + items.length,
    0
  );
  const normalizedTargetFilename = citationTarget?.filename?.trim() || "";
  const matchedFile = useMemo(
    () =>
      normalizedTargetFilename
        ? sourceFiles.find(
            (file) => (file.filename || "").trim() === normalizedTargetFilename
          ) || null
        : null,
    [normalizedTargetFilename, sourceFiles]
  );
  const hasCitationTarget = Boolean(citationTarget?.sourceLibraryId);
  const targetFileNotLoaded =
    Boolean(normalizedTargetFilename) && !loading && !matchedFile;

  useEffect(() => {
    if (!open || !matchedFile?.id) return;
    const frame = window.requestAnimationFrame(() => {
      fileRefs.current[matchedFile.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [matchedFile?.id, open]);

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="library-detail-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-transparent backdrop-blur-[7px]"
            onClick={onClose}
          />
          <motion.aside
            key="library-detail-panel"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed inset-y-3 left-3 right-3 z-[71] flex flex-col overflow-hidden rounded-3xl border border-white/75 bg-[color:var(--project-surface-elevated)] shadow-[0_28px_90px_-24px_rgba(0,0,0,0.4)] backdrop-blur-2xl md:bottom-4 md:left-auto md:right-4 md:top-4 md:w-[min(760px,calc(100vw-32px))]"
          >
            <ScrollArea className="min-h-0 flex-1 px-6 py-5">
              <div className="space-y-3 pb-6">
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/45 px-4 py-4 backdrop-blur-xl">
                  <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-400/15 blur-3xl" />
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50/85 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        <Library className="h-3 w-3" />
                        引用库详情
                      </p>
                      <h2
                        className="mt-2 truncate text-[30px] font-semibold leading-tight tracking-tight text-[var(--project-text-primary)]"
                        title={libraryDisplayName}
                      >
                        {libraryDisplayName}
                      </h2>
                      <p
                        className="mt-1 truncate font-mono text-xs text-zinc-500"
                        title={reference?.targetProjectId || "-"}
                      >
                        ID: {reference?.targetProjectId || "-"}
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
                        className="h-9 w-9 rounded-xl text-zinc-500 hover:bg-zinc-100/85"
                        title="关闭"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
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
                {hasCitationTarget ? (
                  <div className="rounded-2xl border border-sky-200/80 bg-sky-50/85 px-3.5 py-3 text-sm text-sky-900 shadow-[0_8px_30px_-28px_rgba(14,116,144,0.8)]">
                    <p className="font-semibold">
                      来自：{citationTarget?.filename || "当前资料库引用"}
                      {citationTarget?.pageNumber
                        ? ` / P${citationTarget.pageNumber}`
                        : ""}
                      {typeof citationTarget?.timestamp === "number"
                        ? ` / ${Math.round(citationTarget.timestamp)}s`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-sky-700">
                      {targetFileNotLoaded
                        ? "目标文件未在当前列表中，可能不在本次已加载范围内。"
                        : matchedFile
                          ? "已为你定位到该引用对应的文件。"
                          : "正在尝试定位该引用对应的文件。"}
                    </p>
                  </div>
                ) : null}

                <Section icon={BookOpen} title="引用状态概览" count="基础信息">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700">
                      <Link2 className="h-3 w-3" />
                      {relationLabel(reference?.relationType)}
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
                      <p className="text-xs uppercase tracking-wide text-zinc-500">
                        生效版本
                      </p>
                      <p
                        className="mt-0.5 truncate font-mono text-sm text-zinc-700"
                        title={effectiveVersion}
                      >
                        {effectiveVersion}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-zinc-500">
                        优先级
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-700">
                        <ArrowDownNarrowWide className="h-3.5 w-3.5 text-zinc-500" />
                        {reference?.priority ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-zinc-500">
                        创建时间
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-zinc-700">
                        {formatTime(reference?.createdAt)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-zinc-500">
                        最近同步
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-zinc-700">
                        {formatTime(reference?.updatedAt)}
                      </p>
                    </div>
                  </div>
                  {showUpstreamWarning ? (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/85 px-3 py-2 text-sm text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <p>上游版本已变化，当前固定引用可能与最新内容不一致。</p>
                    </div>
                  ) : null}
                </Section>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <Section
                    icon={Clock3}
                    title="会话列表"
                    count={sessions.length}
                    className="min-h-[320px]"
                  >
                    <ScrollArea className="h-[250px] pr-1 xl:h-[270px]">
                      <div className="space-y-1.5 pb-1">
                        {sessions.length === 0 ? (
                          <p className="text-sm text-zinc-500">暂无会话记录</p>
                        ) : (
                          sessions.slice(0, 20).map((session) => {
                            const state = sessionStateLabel(session.state);
                            return (
                              <div
                                key={session.id}
                                className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-2.5 py-2"
                              >
                                <p className="truncate text-sm font-semibold text-zinc-800">
                                  {session.title}
                                </p>
                                <p className="mt-0.5 text-sm text-zinc-600">
                                  {state ? `${state} · ` : ""}
                                  {formatTime(session.createdAt)}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </Section>

                  <Section
                    icon={FolderTree}
                    title="库工具生成记录"
                    count={totalHistoryCount}
                    className="min-h-[320px]"
                  >
                    <ScrollArea className="h-[250px] pr-1 xl:h-[270px]">
                      <div className="space-y-2 pb-1">
                        {historyByTool.length === 0 ? (
                          <p className="text-sm text-zinc-500">暂无生成记录</p>
                        ) : (
                          historyByTool.map(([toolKey, items]) => {
                            const toolLabel = TOOL_LABELS[toolKey] || toolKey;
                            const toolColor =
                              TOOL_COLORS[toolKey] || TOOL_COLORS.ppt;
                            const ToolIcon = TOOL_ICONS[toolKey] || FolderTree;
                            return (
                              <div key={toolKey} className="space-y-1">
                                <p
                                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide"
                                  style={{
                                    color: toolColor.primary,
                                    borderColor: toolColor.glow,
                                    backgroundColor: toolColor.soft,
                                  }}
                                >
                                  <ToolIcon className="h-3 w-3" />
                                  {toolLabel}
                                </p>
                                {items.slice(0, 4).map((item) => (
                                  <div
                                    key={item.artifactId}
                                    className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-2.5 py-2"
                                    style={{
                                      boxShadow: `inset 2px 0 0 ${toolColor.primary}`,
                                    }}
                                  >
                                    <p className="truncate text-sm font-semibold text-zinc-800">
                                      {item.title}
                                    </p>
                                    <p className="mt-0.5 text-sm text-zinc-600">
                                      {item.status} ·{" "}
                                      {formatTime(item.createdAt)}
                                    </p>
                                  </div>
                                ))}
                                <Separator className="mt-2 bg-zinc-200/70" />
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </Section>

                  <Section
                    icon={Link2}
                    title="该库的引用"
                    count={references.length}
                    className="min-h-[320px]"
                  >
                    <ScrollArea className="h-[250px] pr-1 xl:h-[270px]">
                      <div className="space-y-1 pb-1">
                        {references.length === 0 ? (
                          <p className="text-sm text-zinc-500">无引用库</p>
                        ) : (
                          references.slice(0, 20).map((item) => (
                            <div
                                key={item.id}
                              className="rounded-lg border border-zinc-200/70 bg-zinc-50 px-2 py-1.5 text-sm"
                            >
                              <span className="font-medium text-zinc-800">
                                {getReadableLibraryName(
                                  item.targetProjectName,
                                  item.targetProjectId
                                )}
                              </span>
                              <span className="ml-1 text-zinc-500">
                                · {item.relationType} · {item.mode}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </Section>

                  <Section
                    icon={Files}
                    title="该库文件"
                    count={sourceFiles.length}
                    className="min-h-[320px]"
                  >
                    <ScrollArea className="h-[250px] pr-1 xl:h-[270px]">
                      <div className="space-y-1 pb-1">
                        {sourceFiles.length === 0 ? (
                          <p className="text-sm text-zinc-500">
                            暂无文件或无权限查看
                          </p>
                        ) : (
                          sourceFiles.slice(0, 24).map((file) => {
                            const fileType = getFileTypeFromExtension(
                              file.filename
                            );
                            const fileConfig =
                              FILE_TYPE_CONFIG[fileType] ||
                              FILE_TYPE_CONFIG.other;
                            const FileIcon = fileConfig.icon;
                            return (
                              <div
                                key={file.id}
                                ref={(node) => {
                                  fileRefs.current[file.id] = node;
                                }}
                                className={cn(
                                  "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
                                  matchedFile?.id === file.id
                                    ? "border-sky-300 bg-sky-50 ring-1 ring-sky-200"
                                    : "border-zinc-200/70 bg-zinc-50"
                                )}
                                title={file.filename}
                              >
                                <span
                                  className={cn(
                                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                                    fileConfig.bgGradient
                                  )}
                                >
                                  <FileIcon
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      fileConfig.color
                                    )}
                                  />
                                </span>
                                <span className="truncate text-sm font-medium text-zinc-700">
                                  {file.filename}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </Section>
                </div>
              </div>
            </ScrollArea>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>,
    portalTarget
  );
}
