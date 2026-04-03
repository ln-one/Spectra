"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  Check,
  CircleOff,
  Library,
  Link as LinkIcon,
  Plus,
  RefreshCw,
  ToggleLeft,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaneState, RowCard, type TabState } from "../shared";
import type { AvailableLibraryProject, ProjectReference } from "../types";

interface ReferencesTabProps {
  projectId: string;
  references: ProjectReference[];
  state: TabState;
  librariesState: TabState;
  availableLibraries: AvailableLibraryProject[];
  newReferenceTarget: string;
  setNewReferenceTarget: (value: string) => void;
  newReferenceRelationType: "base" | "auxiliary";
  setNewReferenceRelationType: (value: "base" | "auxiliary") => void;
  newReferenceMode: "follow" | "pinned";
  setNewReferenceMode: (value: "follow" | "pinned") => void;
  newReferencePinnedVersion: string;
  setNewReferencePinnedVersion: (value: string) => void;
  newReferencePriority: string;
  setNewReferencePriority: (value: string) => void;
  onAddReference: () => void;
  onDeleteReference: (referenceId: string) => void;
  onToggleReferenceStatus: (
    referenceId: string,
    currentStatus: ProjectReference["status"]
  ) => void;
  onUpdateReferencePriority: (referenceId: string, priority: number) => void;
  onQuickAddReference: (
    targetProjectId: string,
    options?: { pinnedVersionId?: string | null }
  ) => void;
  onReload: () => void;
  onReloadLibraries: () => void;
}

