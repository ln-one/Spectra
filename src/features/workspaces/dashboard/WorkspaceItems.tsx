"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, ArchiveRestore, BookOpen, MoreVertical, Pencil } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { startTransition } from "react";
import { workspaceHref } from "../address";
import type { Workspace } from "../types";

const LOGO_COLORS = [
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#4CD964",
  "#5AC8FA",
  "#007AFF",
  "#5856D6",
  "#AF52DE",
];

const SKELETON_ITEMS = ["workspace-1", "workspace-2", "workspace-3", "workspace-4"];

function workspaceGradient(seed: string) {
  let hash = 0;
  for (const character of seed) hash = character.charCodeAt(0) + ((hash << 5) - hash);

  const first = LOGO_COLORS[Math.abs(hash) % LOGO_COLORS.length];
  const second = LOGO_COLORS[Math.abs(hash + 3) % LOGO_COLORS.length];
  return `radial-gradient(circle at 0% 0%, ${first}99 0%, transparent 70%), radial-gradient(circle at 100% 100%, ${second}66 0%, transparent 90%), var(--app-surface)`;
}

function formatWorkspaceDate(
  value: string,
  now: string,
  locale: string,
  t: ReturnType<typeof useTranslations<"Dashboard">>,
) {
  const date = new Date(value);
  const reference = new Date(now);
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) return t("unknownTime");

  const diffDays = Math.floor((reference.getTime() - date.getTime()) / 86_400_000);
  if (diffDays <= 0) return t("updatedToday");
  if (diffDays === 1) return t("updatedYesterday");
  if (diffDays < 7) return t("updatedDaysAgo", { count: diffDays });
  if (diffDays < 30) return t("updatedWeeksAgo", { count: Math.floor(diffDays / 7) });
  return t("updatedOn", {
    date: date.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" }),
  });
}

export type WorkspaceItemActions = {
  archiveFormAction: (formData: FormData) => void;
  archivePending: boolean;
  onRename: (workspace: Workspace) => void;
};

function WorkspaceActionMenu({
  actions,
  workspace,
}: {
  actions: WorkspaceItemActions;
  workspace: Workspace;
}) {
  const t = useTranslations("Dashboard");
  const archived = workspace.archivedAt !== null;
  const operation = archived ? "restore" : "archive";
  const OperationIcon = archived ? ArchiveRestore : Archive;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t("workspaceActions", { name: workspace.name })}
          className="relative z-20 -mr-2 -mt-2 flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 opacity-70 outline-none transition hover:bg-white/55 hover:opacity-100 focus-visible:bg-white/55 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-zinc-800/30 group-hover:opacity-100"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[90] min-w-44 rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1.5 text-[var(--app-text)] shadow-xl"
        >
          <DropdownMenu.Item asChild onSelect={() => actions.onRename(workspace)}>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none hover:bg-[var(--app-surface-muted)] focus:bg-[var(--app-surface-muted)]"
            >
              <Pencil className="h-4 w-4" />
              {t("renameWorkspace")}
            </button>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={actions.archivePending}
            onSelect={() => {
              const formData = new FormData();
              formData.set("workspaceId", workspace.id);
              formData.set("operation", operation);
              startTransition(() => actions.archiveFormAction(formData));
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none hover:bg-[var(--app-surface-muted)] focus:bg-[var(--app-surface-muted)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
          >
            <OperationIcon className="h-4 w-4" />
            {archived ? t("restoreWorkspace") : t("archiveWorkspace")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function WorkspaceCard({
  actions,
  now,
  workspace,
}: {
  actions: WorkspaceItemActions;
  now: string;
  workspace: Workspace;
}) {
  const locale = useLocale();
  const t = useTranslations("Dashboard");
  return (
    <article
      className="group relative flex min-h-[180px] flex-col justify-between overflow-hidden rounded-[2rem] border border-zinc-100/50 p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl"
      style={{ background: workspaceGradient(workspace.id) }}
    >
      <Link
        href={workspaceHref(workspace)}
        aria-label={t("openWorkspace", { name: workspace.name })}
        className="absolute inset-0 z-10 rounded-[2rem]"
      />
      <div className="relative flex items-start justify-between">
        <span className="rounded-full border border-white/40 bg-white/60 px-3 py-1.5 text-xs font-semibold tracking-wide text-zinc-600 shadow-sm backdrop-blur-md">
          {formatWorkspaceDate(workspace.updatedAt, now, locale, t)}
        </span>
        <WorkspaceActionMenu actions={actions} workspace={workspace} />
      </div>
      <div className="relative z-0 mt-4">
        <h3 className="line-clamp-2 text-xl font-bold leading-tight text-[var(--app-text)]">
          {workspace.name}
        </h3>
        <p className="mt-2 truncate font-mono text-xs text-[var(--app-text-muted)]">
          {workspaceHref(workspace)}
        </p>
      </div>
    </article>
  );
}

export function WorkspaceListItem({
  actions,
  now,
  workspace,
}: {
  actions: WorkspaceItemActions;
  now: string;
  workspace: Workspace;
}) {
  const locale = useLocale();
  const t = useTranslations("Dashboard");
  return (
    <article className="group relative flex items-center gap-5 rounded-[1.5rem] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 transition hover:translate-x-1 hover:border-[var(--app-border-strong)] hover:shadow-md">
      <Link
        href={workspaceHref(workspace)}
        aria-label={t("openWorkspace", { name: workspace.name })}
        className="absolute inset-0 z-10 rounded-[1.5rem] outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
      />
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
        style={{ background: workspaceGradient(workspace.id) }}
      >
        <BookOpen className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold leading-tight text-[var(--app-text)]">
          {workspace.name}
        </span>
        <span className="mt-1 block text-xs font-medium text-[var(--app-text-faint)]">
          {formatWorkspaceDate(workspace.updatedAt, now, locale, t)}
        </span>
      </span>
      <span className="hidden text-right sm:block">
        <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--app-text-faint)]">
          {t("lastModified")}
        </span>
        <span className="text-xs font-semibold text-[var(--app-text-muted)]">
          {formatWorkspaceDate(workspace.updatedAt, now, locale, t)}
        </span>
      </span>
      <WorkspaceActionMenu actions={actions} workspace={workspace} />
    </article>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="w-full space-y-8">
      <div className="h-10 w-44 animate-pulse rounded-full bg-[var(--app-surface-muted)]" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {SKELETON_ITEMS.map((item) => (
          <div
            key={item}
            className="h-[180px] animate-pulse rounded-[2rem] bg-[var(--app-surface-muted)]"
          />
        ))}
      </div>
    </div>
  );
}
