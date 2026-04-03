"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Library, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import type { ProjectReference } from "../../library/types";
import type { UploadedFile } from "../types";

export interface ReferencedLibrarySession {
  id: string;
  title: string;
  state: string;
  createdAt: string;
}

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
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="library-detail-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/15 backdrop-blur-[1px]"
            onClick={onClose}
          />
          <motion.div
            key="library-detail-panel"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed right-6 top-[88px] bottom-6 z-[71] flex w-[460px] flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/90 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.18)] backdrop-blur-xl"
          >
            <div className="shrink-0 border-b border-zinc-200/70 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
                      <Library className="h-4 w-4" />
                    </span>
                    <h3 className="truncate text-sm font-semibold text-zinc-900">
                      引用库详情
                    </h3>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-600">
                    {libraryDisplayName}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={onRefresh}
                    className="h-8 w-8 rounded-xl border-zinc-200/70 bg-white/80"
                    title="刷新"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onClose}
                    className="h-8 w-8 rounded-xl text-zinc-500 hover:bg-zinc-100"
                    title="关闭"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-5 py-4">
              <div className="space-y-4 pb-6">
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

                <section className="rounded-xl border border-zinc-200/80 bg-white/80 p-3">
                  <p className="text-xs font-semibold text-zinc-800">简单信息</p>
                  <div className="mt-2 space-y-1.5 text-[11px] text-zinc-600">
                    <p>项目ID: {reference?.target_project_id || "-"}</p>
                    <p>
                      引用关系: {reference?.relation_type || "-"} ·{" "}
                      {reference?.mode || "-"}
                    </p>
                    <p>引用状态: {reference?.status || "-"}</p>
                    <p>引用时间: {formatTime(reference?.created_at)}</p>
                  </div>
                </section>

                <section className="rounded-xl border border-zinc-200/80 bg-white/80 p-3">
                  <p className="text-xs font-semibold text-zinc-800">会话列表</p>
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

                <section className="rounded-xl border border-zinc-200/80 bg-white/80 p-3">
                  <p className="text-xs font-semibold text-zinc-800">
                    库工具生成记录
                  </p>
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

                <section className="rounded-xl border border-zinc-200/80 bg-white/80 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                    <BookOpen className="h-3.5 w-3.5 text-zinc-500" />
                    来源面板内容
                  </p>
                  <div className="mt-2 space-y-2 text-[11px] text-zinc-600">
                    <div>
                      <p className="mb-1 text-zinc-800">该库的引用</p>
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
                    <div>
                      <p className="mb-1 text-zinc-800">该库文件</p>
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
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
