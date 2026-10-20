"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpenText,
  ChevronDown,
  ChevronRight,
  Folder,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  Search,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
import {
  artifactEffectiveGenerationState,
  type WorkspaceArtifactNavigationItem,
} from "@/features/artifacts/types";
import { mobileLastWorkspaceKey } from "../dashboard/MobileConversationEntry";
import { studioToolForArtifactKind } from "./artifactWorkbench";
import { STUDIO_TOOL_PRESENTATIONS } from "./studioTools";
import type { MobileWorkspaceNavigationItem, WorkspaceConversationNavigationItem } from "./types";

export function MobileWorkspaceDrawer({
  accountMenu,
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
}: {
  accountMenu: ReactNode;
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
}) {
  const t = useTranslations("Workbench");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [conversationsExpanded, setConversationsExpanded] = useState(true);
  const [artifactsExpanded, setArtifactsExpanded] = useState(true);
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
    try {
      setConversationsExpanded(
        window.localStorage.getItem(`spectra.mobileDrawer.${currentWorkspaceId}.conversations`) !==
          "collapsed",
      );
      setArtifactsExpanded(
        window.localStorage.getItem(`spectra.mobileDrawer.${currentWorkspaceId}.artifacts`) !==
          "collapsed",
      );
    } catch {
      setConversationsExpanded(true);
      setArtifactsExpanded(true);
    }
  }, [currentWorkspaceId]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredConversations = useMemo(
    () =>
      conversations.filter((conversation) => {
        const label =
          conversation.title ??
          t("conversationAt", {
            date: format.dateTime(new Date(conversation.updatedAt), {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Shanghai",
            }),
          });
        return label.toLocaleLowerCase().includes(normalizedQuery);
      }),
    [conversations, format, normalizedQuery, t],
  );
  const filteredArtifacts = useMemo(
    () =>
      workspaceArtifacts.filter((artifact) =>
        artifact.title.toLocaleLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, workspaceArtifacts],
  );
  const filteredWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          workspace.name.toLocaleLowerCase().includes(normalizedQuery) ||
          (workspace.id === currentWorkspaceId &&
            (filteredConversations.length > 0 || filteredArtifacts.length > 0)),
      ),
    [
      currentWorkspaceId,
      filteredArtifacts.length,
      filteredConversations.length,
      normalizedQuery,
      workspaces,
    ],
  );

  const setSectionExpanded = (section: "artifacts" | "conversations", expanded: boolean) => {
    if (section === "conversations") setConversationsExpanded(expanded);
    else setArtifactsExpanded(expanded);
    try {
      window.localStorage.setItem(
        `spectra.mobileDrawer.${currentWorkspaceId}.${section}`,
        expanded ? "expanded" : "collapsed",
      );
    } catch {
      // The drawer remains usable when browser storage is unavailable.
    }
  };

  const conversationLabel = (conversation: WorkspaceConversationNavigationItem) =>
    conversation.title ??
    t("conversationAt", {
      date: format.dateTime(new Date(conversation.updatedAt), {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }),
    });

  return (
    <Dialog.Root
      defaultOpen={defaultOpen}
      onOpenChange={(open) => {
        if (open) return;
        setQuery("");
      }}
    >
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
        <Dialog.Overlay className="workspace-mobile-drawer-overlay fixed inset-0 z-[120] bg-zinc-950/25 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
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
              {filteredWorkspaces.map((workspace) => {
                const current = workspace.id === currentWorkspaceId;
                return (
                  <div key={workspace.id}>
                    <Dialog.Close asChild>
                      <Link
                        href={
                          current
                            ? `${workspaceHref}?conversation=${conversationId}`
                            : workspace.href
                        }
                        aria-current={current ? "location" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] ${current ? "font-semibold" : "font-medium"}`}
                      >
                        <Folder
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0 text-[var(--workspace-accent)]"
                        />
                        <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                        <ChevronRight
                          aria-hidden="true"
                          className="h-4 w-4 text-[var(--workspace-text-muted)]"
                        />
                      </Link>
                    </Dialog.Close>
                    {current ? (
                      <div className="ml-7 border-l border-[var(--workspace-border)] pl-2">
                        <button
                          type="button"
                          aria-expanded={conversationsExpanded}
                          onClick={() =>
                            setSectionExpanded("conversations", !conversationsExpanded)
                          }
                          className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-[var(--workspace-text-muted)] outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={`h-4 w-4 transition-transform ${conversationsExpanded ? "" : "-rotate-90"}`}
                          />
                          <span className="min-w-0 flex-1">{t("conversationNavigationTitle")}</span>
                          <span className="tabular-nums">{conversations.length}</span>
                        </button>
                        {conversationsExpanded || normalizedQuery ? (
                          <div className="space-y-0.5">
                            {filteredConversations.map((conversation) => (
                              <Dialog.Close asChild key={conversation.conversationId}>
                                <Link
                                  href={`${workspaceHref}?conversation=${conversation.conversationId}`}
                                  aria-current={
                                    conversation.conversationId === conversationId
                                      ? "page"
                                      : undefined
                                  }
                                  className={`block min-h-10 truncate rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] ${conversation.conversationId === conversationId ? "font-semibold text-[var(--workspace-text-primary)]" : "text-[var(--workspace-text-muted)]"}`}
                                >
                                  {conversationLabel(conversation)}
                                </Link>
                              </Dialog.Close>
                            ))}
                            {hasNextPage ? (
                              <button
                                type="button"
                                disabled={isLoadingNextPage}
                                onClick={onLoadMore}
                                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium text-[var(--workspace-text-muted)] outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:cursor-wait disabled:opacity-60"
                              >
                                {isLoadingNextPage ? (
                                  <LoaderCircle
                                    aria-hidden="true"
                                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                                  />
                                ) : null}
                                {isLoadingNextPage
                                  ? t("loadingMoreConversations")
                                  : t("loadMoreConversations")}
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        <button
                          type="button"
                          aria-expanded={artifactsExpanded}
                          onClick={() => setSectionExpanded("artifacts", !artifactsExpanded)}
                          className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-[var(--workspace-text-muted)] outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={`h-4 w-4 transition-transform ${artifactsExpanded ? "" : "-rotate-90"}`}
                          />
                          <span className="min-w-0 flex-1">{t("creationResultsTitle")}</span>
                          <span className="tabular-nums">{workspaceArtifacts.length}</span>
                        </button>
                        {artifactsExpanded || normalizedQuery ? (
                          <div className="space-y-1 pb-1">
                            {filteredArtifacts.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-[var(--workspace-text-muted)]">
                                {t("creationResultsEmpty")}
                              </p>
                            ) : (
                              filteredArtifacts.map((artifact) => {
                                const toolId = studioToolForArtifactKind(artifact.kind);
                                const presentation = toolId
                                  ? STUDIO_TOOL_PRESENTATIONS[toolId]
                                  : null;
                                const ArtifactIcon = presentation?.Icon ?? Folder;
                                const state = artifactEffectiveGenerationState(artifact);
                                const active =
                                  state === "queued" ||
                                  state === "generating" ||
                                  state === "finalizing";
                                const status = active
                                  ? t(
                                      state === "queued"
                                        ? "artifactQueued"
                                        : state === "generating"
                                          ? "artifactGenerating"
                                          : "artifactFinalizing",
                                    )
                                  : state === "failed"
                                    ? t("artifactGenerationFailed")
                                    : state === "cancelled"
                                      ? t("artifactGenerationCancelled")
                                      : presentation
                                        ? t(presentation.labelKey)
                                        : t("artifactHistoryKind");
                                return (
                                  <Dialog.Close asChild key={artifact.id}>
                                    <Link
                                      href={`${workspaceHref}?conversation=${artifact.conversationId}&artifact=${artifact.id}`}
                                      data-studio-tone={presentation?.tone ?? "neutral"}
                                      className="flex min-h-12 items-center gap-2 rounded-xl px-2 py-1.5 outline-none hover:bg-[var(--studio-surface-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                                    >
                                      <span className="workspace-tool-icon-container flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border">
                                        {active ? (
                                          <LoaderCircle
                                            aria-hidden="true"
                                            className="h-[17px] w-[17px] animate-spin motion-reduce:animate-none"
                                          />
                                        ) : (
                                          <ArtifactIcon
                                            aria-hidden="true"
                                            className="h-[17px] w-[17px]"
                                          />
                                        )}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-[var(--workspace-text-primary)]">
                                          {artifact.title}
                                        </span>
                                        <span className="block truncate text-[11px] text-[var(--workspace-text-muted)]">
                                          {status}
                                        </span>
                                      </span>
                                    </Link>
                                  </Dialog.Close>
                                );
                              })
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
            {normalizedQuery &&
            filteredWorkspaces.length === 0 &&
            filteredConversations.length === 0 &&
            filteredArtifacts.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[var(--workspace-text-muted)]">
                {t("navigationSearchEmpty")}
              </p>
            ) : null}
          </div>

          <div className="flex min-h-16 shrink-0 items-center gap-2 border-t border-[var(--workspace-border)] px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
            {shareControl}
            {settingsControl}
            <span className="ml-auto">{accountMenu}</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
