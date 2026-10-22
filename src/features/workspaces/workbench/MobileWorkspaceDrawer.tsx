"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpenText,
  ChevronRight,
  Menu,
  MessageSquarePlus,
  Search,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
import type { WorkspaceArtifactNavigationItem } from "@/features/artifacts/types";
import { mobileLastWorkspaceKey } from "../dashboard/MobileConversationEntry";
import { useMobileWorkspaceDrawerNavigation } from "./MobileWorkspaceDrawerNavigationContext";
import { MobileWorkspaceTreeItem } from "./MobileWorkspaceTreeItem";
import type { MobileWorkspaceNavigationItem, WorkspaceConversationNavigationItem } from "./types";

export function MobileWorkspaceDrawer({
  accountMenu,
  account,
  conversationId,
  conversations,
  currentWorkspaceId,
  defaultOpen = false,
  newConversationHref,
  settingsControl,
  shareControl,
  workspaceHref,
  workspaces,
  workspaceArtifacts = [],
  hasNextPage = false,
  isLoadingNextPage = false,
  onLoadMore,
  onOpenCreationTools,
  onOpenSources,
  onOpenAccount,
}: {
  accountMenu: ReactNode;
  account?: { handle: string; email: string };
  conversationId: string;
  conversations: readonly WorkspaceConversationNavigationItem[];
  currentWorkspaceId: string;
  defaultOpen?: boolean;
  newConversationHref: string;
  settingsControl: ReactNode;
  shareControl?: ReactNode;
  workspaceHref: string;
  workspaces: readonly MobileWorkspaceNavigationItem[];
  workspaceArtifacts?: readonly WorkspaceArtifactNavigationItem[];
  hasNextPage?: boolean;
  isLoadingNextPage?: boolean;
  onLoadMore?: (() => void) | undefined;
  onOpenCreationTools?: (() => void) | undefined;
  onOpenSources?: (() => void) | undefined;
  onOpenAccount?: (() => void) | undefined;
}) {
  const t = useTranslations("Workbench");
  const [query, setQuery] = useState("");
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const drawerNavigation = useMobileWorkspaceDrawerNavigation();
  const open = drawerNavigation?.isOpen ?? localOpen;
  const navigationTargetWorkspaceId = drawerNavigation?.navigationTargetWorkspaceId ?? null;
  const [expandedByWorkspace, setExpandedByWorkspace] = useState<Record<string, boolean>>({});
  const expandedWorkspaceIds = workspaces.map((workspace) => workspace.id).join(":");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  useEffect(() => {
    if (
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(max-width: 1023px)").matches
    )
      return;
    try {
      window.localStorage.setItem(mobileLastWorkspaceKey, workspaceHref);
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
  }, [workspaceHref]);

  useEffect(() => {
    const restored: Record<string, boolean> = {};
    for (const workspaceId of expandedWorkspaceIds.split(":")) {
      if (!workspaceId) continue;
      try {
        const saved = window.localStorage.getItem(`spectra.mobileDrawer.${workspaceId}.workspace`);
        restored[workspaceId] =
          saved === "expanded" || (saved === null && workspaceId === currentWorkspaceId);
      } catch {
        restored[workspaceId] = workspaceId === currentWorkspaceId;
      }
    }
    setExpandedByWorkspace(restored);
  }, [currentWorkspaceId, expandedWorkspaceIds]);

  function setWorkspaceExpanded(workspaceId: string, expanded: boolean) {
    setExpandedByWorkspace((current) => ({
      ...current,
      [workspaceId]: expanded,
    }));
    try {
      window.localStorage.setItem(
        `spectra.mobileDrawer.${workspaceId}.workspace`,
        expanded ? "expanded" : "collapsed",
      );
    } catch {
      // The tree remains usable when browser storage is unavailable.
    }
  }

  function selectWorkspace(workspaceId: string) {
    setWorkspaceExpanded(workspaceId, true);
    drawerNavigation?.beginWorkspaceNavigation(workspaceId);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (drawerNavigation) {
      drawerNavigation.setOpen(nextOpen);
      if (!nextOpen) drawerNavigation.cancelWorkspaceNavigation();
    } else setLocalOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
    }
  }

  const filteredWorkspaces = workspaces.filter(
    (workspace) =>
      workspace.name.toLocaleLowerCase().includes(normalizedQuery) ||
      (workspace.id === currentWorkspaceId &&
        (conversations.some((item) => item.title?.toLocaleLowerCase().includes(normalizedQuery)) ||
          workspaceArtifacts.some((item) =>
            item.title.toLocaleLowerCase().includes(normalizedQuery),
          ))),
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={t("openMobileNavigation")}
          className="workspace-mobile-icon-button"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          data-navigation-reopen={navigationTargetWorkspaceId ? "true" : undefined}
          className="workspace-mobile-drawer-overlay fixed inset-0 z-[120] bg-zinc-950/25 backdrop-blur-[2px]"
        />
        <Dialog.Content
          aria-describedby={undefined}
          data-navigation-reopen={navigationTargetWorkspaceId ? "true" : undefined}
          data-workspace-style="mist-zinc"
          data-workspace-theme="mist-zinc"
          className="workspace-mobile-drawer fixed inset-y-0 left-0 z-[121] flex w-[min(88vw,360px)] flex-col border-r border-[var(--workspace-border)] bg-[var(--workspace-surface)] text-[var(--workspace-text-primary)] shadow-2xl backdrop-blur-[var(--workspace-panel-blur)] outline-none"
        >
          <div className="flex h-16 shrink-0 items-center gap-2 px-3">
            <SpectraLogo className="h-10 w-10" />
            <Dialog.Title className="min-w-0 flex-1 truncate text-base font-bold tracking-tight">
              Spectra
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("closeMobileNavigation")}
                className="workspace-mobile-icon-button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-3 pb-3">
            <label className="relative block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--workspace-text-muted)]"
              />
              <span className="sr-only">{t("searchWorkspacesAndConversations")}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchWorkspacesAndConversations")}
                className="h-11 w-full rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] pl-9 pr-3 text-base outline-none placeholder:text-[var(--workspace-text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
            <Dialog.Close asChild>
              <Link
                href={newConversationHref}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
              >
                <MessageSquarePlus aria-hidden="true" className="h-5 w-5" />
                {t("newConversation")}
              </Link>
            </Dialog.Close>

            <div className="mt-2 space-y-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={onOpenSources}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                >
                  <BookOpenText aria-hidden="true" className="h-5 w-5" />
                  {t("sourcesTitle")}
                </button>
              </Dialog.Close>
              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={onOpenCreationTools}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                >
                  <WandSparkles aria-hidden="true" className="h-5 w-5" />
                  <span className="min-w-0 flex-1">{t("creationToolsNavigation")}</span>
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 text-[var(--workspace-text-muted)]"
                  />
                </button>
              </Dialog.Close>
            </div>

            <p className="px-3 pb-1 pt-4 text-xs font-semibold text-[var(--workspace-text-muted)]">
              {t("workspaceNavigationTitle")}
            </p>
            <nav aria-label={t("workspaceNavigationTitle")} className="space-y-1">
              {filteredWorkspaces.map((workspace) => (
                <MobileWorkspaceTreeItem
                  key={workspace.id}
                  workspace={workspace}
                  current={workspace.id === currentWorkspaceId}
                  expanded={
                    expandedByWorkspace[workspace.id] ?? workspace.id === currentWorkspaceId
                  }
                  onExpand={(expanded) => setWorkspaceExpanded(workspace.id, expanded)}
                  onNavigate={() => selectWorkspace(workspace.id)}
                  query={normalizedQuery}
                  conversationId={conversationId}
                  conversations={workspace.id === currentWorkspaceId ? conversations : []}
                  artifacts={workspace.id === currentWorkspaceId ? workspaceArtifacts : []}
                  hasNextPage={workspace.id === currentWorkspaceId && hasNextPage}
                  isLoadingNextPage={workspace.id === currentWorkspaceId && isLoadingNextPage}
                  onLoadMore={workspace.id === currentWorkspaceId ? onLoadMore : undefined}
                />
              ))}
            </nav>
            {normalizedQuery && filteredWorkspaces.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[var(--workspace-text-muted)]">
                {t("navigationSearchEmpty")}
              </p>
            ) : null}
          </div>

          <div className="flex min-h-16 shrink-0 items-center gap-2 border-t border-[var(--workspace-border)] px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
            {shareControl}
            {settingsControl}
            {account ? (
              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="ml-auto flex min-h-11 min-w-0 max-w-[13rem] items-center gap-2 rounded-xl px-2 text-left outline-none transition hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--workspace-surface-muted)] text-xs font-semibold text-[var(--workspace-control-text)]">
                    {account.handle.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{account.handle}</span>
                    <span className="block truncate text-[11px] text-[var(--workspace-text-muted)]">
                      {account.email}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-[var(--workspace-text-muted)]"
                  />
                </button>
              </Dialog.Close>
            ) : (
              <span className="ml-auto">{accountMenu}</span>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
