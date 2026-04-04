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
  Settings2,
  ToggleLeft,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PaneState, type TabState } from "../shared";
import type {
  AvailableLibraryProject,
  CurrentLibrarySettings,
  ProjectReference,
} from "../types";

interface ReferencesTabProps {
  projectId: string;
  references: ProjectReference[];
  state: TabState;
  librariesState: TabState;
  currentLibraryState: TabState;
  availableLibraries: AvailableLibraryProject[];
  currentLibrarySettings: CurrentLibrarySettings | null;
  currentLibrarySaving: boolean;
  currentLibraryVisibilityDraft: "private" | "shared";
  setCurrentLibraryVisibilityDraft: (value: "private" | "shared") => void;
  currentLibraryReferenceableDraft: boolean;
  setCurrentLibraryReferenceableDraft: (value: boolean) => void;
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
  onReloadCurrentLibrarySettings: () => void;
  onSaveCurrentLibrarySettings: () => void;
}

const SECTION_CLASS =
  "relative overflow-hidden rounded-2xl border border-white/75 bg-[linear-gradient(155deg,rgba(255,255,255,0.88),rgba(245,248,252,0.72))] p-4 shadow-[0_18px_48px_-34px_rgba(0,0,0,0.6)] backdrop-blur-xl";

function visibilityMeta(visibility?: string) {
  if (visibility === "private") {
    return {
      label: "私有",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (visibility === "shared") {
    return {
      label: "共享",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  return {
    label: "未知",
    className: "border-zinc-200 bg-zinc-50 text-zinc-500",
  };
}

function relationLabel(value: ProjectReference["relation_type"]) {
  return value === "base" ? "主基底" : "辅助引用";
}

function modeLabel(value: ProjectReference["mode"]) {
  return value === "pinned" ? "固定版本" : "跟随更新";
}

function referenceStatusLabel(value: ProjectReference["status"]) {
  return value === "active" ? "已启用" : "已停用";
}

export function ReferencesTab({
  projectId,
  references,
  state,
  librariesState,
  currentLibraryState,
  availableLibraries,
  currentLibrarySettings,
  currentLibrarySaving,
  currentLibraryVisibilityDraft,
  setCurrentLibraryVisibilityDraft,
  currentLibraryReferenceableDraft,
  setCurrentLibraryReferenceableDraft,
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
  onReloadCurrentLibrarySettings,
  onSaveCurrentLibrarySettings,
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
  const hasCurrentLibrarySettings = !!currentLibrarySettings;
  const hasCurrentLibraryChanges =
    hasCurrentLibrarySettings &&
    (currentLibraryVisibilityDraft !== currentLibrarySettings.visibility ||
      currentLibraryReferenceableDraft !==
        currentLibrarySettings.isReferenceable);
  const hasInvalidCurrentLibrarySettings =
    currentLibraryVisibilityDraft === "private" &&
    currentLibraryReferenceableDraft;

  return (
    <div className="space-y-5">
      <section className={SECTION_CLASS}>
        <div className="pointer-events-none absolute -right-16 -top-14 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="relative">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 to-zinc-700 text-white shadow-[0_8px_18px_-12px_rgba(0,0,0,0.7)]">
                <Settings2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--project-text-primary)]">
                  当前库设置
                </p>
                <p className="text-xs text-[var(--project-text-muted)]">
                  控制当前项目可见性与可引用性
                </p>
              </div>
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={onReloadCurrentLibrarySettings}
              className="h-8 w-8 rounded-xl border-zinc-200/80 bg-white/90"
              title="刷新当前库设置"
            >
              <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
            </Button>
          </div>

          <PaneState
            state={currentLibraryState}
            hasData={hasCurrentLibrarySettings}
            emptyLabel="当前库设置暂不可用。"
            onRetry={onReloadCurrentLibrarySettings}
          />

          {!currentLibraryState.loading &&
          !currentLibraryState.error &&
          currentLibrarySettings ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-200/75 bg-white/88 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-semibold text-zinc-800"
                      title={currentLibrarySettings.name}
                    >
                      {currentLibrarySettings.name}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[11px] text-zinc-500"
                      title={currentLibrarySettings.id}
                    >
                      {currentLibrarySettings.id}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                        visibilityMeta(currentLibraryVisibilityDraft).className
                      )}
                    >
                      {visibilityMeta(currentLibraryVisibilityDraft).label}
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                      {currentLibraryReferenceableDraft ? "可引用" : "不可引用"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <p className="mb-1 text-[11px] text-zinc-500">可见性</p>
                  <Select
                    value={currentLibraryVisibilityDraft}
                    onValueChange={(value) =>
                      setCurrentLibraryVisibilityDraft(value as "private" | "shared")
                    }
                  >
                    <SelectTrigger className="h-9 rounded-xl border-zinc-200/80 bg-white/90 text-xs shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-zinc-200 bg-white/95 backdrop-blur-xl">
                      <SelectItem value="private">私有</SelectItem>
                      <SelectItem value="shared">共享</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <p className="mb-1 text-[11px] text-zinc-500">是否可引用</p>
                  <Select
                    value={currentLibraryReferenceableDraft ? "yes" : "no"}
                    onValueChange={(value) =>
                      setCurrentLibraryReferenceableDraft(value === "yes")
                    }
                  >
                    <SelectTrigger className="h-9 rounded-xl border-zinc-200/80 bg-white/90 text-xs shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-zinc-200 bg-white/95 backdrop-blur-xl">
                      <SelectItem value="no">不可引用</SelectItem>
                      <SelectItem value="yes">可引用</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              {hasInvalidCurrentLibrarySettings ? (
                <p className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                  <CircleOff className="h-3 w-3" />
                  私有库不能设置为可引用，请先切换为共享。
                </p>
              ) : null}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={onSaveCurrentLibrarySettings}
                  disabled={
                    currentLibrarySaving ||
                    !hasCurrentLibraryChanges ||
                    hasInvalidCurrentLibrarySettings
                  }
                  className="h-8 rounded-lg bg-zinc-900 px-4 text-xs hover:bg-black disabled:bg-zinc-300"
                >
                  {currentLibrarySaving ? "保存中..." : "保存设置"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <div className="pointer-events-none absolute -left-16 -top-14 h-40 w-40 rounded-full bg-sky-300/16 blur-3xl" />
        <div className="relative">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 to-zinc-700 text-white shadow-[0_8px_18px_-12px_rgba(0,0,0,0.7)]">
              <Library className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--project-text-primary)]">
                引入库
              </p>
              <p className="text-xs text-[var(--project-text-muted)]">
                输入目标库 ID，或从下方数据库列表直接引入
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
            <Input
              value={newReferenceTarget}
              onChange={(event) => setNewReferenceTarget(event.target.value)}
              placeholder="输入要引入的 target_project_id"
              className="md:col-span-3 h-9 rounded-xl border-zinc-200/80 bg-white/90"
            />
            <Select
              value={newReferenceRelationType}
              onValueChange={(value) =>
                setNewReferenceRelationType(value as "base" | "auxiliary")
              }
            >
              <SelectTrigger className="md:col-span-1 h-9 rounded-xl border-zinc-200/80 bg-white/90 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-200 bg-white/95 backdrop-blur-xl">
                <SelectItem value="base">主基底</SelectItem>
                <SelectItem value="auxiliary">辅助</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={newReferenceMode}
              onValueChange={(value) =>
                setNewReferenceMode(value as "follow" | "pinned")
              }
            >
              <SelectTrigger className="md:col-span-1 h-9 rounded-xl border-zinc-200/80 bg-white/90 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-200 bg-white/95 backdrop-blur-xl">
                <SelectItem value="follow">follow</SelectItem>
                <SelectItem value="pinned">pinned</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={newReferencePriority}
              onChange={(event) => setNewReferencePriority(event.target.value)}
              placeholder="优先级"
              className="md:col-span-1 h-9 rounded-xl border-zinc-200/80 bg-white/90 text-xs"
            />

            {newReferenceMode === "pinned" ? (
              <Input
                value={newReferencePinnedVersion}
                onChange={(event) =>
                  setNewReferencePinnedVersion(event.target.value)
                }
                placeholder="pinned_version_id"
                className="md:col-span-4 h-9 rounded-xl border-zinc-200/80 bg-white/90 text-xs"
              />
            ) : null}

            <Button
              size="sm"
              onClick={onAddReference}
              className="h-9 rounded-xl bg-zinc-900 px-4 hover:bg-black"
            >
              <Plus className="mr-1 h-4 w-4" />
              引入
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={onReload}
              className="h-9 w-9 rounded-xl border-zinc-200/80 bg-white/90"
              title="刷新引用列表"
            >
              <RefreshCw className="h-4 w-4 text-zinc-500" />
            </Button>
          </div>
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <div className="relative">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--project-text-primary)]">
                库列表（数据库）
              </p>
              <p className="text-xs text-[var(--project-text-muted)]">
                可直接引入的库：{visibleLibraries.length}
              </p>
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={onReloadLibraries}
              className="h-8 w-8 rounded-xl border-zinc-200/80 bg-white/90"
              title="刷新库列表"
            >
              <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
            </Button>
          </div>

          <Input
            value={libraryKeyword}
            onChange={(event) => setLibraryKeyword(event.target.value)}
            placeholder="按名称或 ID 过滤库"
            className="mb-3 h-9 rounded-xl border-zinc-200/80 bg-white/90"
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
            <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white/86 px-3">
              {visibleLibraries.map((project) => {
                const isReferenced = referencedTargetIds.has(project.id);
                const disableForNotReferenceable = !project.isReferenceable;
                const disableForPinnedMode =
                  newReferenceMode === "pinned" && !project.currentVersionId;
                const visibility = visibilityMeta(project.visibility);
                const disabled =
                  isReferenced ||
                  disableForNotReferenceable ||
                  quickAddDisabledByBaseRule ||
                  disableForPinnedMode;

                return (
                  <article
                    key={project.id}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p
                        className="truncate text-sm font-semibold text-zinc-800"
                        title={project.name}
                      >
                        {project.name}
                      </p>
                      <p
                        className="truncate text-[11px] text-zinc-500"
                        title={project.id}
                      >
                        {project.id}
                      </p>
                      {project.description ? (
                        <p
                          className="line-clamp-2 text-[11px] text-zinc-500"
                          title={project.description}
                        >
                          {project.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                            visibility.className
                          )}
                        >
                          {visibility.label}
                        </span>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-600">
                          {project.isReferenceable ? "可引用" : "不可引用"}
                        </span>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-600">
                          状态 {project.status}
                        </span>
                        {project.currentVersionId ? (
                          <span
                            className="max-w-[180px] truncate rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-600"
                            title={project.currentVersionId}
                          >
                            可固定版本
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      disabled={disabled}
                      title={
                        disableForNotReferenceable ? "该库不可引用" : undefined
                      }
                      onClick={() =>
                        onQuickAddReference(project.id, {
                          pinnedVersionId: project.currentVersionId,
                        })
                      }
                      className="h-8 shrink-0 rounded-lg bg-zinc-900 px-3 text-xs hover:bg-black disabled:bg-zinc-300"
                    >
                      {isReferenced ? (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5" />
                          已引入
                        </>
                      ) : disableForNotReferenceable ? (
                        "引入"
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
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <div className="relative">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 to-zinc-700 text-white shadow-[0_8px_18px_-12px_rgba(0,0,0,0.7)]">
              <LinkIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--project-text-primary)]">
                当前引用
              </p>
              <p className="text-xs text-[var(--project-text-muted)]">
                已建立引用关系：{references.length}
              </p>
            </div>
          </div>

          <PaneState
            state={state}
            hasData={references.length > 0}
            emptyLabel={`项目 ${projectId} 当前没有引用，先引入一个库。`}
            onRetry={onReload}
          />

          {!state.loading && !state.error && references.length > 0 ? (
            <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white/86 px-3">
              {references.map((item) => (
                <article
                  key={item.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-semibold text-zinc-800"
                      title={item.target_project_name || item.target_project_id}
                    >
                      {item.target_project_name || item.target_project_id}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[11px] text-zinc-500"
                      title={item.target_project_id}
                    >
                      {item.target_project_id}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-600">
                        {relationLabel(item.relation_type)}
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-600">
                        {modeLabel(item.mode)}
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-600">
                        {referenceStatusLabel(item.status)}
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-600">
                        优先级 {item.priority ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() => onToggleReferenceStatus(item.id, item.status)}
                      title={item.status === "active" ? "禁用" : "启用"}
                    >
                      <ToggleLeft className="h-4 w-4" />
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
                      <ArrowDownUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => onDeleteReference(item.id)}
                      title="删除引用"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
