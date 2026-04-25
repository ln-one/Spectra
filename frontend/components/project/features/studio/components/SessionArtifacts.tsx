"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Eye,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LightDeleteConfirm } from "@/components/project/features/shared/LightDeleteConfirm";
import type { StudioHistoryItem } from "../history/types";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import {
  resolveHistoryStatusBadgeClass,
  resolveHistoryStatusText,
  resolveHistoryStatusVisual,
  resolveHistoryTypeColor,
  resolveHistoryTypeIcon,
} from "../history/display";

interface SessionArtifactsProps {
  groupedHistory: Array<[string, StudioHistoryItem[]]>;
  toolLabels: Record<string, string>;
  onRefresh: () => void;
  onOpenHistoryItem: (item: StudioHistoryItem) => void;
  onArchiveHistoryItem: (item: StudioHistoryItem) => void;
}

const TEMPLATE_TOOL_TYPES = new Set<GenerationToolType>([
  "ppt",
  "word",
  "mindmap",
  "quiz",
  "summary",
  "handout",
]);
const DEPOSITABLE_TOOL_TYPES = new Set<GenerationToolType>([
  "ppt",
  "word",
  "mindmap",
]);

function getToolAccentColor(toolKey: string): string {
  return resolveHistoryTypeColor(toolKey as GenerationToolType).primary;
}