export function ReferencesTab({
  projectId,
  references,
  state,
  librariesState,
  availableLibraries,
  newReferenceTarget,
  setNewReferenceTarget,
  newReferenceRelationType,
  setNewReferenceRelationType,
  newReferenceMode,
  setNewReferenceMode,
  newReferencePinnedVersion,
  setNewReferencePinnedVersion,
  newReferencePriority,
  setNewReferencePriority,
  onAddReference,
  onDeleteReference,
  onToggleReferenceStatus,
  onUpdateReferencePriority,
  onQuickAddReference,
  onReload,
  onReloadLibraries,
}: ReferencesTabProps) {
  const [libraryKeyword, setLibraryKeyword] = useState("");
  const normalizedKeyword = libraryKeyword.trim().toLowerCase();

  const referencedTargetIds = useMemo(
    () =>
      new Set(
        references
          .filter((reference) => reference.status === "active")
          .map((reference) => reference.target_project_id)
      ),
    [references]
  );

  const hasActiveBaseReference = useMemo(
    () =>
      references.some(
        (reference) =>
          reference.status === "active" && reference.relation_type === "base"
      ),
    [references]
  );

  const visibleLibraries = useMemo(
    () =>
      availableLibraries.filter((project) => {
        if (!normalizedKeyword) return true;
        const text = `${project.name} ${project.id} ${project.description}`.toLowerCase();
        return text.includes(normalizedKeyword);
      }),
    [availableLibraries, normalizedKeyword]
  );

  const quickAddDisabledByBaseRule =
    newReferenceRelationType === "base" && hasActiveBaseReference;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--project-border-strong)] bg-[var(--project-surface-elevated)] p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--project-accent)] text-[var(--project-accent-text)]">
            <Library className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--project-text-primary)]">
              引入库
            </p>
            <p className="text-xs text-[var(--project-text-muted)]">
              将引用库作为来源接入当前项目
            </p>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          <Input
            value={newReferenceTarget}
            onChange={(event) => setNewReferenceTarget(event.target.value)}
            placeholder="输入要引入的 target_project_id"
            className="col-span-3 h-9 rounded-xl border-zinc-200/60 bg-white/50 backdrop-blur-sm focus-visible:ring-zinc-400/20 focus-visible:border-zinc-300 shadow-sm transition-all"
          />
          <select
            value={newReferenceRelationType}
            onChange={(event) =>
              setNewReferenceRelationType(
                event.target.value as "base" | "auxiliary"
              )
            }
            className="col-span-1 h-9 rounded-xl border border-zinc-200/60 bg-white/60 px-2 text-xs"
          >
            <option value="base">主基底</option>
            <option value="auxiliary">辅助</option>
          </select>
          <select
            value={newReferenceMode}
            onChange={(event) =>
              setNewReferenceMode(event.target.value as "follow" | "pinned")
            }
            className="col-span-1 h-9 rounded-xl border border-zinc-200/60 bg-white/60 px-2 text-xs"
          >
            <option value="follow">follow</option>
            <option value="pinned">pinned</option>
          </select>
          <Input
            value={newReferencePriority}
            onChange={(event) => setNewReferencePriority(event.target.value)}
            placeholder="优先级"
            className="col-span-1 h-9 rounded-xl border-zinc-200/60 bg-white/50 text-xs"
          />
          {newReferenceMode === "pinned" ? (
            <Input
              value={newReferencePinnedVersion}
              onChange={(event) =>
                setNewReferencePinnedVersion(event.target.value)
              }
              placeholder="pinned_version_id"
              className="col-span-4 h-9 rounded-xl border-zinc-200/60 bg-white/50 text-xs"
            />
          ) : null}
          <Button
            size="sm"
            onClick={onAddReference}
            className="h-9 rounded-xl shadow-sm bg-zinc-600 hover:bg-zinc-700"
          >
            <Plus className="mr-1 h-4 w-4" />
            引入
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={onReload}
            className="h-9 w-9 rounded-xl border-zinc-200/60 bg-white/50 shadow-sm backdrop-blur-sm hover:border-zinc-300 hover:bg-white/80"
          >
            <RefreshCw className="h-4 w-4 text-zinc-500" />
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200/60 bg-white/40 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--project-text-primary)]">
              库列表（数据库）
            </p>
            <p className="text-xs text-[var(--project-text-muted)]">
              当前可见项目库，可直接点击引入
            </p>
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={onReloadLibraries}
            className="h-8 w-8 rounded-xl border-zinc-200/60 bg-white/60"
            title="刷新库列表"
          >
            <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
          </Button>
        </div>

        <Input
          value={libraryKeyword}
          onChange={(event) => setLibraryKeyword(event.target.value)}
          placeholder="按名称或 ID 过滤库"
          className="mb-3 h-9 rounded-xl border-zinc-200/60 bg-white/70"
        />

        <PaneState
          state={librariesState}
          hasData={visibleLibraries.length > 0}
          emptyLabel="暂无可展示库。"
          onRetry={onReloadLibraries}
        />

        {!librariesState.loading &&
        !librariesState.error &&
        visibleLibraries.length > 0 ? (
          <div className="space-y-2">
            {visibleLibraries.map((project) => {
              const isReferenced = referencedTargetIds.has(project.id);
              const disableForPinnedMode =
                newReferenceMode === "pinned" && !project.currentVersionId;
              const disabled =
                isReferenced ||
                quickAddDisabledByBaseRule ||
                disableForPinnedMode;

              return (
                <div
                  key={project.id}
                  className="rounded-xl border border-zinc-200/60 bg-white/70 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-semibold text-zinc-800"
                        title={project.name}
                      >
                        {project.name}
                      </p>
                      <p
                        className="mt-0.5 truncate text-[11px] text-zinc-500"
                        title={project.id}
                      >
                        {project.id}
                      </p>
                      {project.description ? (
                        <p
                          className="mt-1 line-clamp-2 text-[11px] text-zinc-500"
                          title={project.description}
                        >
                          {project.description}
                        </p>
                      ) : null}
                    </div>

                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() =>
                        onQuickAddReference(project.id, {
                          pinnedVersionId: project.currentVersionId,
                        })
                      }
                      className="h-8 shrink-0 rounded-lg bg-zinc-700 px-3 text-xs hover:bg-zinc-800 disabled:bg-zinc-300"
                    >
                      {isReferenced ? (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5" />
                          已引入
                        </>
                      ) : quickAddDisabledByBaseRule ? (
                        "已有主基底"
                      ) : disableForPinnedMode ? (
                        <>
                          <CircleOff className="mr-1 h-3.5 w-3.5" />
                          无可固定版本
                        </>
                      ) : (
                        "引入"
                      )}
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
                      visibility: {project.visibility}
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
                      status: {project.status}
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
                      referenceable: {project.isReferenceable ? "yes" : "no"}
                    </span>
                    {project.currentVersionId ? (
                      <span
                        className="max-w-full truncate rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5"
                        title={project.currentVersionId}
                      >
                        version: {project.currentVersionId}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <PaneState
        state={state}
        hasData={references.length > 0}
        emptyLabel={`项目 ${projectId} 当前没有引用，先引入一个库。`}
        onRetry={onReload}
      />

      {!state.loading && !state.error && references.length > 0 ? (
        <div className="space-y-3">
          {references.map((item) => (
            <RowCard
              key={item.id}
              icon={LinkIcon}
              title={item.target_project_id}
              subtitle={`${item.relation_type} 路 ${item.mode} 路 ${item.status} 路 优先级 ${item.priority ?? 0}`}
              action={
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() =>
                      onToggleReferenceStatus(item.id, item.status)
                    }
                    title={item.status === "active" ? "禁用" : "启用"}
                  >
                    <ToggleLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => {
                      const value = window.prompt(
                        "输入新的 priority（整数）",
                        String(item.priority ?? 0)
                      );
                      if (value == null) return;
                      const priority = Number.parseInt(value, 10);
                      if (Number.isNaN(priority)) return;
                      onUpdateReferencePriority(item.id, priority);
                    }}
                    title="调整优先级"
                  >
                    <ArrowDownUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => onDeleteReference(item.id)}
                    title="删除引用"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
