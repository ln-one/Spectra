"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, Menu, MessageSquarePlus, Search, X } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
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
}) {
  const t = useTranslations("Workbench");
  const format = useFormatter();
  const [query, setQuery] = useState("");
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
  const filteredWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          workspace.name.toLocaleLowerCase().includes(normalizedQuery) ||
          (workspace.id === currentWorkspaceId && filteredConversations.length > 0),
      ),
    [currentWorkspaceId, filteredConversations.length, normalizedQuery, workspaces],
  );

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
    <Dialog.Root defaultOpen={defaultOpen} onOpenChange={(open) => !open && setQuery("")}>
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
          className="workspace-mobile-drawer fixed inset-y-0 left-0 z-[121] flex w-[min(88vw,360px)] flex-col border-r border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)] text-[var(--workspace-text-primary)] shadow-2xl outline-none"
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
                className="h-11 w-full rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] pl-9 pr-3 text-sm outline-none placeholder:text-[var(--workspace-text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
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
                            ? `${workspaceHref}?conversation=${conversationId}&view=overview`
                            : `${workspace.href}?view=overview`
                        }
                        aria-current={current ? "location" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] ${current ? "bg-[var(--workspace-surface-muted)] font-semibold" : "font-medium"}`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--workspace-accent-soft)] text-xs font-bold text-[var(--workspace-accent)]">
                          {workspace.name.slice(0, 1).toLocaleUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                        <ChevronRight
                          aria-hidden="true"
                          className="h-4 w-4 text-[var(--workspace-text-muted)]"
                        />
                      </Link>
                    </Dialog.Close>
                    {current && filteredConversations.length > 0 ? (
                      <div className="ml-7 border-l border-[var(--workspace-border)] pl-2">
                        {filteredConversations.map((conversation) => (
                          <Dialog.Close asChild key={conversation.conversationId}>
                            <Link
                              href={`${workspaceHref}?conversation=${conversation.conversationId}`}
                              aria-current={
                                conversation.conversationId === conversationId ? "page" : undefined
                              }
                              className={`block min-h-10 truncate rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] ${conversation.conversationId === conversationId ? "font-semibold text-[var(--workspace-text-primary)]" : "text-[var(--workspace-text-muted)]"}`}
                            >
                              {conversationLabel(conversation)}
                            </Link>
                          </Dialog.Close>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
            {normalizedQuery &&
            filteredWorkspaces.length === 0 &&
            filteredConversations.length === 0 ? (
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