function isRecentWorkCandidate(item: StudioHistoryItem): boolean {
  if (!TEMPLATE_TOOL_TYPES.has(item.toolType)) return false;
  return item.status === "completed" || item.status === "previewing";
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

function toArtifactIdRecord(artifactIds: string[]): Record<string, true> {
  return artifactIds.reduce<Record<string, true>>((acc, artifactId) => {
    const normalized = artifactId.trim();
    if (normalized) {
      acc[normalized] = true;
    }
    return acc;
  }, {});
}

function getJoinSourceKey(item: StudioHistoryItem): string {
  const artifactId = String(item.artifactId || "").trim();
  if (artifactId) return artifactId;
  if (item.toolType === "ppt") {
    const sessionId = String(item.sessionId || "").trim();
    const runId = String(item.runId || "").trim();
    const title = String(item.title || "").trim();
    return `fake-ppt:${sessionId || runId || title || "untitled"}`;
  }
  return "";
}

export function SessionArtifacts({
  groupedHistory,
  toolLabels,
  onRefresh,
  onOpenHistoryItem,
  onArchiveHistoryItem,
}: SessionArtifactsProps) {
  const [pendingArchiveItem, setPendingArchiveItem] =
    useState<StudioHistoryItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );
  const handleOpen = (item: StudioHistoryItem) => {
    void Promise.resolve(onOpenHistoryItem(item)).catch(() => {
      // Keep history interactions responsive even if navigation request fails.
    });
  };
  const [joinedArtifactIds, setJoinedArtifactIds] = useState<Record<string, true>>(
    {}
  );
  const [pendingJoinArtifactIds, setPendingJoinArtifactIds] = useState<
    Record<string, true>
  >({});
  const recentWork = groupedHistory
    .flatMap(([, items]) => items)
    .filter((item) => isRecentWorkCandidate(item))
    .slice(0, 5);

  useEffect(() => {
    const handleAdded = (event: Event) => {
      const detail = (
        event as CustomEvent<{ artifactId?: string; sourceKey?: string }>
      ).detail;
      const artifactId = String(detail?.artifactId || "").trim();
      const sourceKey = String(detail?.sourceKey || artifactId).trim();
      if (!sourceKey) return;
      setPendingJoinArtifactIds((prev) => {
        const next = { ...prev };
        delete next[sourceKey];
        return next;
      });
      setJoinedArtifactIds((prev) => ({ ...prev, [sourceKey]: true }));
    };
    const handleRemoved = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          artifactId?: string;
          sourceId?: string;
          sourceKey?: string;
        }>
      ).detail;
      const artifactId = String(detail?.artifactId || "").trim();
      const sourceKey = String(detail?.sourceKey || artifactId).trim();
      if (!sourceKey) return;
      setPendingJoinArtifactIds((prev) => {
        if (!prev[sourceKey]) return prev;
        const next = { ...prev };
        delete next[sourceKey];
        return next;
      });
      setJoinedArtifactIds((prev) => {
        if (!prev[sourceKey]) return prev;
        const next = { ...prev };
        delete next[sourceKey];
        return next;
      });
    };
    const handleSync = (event: Event) => {
      const artifactIds = Array.isArray(
        (
          event as CustomEvent<{ artifactIds?: string[]; sourceKeys?: string[] }>
        ).detail?.artifactIds
      )
        ? (
            event as CustomEvent<{ artifactIds?: string[]; sourceKeys?: string[] }>
          ).detail?.artifactIds ?? []
        : [];
      const sourceKeys = Array.isArray(
        (
          event as CustomEvent<{ artifactIds?: string[]; sourceKeys?: string[] }>
        ).detail?.sourceKeys
      )
        ? (
            event as CustomEvent<{ artifactIds?: string[]; sourceKeys?: string[] }>
          ).detail?.sourceKeys ?? []
        : [];
      setJoinedArtifactIds(toArtifactIdRecord([...artifactIds, ...sourceKeys]));
      setPendingJoinArtifactIds((prev) => {
        if (Object.keys(prev).length === 0) return prev;
        const next = { ...prev };
        for (const artifactId of Object.keys(next)) {
          if (artifactIds.includes(artifactId) || sourceKeys.includes(artifactId)) {
            delete next[artifactId];
          }
        }
        return next;
      });
    };
    window.addEventListener(
      "spectra:artifact-source-added",
      handleAdded as EventListener
    );
    window.addEventListener(
      "spectra:artifact-sources-sync",
      handleSync as EventListener
    );
    window.addEventListener(
      "spectra:artifact-source-removed",
      handleRemoved as EventListener
    );
    return () => {
      window.removeEventListener(
        "spectra:artifact-source-added",
        handleAdded as EventListener
      );
      window.removeEventListener(
        "spectra:artifact-sources-sync",
        handleSync as EventListener
      );
      window.removeEventListener(
        "spectra:artifact-source-removed",
        handleRemoved as EventListener
      );
    };
  }, []);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      // 保证至少旋转 600ms，避免刷新动效过快闪烁
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const handleJoinAsSource = (item: StudioHistoryItem) => {
    const artifactId = String(item.artifactId || "").trim();
    const sourceKey = getJoinSourceKey(item);
    if (!sourceKey || pendingJoinArtifactIds[sourceKey] || joinedArtifactIds[sourceKey]) {
      return;
    }
    setPendingJoinArtifactIds((prev) => ({ ...prev, [sourceKey]: true }));
    const surfaceKind =
      item.toolType === "ppt"
        ? "slides"
        : item.toolType === "word"
          ? "document"
          : item.toolType === "mindmap"
            ? "graph"
            : undefined;
    window.dispatchEvent(
      new CustomEvent("spectra:add-artifact-source", {
        detail: {
          artifactId,
          sourceKey,
          surfaceKind,
          title: item.title,
          fakeSource: item.toolType === "ppt",
          sessionId: item.sessionId ?? null,
          runId: item.runId ?? null,
          toolType: item.toolType,
        },
      })
    );
    window.setTimeout(() => {
      setPendingJoinArtifactIds((prev) => {
        if (!prev[sourceKey]) return prev;
        const next = { ...prev };
        delete next[sourceKey];
        return next;
      });
    }, 4000);
  };

  const renderHistoryLeadingVisual = (
    item: StudioHistoryItem,
    size: "recent" | "history" = "history"
  ) => {
    const TypeIcon = resolveHistoryTypeIcon(item.toolType);
    const typeColor = resolveHistoryTypeColor(item.toolType);
    const statusVisual = resolveHistoryStatusVisual(item);
    const StatusIcon = statusVisual.icon;
    const shellSize = size === "recent" ? 40 : 34;
    const iconSize = size === "recent" ? "h-4.5 w-4.5" : "h-4 w-4";

    return (
      <div className="relative shrink-0">
        <div
          className={cn(
            "project-tool-icon flex items-center justify-center rounded-[var(--project-chip-radius)] border border-white/40 backdrop-blur-md"
          )}
          style={{
            width: shellSize,
            height: shellSize,
            background: `linear-gradient(135deg, ${typeColor.glow}, transparent)`,
            boxShadow: `0 8px 22px ${typeColor.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
          }}
        >
          <TypeIcon className={iconSize} style={{ color: typeColor.primary }} />
        </div>
        <div
          className={cn(
            "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border",
            statusVisual.className
          )}
        >
          {StatusIcon ? (
            <StatusIcon className={statusVisual.iconClassName} />
          ) : (
            <span className={statusVisual.dotClassName} />
          )}
        </div>
      </div>
    );
  };

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
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--project-text-muted)] hover:text-[var(--project-text-primary)] transition-colors"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="刷新历史记录"
        >
          <RotateCw
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-500",
              isRefreshing && "animate-spin"
            )}
          />
        </Button>
      </div>
      <div className="space-y-3">
        {recentWork.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-[var(--project-text-muted)]">
              最近成果
            </p>
            {recentWork.map((item) => {
              return (
                <div
                  key={`recent-${item.id}`}
                  className="group flex items-center gap-2 rounded-xl border border-[var(--project-border)] bg-[var(--project-surface-elevated)] p-2 transition-colors hover:brightness-95"
                >
                  <button
                    className="shrink-0"
                    onClick={() => onOpenHistoryItem(item)}
                    aria-label="回到这个成果继续工作"
                  >
                    {renderHistoryLeadingVisual(item, "recent")}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-[var(--project-text-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-[var(--project-text-muted)]">
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 whitespace-nowrap",
                          resolveHistoryStatusBadgeClass(item)
                        )}
                      >
                        {resolveHistoryStatusText(item)}
                      </span>
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: getToolAccentColor(item.toolType) }}
                      />
                      <span className="min-w-0 truncate">
                        回到这个成果继续工作
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-[var(--project-text-muted)]"
                    onClick={() => onOpenHistoryItem(item)}
                    aria-label="继续这个成果"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {(Boolean(item.artifactId) && DEPOSITABLE_TOOL_TYPES.has(item.toolType)) ||
                  item.toolType === "ppt" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-lg px-2 text-[10px] text-[var(--project-text-muted)] hover:text-[var(--project-text-primary)]"
                      onClick={() => handleJoinAsSource(item)}
                      disabled={
                        pendingJoinArtifactIds[getJoinSourceKey(item)] ||
                        joinedArtifactIds[getJoinSourceKey(item)]
                      }
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      {joinedArtifactIds[getJoinSourceKey(item)]
                        ? "已加入来源"
                        : pendingJoinArtifactIds[getJoinSourceKey(item)]
                          ? "加入中"
                          : "加入来源"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--project-text-muted)]">
            历史记录
          </p>
          <AnimatePresence>
            {groupedHistory.map(([toolKey, items]) => {
              const toolAccent = getToolAccentColor(toolKey);
              const isExpanded = Boolean(expandedTools[toolKey]);
              const canExpand = items.length > 4;
              const visibleItems = isExpanded ? items : items.slice(0, 4);

              return (
                <motion.div
                  key={toolKey}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--project-text-muted)]">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: toolAccent }}
                      />
                      <span>{toolLabels[toolKey] ?? toolKey}</span>
                    </p>
                    {canExpand ? (
                      <button
                        type="button"
                        className="inline-flex h-5 items-center gap-1 rounded-md px-1 text-[10px] text-[var(--project-text-muted)] transition-colors hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-text-primary)]"
                        onClick={() =>
                          setExpandedTools((prev) => ({
                            ...prev,
                            [toolKey]: !prev[toolKey],
                          }))
                        }
                        aria-label={isExpanded ? "收起历史记录" : "展开历史记录"}
                      >
                        <span>{isExpanded ? "收起" : "展开"}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "space-y-1.5",
                      isExpanded && "max-h-[20rem] overflow-y-auto pr-1"
                    )}
                  >
                    {visibleItems.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ delay: index * 0.04 }}
                        className="group flex items-center gap-2 rounded-xl bg-[var(--project-surface-muted)] p-2 transition-colors hover:brightness-95"
                      >
                        <button
                          type="button"
                          className="shrink-0"
                          onClick={() => handleOpen(item)}
                          aria-label={`打开${toolLabels[item.toolType] ?? item.toolType}历史记录`}
                        >
                          {renderHistoryLeadingVisual(item)}
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                          <p className="w-full truncate text-[11px] font-medium text-[var(--project-text-primary)]">
                            {item.title}
                          </p>
                          <p className="flex w-full min-w-0 items-center gap-1.5 text-[10px] text-[var(--project-text-muted)]">
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-1.5 py-0.5 whitespace-nowrap",
                                resolveHistoryStatusBadgeClass(item)
                              )}
                            >
                              {resolveHistoryStatusText(item)}
                            </span>
                            <span
                              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: toolAccent }}
                            />
                            <span
                              className="min-w-0 flex-1 truncate whitespace-nowrap"
                              title={new Date(item.createdAt).toLocaleString(
                                "zh-CN"
                              )}
                            >
                              {formatHistoryTime(item.createdAt)}
                            </span>
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-[var(--project-text-muted)]"
                            onClick={() => handleOpen(item)}
                            aria-label="查看预览"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-[var(--project-text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
                            onClick={() => setPendingArchiveItem(item)}
                            aria-label="归档历史记录"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <LightDeleteConfirm
        open={Boolean(pendingArchiveItem)}
        title="归档历史记录"
        description={
          pendingArchiveItem
            ? `将「${pendingArchiveItem.title}」归档后，会从当前历史列表中移除。`
            : ""
        }
        confirmText="归档"
        kind="archive"
        onCancel={() => setPendingArchiveItem(null)}
        onConfirm={() => {
          if (!pendingArchiveItem) return;
          onArchiveHistoryItem(pendingArchiveItem);
          setPendingArchiveItem(null);
        }}
      />
    </motion.div>
  );
}
