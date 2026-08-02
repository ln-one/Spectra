"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  ChevronDown,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useActionState, useMemo, useState } from "react";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
import { workspaceHref } from "../address";
import type { Workspace } from "../types";
import type { WorkspaceArchiveFormAction, WorkspaceRenameFormAction } from "./types";
import { WorkspaceCard, type WorkspaceItemActions, WorkspaceListItem } from "./WorkspaceItems";
import { WorkspaceRenameDialog } from "./WorkspaceRenameDialog";

type WorkspaceStatusFilter = "active" | "archived";
type WorkspaceSort = "recent" | "oldest" | "name";

function compareWorkspaceIds(left: Workspace, right: Workspace) {
  return right.id.localeCompare(left.id);
}

export function WorkspaceDashboardView({
  accountMenu,
  archiveAction,
  now,
  renameAction,
  sharedWorkspaces = [],
  workspaces,
}: {
  accountMenu: ReactNode;
  archiveAction: WorkspaceArchiveFormAction;
  now: string;
  renameAction: WorkspaceRenameFormAction;
  sharedWorkspaces?: readonly Workspace[];
  workspaces: readonly Workspace[];
}) {
  const locale = useLocale();
  const t = useTranslations("Dashboard");
  const [archiveState, archiveFormAction, archivePending] = useActionState(archiveAction, null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<WorkspaceSort>("recent");
  const [statusFilter, setStatusFilter] = useState<WorkspaceStatusFilter>("active");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [renamedWorkspaceName, setRenamedWorkspaceName] = useState<string | null>(null);
  const [workspaceToRename, setWorkspaceToRename] = useState<Workspace | null>(null);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase(locale);

  const visibleWorkspaces = useMemo(() => {
    const result = workspaces.filter((workspace) => {
      const archived = workspace.archivedAt !== null;
      if ((statusFilter === "archived") !== archived) return false;
      if (!normalizedSearchQuery) return true;
      return `${workspace.name} ${workspaceHref(workspace)}`
        .toLocaleLowerCase(locale)
        .includes(normalizedSearchQuery);
    });

    return [...result].sort((left, right) => {
      if (sortMode === "name") {
        return (
          left.name.localeCompare(right.name, locale, { sensitivity: "base" }) ||
          compareWorkspaceIds(left, right)
        );
      }
      const timeDifference =
        new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
      if (timeDifference !== 0) return sortMode === "oldest" ? timeDifference : -timeDifference;
      return compareWorkspaceIds(left, right);
    });
  }, [locale, normalizedSearchQuery, sortMode, statusFilter, workspaces]);

  const itemActions: WorkspaceItemActions = {
    archiveFormAction: (formData) => {
      setRenamedWorkspaceName(null);
      archiveFormAction(formData);
    },
    archivePending,
    onRename: (workspace) => {
      setRenamedWorkspaceName(null);
      setWorkspaceToRename(workspace);
    },
  };
  const visibleSharedWorkspaces = useMemo(
    () =>
      sharedWorkspaces.filter(
        (workspace) =>
          !normalizedSearchQuery ||
          `${workspace.name} ${workspace.ownerHandle} ${workspaceHref(workspace)}`
            .toLocaleLowerCase(locale)
            .includes(normalizedSearchQuery),
      ),
    [locale, normalizedSearchQuery, sharedWorkspaces],
  );

  const emptyFilteredContent = normalizedSearchQuery ? (
    <>
      <h2 className="text-2xl font-black tracking-tight">{t("noSearchResults")}</h2>
      <button
        type="button"
        onClick={() => setSearchQuery("")}
        className="mt-5 rounded-xl border border-[var(--app-border-strong)] px-5 py-2.5 text-sm font-bold transition hover:bg-[var(--app-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
      >
        {t("clearSearch")}
      </button>
    </>
  ) : statusFilter === "archived" ? (
    <h2 className="text-2xl font-black tracking-tight">{t("noArchivedWorkspaces")}</h2>
  ) : (
    <>
      <h2 className="text-2xl font-black tracking-tight">{t("noActiveWorkspaces")}</h2>
      <button
        type="button"
        onClick={() => setStatusFilter("archived")}
        className="mt-5 rounded-xl border border-[var(--app-border-strong)] px-5 py-2.5 text-sm font-bold transition hover:bg-[var(--app-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
      >
        {t("viewArchived")}
      </button>
    </>
  );

  return (
    <div className="min-h-screen bg-[var(--app-bg)] pb-20 text-[var(--app-text)]">
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <header className="sticky top-0 z-30 border-b border-[var(--app-border)] bg-[var(--app-bg)]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/workspaces" className="flex items-center gap-2">
            <SpectraLogo className="h-10 w-10" />
            <span className="text-xl font-black tracking-tight">Spectra</span>
            <span className="ml-2 hidden border-l border-[var(--app-border-strong)] pl-2 text-sm font-bold text-[var(--app-text-muted)] md:inline">
              {t("tagline")}
            </span>
          </Link>
          {accountMenu}
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10"
      >
        <div className="mb-10 flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t("workspaces")}</h1>
          <div className="flex w-full flex-wrap items-center gap-3 xl:w-auto">
            <label className="group relative w-full sm:w-auto sm:flex-1 xl:flex-none">
              <span className="sr-only">{t("search")}</span>
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-text-faint)]" />
              <input
                type="search"
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-12 w-full rounded-2xl border-none bg-[var(--app-surface-muted)] pl-11 pr-4 font-medium outline-none ring-[var(--app-border-strong)] transition focus:ring-2 md:w-80"
              />
            </label>

            <div className="flex items-center gap-1 rounded-xl bg-[var(--app-surface-muted)] p-1">
              <button
                type="button"
                aria-label={t("gridView")}
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={`rounded-lg p-2 transition ${viewMode === "grid" ? "bg-[var(--app-surface)] text-[var(--app-text)] shadow-sm" : "text-[var(--app-text-faint)]"}`}
              >
                <LayoutGrid className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label={t("listView")}
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={`rounded-lg p-2 transition ${viewMode === "list" ? "bg-[var(--app-surface)] text-[var(--app-text)] shadow-sm" : "text-[var(--app-text-faint)]"}`}
              >
                <List className="h-5 w-5" />
              </button>
            </div>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-4 text-sm font-bold shadow-sm outline-none transition hover:bg-[var(--app-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)] sm:px-5"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {t("filter")}
                  <ChevronDown className="h-4 w-4 text-[var(--app-text-faint)]" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-[90] w-56 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-2 text-[var(--app-text)] shadow-2xl"
                >
                  <DropdownMenu.Label className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-[var(--app-text-faint)]">
                    {t("status")}
                  </DropdownMenu.Label>
                  <DropdownMenu.RadioGroup
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as WorkspaceStatusFilter)}
                  >
                    <FilterItem value="active">{t("activeWorkspaces")}</FilterItem>
                    <FilterItem value="archived">{t("archivedWorkspaces")}</FilterItem>
                  </DropdownMenu.RadioGroup>
                  <DropdownMenu.Separator className="my-2 h-px bg-[var(--app-border)]" />
                  <DropdownMenu.Label className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-[var(--app-text-faint)]">
                    {t("sortBy")}
                  </DropdownMenu.Label>
                  <DropdownMenu.RadioGroup
                    value={sortMode}
                    onValueChange={(value) => setSortMode(value as WorkspaceSort)}
                  >
                    <FilterItem value="recent">{t("sortRecent")}</FilterItem>
                    <FilterItem value="oldest">{t("sortOldest")}</FilterItem>
                    <FilterItem value="name">{t("sortName")}</FilterItem>
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <Link
              href="/workspaces/new"
              className="flex h-12 items-center gap-2 rounded-2xl bg-[var(--app-primary)] px-5 text-sm font-bold text-[var(--app-on-primary)] shadow-lg transition hover:bg-[var(--app-primary-hover)] sm:px-7"
            >
              <Plus className="h-5 w-5" />
              {t("new")}
            </Link>
          </div>
        </div>

        {archivePending ? null : renamedWorkspaceName ? (
          <p role="status" aria-live="polite" className="mb-6 text-sm text-[var(--app-text-muted)]">
            {t("renameWorkspaceSuccess", { name: renamedWorkspaceName })}
          </p>
        ) : archiveState?.status === "success" ? (
          <p role="status" aria-live="polite" className="mb-6 text-sm text-[var(--app-text-muted)]">
            {archiveState.operation === "archive"
              ? t("archiveWorkspaceSuccess", { name: archiveState.workspaceName })
              : t("restoreWorkspaceSuccess", { name: archiveState.workspaceName })}
          </p>
        ) : archiveState?.status === "error" ? (
          <p role="alert" className="mb-6 text-sm text-[var(--app-danger)]">
            {archiveState.code === "workspace_not_found"
              ? t("workspaceNotFound")
              : t("workspaceArchiveFailed")}
          </p>
        ) : null}

        {workspaces.length === 0 ? (
          <section className="flex flex-col items-center justify-center rounded-[3rem] border border-[var(--app-border)] bg-[var(--app-surface)] py-28 shadow-sm">
            <span className="mb-8 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[var(--app-surface-subtle)] text-[var(--app-text-faint)] shadow-inner">
              <Plus className="h-12 w-12" />
            </span>
            <h2 className="mb-4 text-3xl font-black tracking-tight">{t("emptyTitle")}</h2>
            <p className="mb-10 max-w-sm text-center text-lg font-medium text-[var(--app-text-muted)]">
              {t("emptyBody")}
            </p>
            <Link
              href="/workspaces/new"
              className="flex h-14 items-center rounded-2xl bg-[var(--app-primary)] px-10 text-base font-bold text-[var(--app-on-primary)] shadow-2xl"
            >
              {t("createFirst")}
            </Link>
          </section>
        ) : visibleWorkspaces.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface)] px-6 py-20 text-center">
            {emptyFilteredContent}
          </section>
        ) : viewMode === "grid" ? (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {visibleWorkspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                actions={itemActions}
                workspace={workspace}
                now={now}
              />
            ))}
          </section>
        ) : (
          <section className="space-y-4">
            {visibleWorkspaces.map((workspace) => (
              <WorkspaceListItem
                key={workspace.id}
                actions={itemActions}
                workspace={workspace}
                now={now}
              />
            ))}
          </section>
        )}

        {visibleSharedWorkspaces.length > 0 ? (
          <section className="mt-12 border-t border-[var(--app-border)] pt-8">
            <div>
              <h2 className="text-2xl font-black tracking-tight">{t("sharedWithMe")}</h2>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                {t("sharedWithMeDescription")}
              </p>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {visibleSharedWorkspaces.map((workspace) => (
                <Link
                  key={workspace.id}
                  href={workspaceHref(workspace)}
                  className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--app-border-strong)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
                >
                  <h3 className="truncate text-base font-bold">{workspace.name}</h3>
                  <p className="mt-2 truncate text-sm text-[var(--app-text-muted)]">
                    {t("sharedBy", { handle: workspace.ownerHandle })}
                  </p>
                  <p className="mt-4 text-xs font-medium text-[var(--app-primary)]">
                    {t("sharedPermissionSummary")}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {workspaceToRename ? (
        <WorkspaceRenameDialog
          key={workspaceToRename.id}
          action={renameAction}
          workspace={workspaceToRename}
          open
          onRenamed={setRenamedWorkspaceName}
          onOpenChange={(open) => {
            if (!open) setWorkspaceToRename(null);
          }}
        />
      ) : null}
    </div>
  );
}

function FilterItem({ children, value }: { children: ReactNode; value: string }) {
  return (
    <DropdownMenu.RadioItem
      value={value}
      className="relative flex cursor-pointer select-none items-center rounded-xl py-2 pl-9 pr-3 text-sm font-medium outline-none hover:bg-[var(--app-surface-muted)] focus:bg-[var(--app-surface-muted)]"
    >
      <DropdownMenu.ItemIndicator className="absolute left-3">
        <Check className="h-4 w-4" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.RadioItem>
  );
}
