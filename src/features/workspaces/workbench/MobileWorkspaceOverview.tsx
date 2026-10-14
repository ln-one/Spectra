"use client";

import { ArrowRight, FileText, MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { WorkspaceConversationNavigationItem } from "./types";

export function MobileWorkspaceOverview({
  conversations,
  newConversationHref,
  ownerHandle,
  sourceCount,
  workspaceHref,
  workspaceName,
}: {
  conversations: readonly WorkspaceConversationNavigationItem[];
  newConversationHref: string;
  ownerHandle: string;
  sourceCount: number;
  workspaceHref: string;
  workspaceName: string;
}) {
  const t = useTranslations("Workbench");
  const format = useFormatter();
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
    <section
      aria-labelledby="mobile-workspace-overview-title"
      className="workspace-mobile-overview h-full overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-5 lg:hidden"
    >
      <div className="mx-auto w-full max-w-xl">
        <p className="text-sm font-medium text-[var(--workspace-text-muted)]">@{ownerHandle}</p>
        <h2
          id="mobile-workspace-overview-title"
          className="mt-1 text-3xl font-bold tracking-tight text-[var(--workspace-heading)]"
        >
          {workspaceName}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--workspace-text-muted)]">
          {t("mobileWorkspaceOverviewDescription")}
        </p>

        <Link
          href={newConversationHref}
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--workspace-text-primary)] px-4 text-sm font-semibold text-[var(--workspace-surface)] shadow-sm outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
        >
          <MessageSquarePlus aria-hidden="true" className="h-5 w-5" />
          {t("newConversation")}
        </Link>

        <div className="mt-7 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--workspace-text-primary)]">
            {t("workspaceConversationsTitle")}
          </h3>
          <span className="text-xs text-[var(--workspace-text-muted)]">
            {t("workspaceConversationCount", { count: conversations.length })}
          </span>
        </div>
        <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)]">
          {conversations.length > 0 ? (
            conversations.map((conversation, index) => (
              <Link
                key={conversation.conversationId}
                href={`${workspaceHref}?conversation=${conversation.conversationId}`}
                className={`group flex min-h-16 items-center gap-3 px-4 outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-ring)] ${index > 0 ? "border-t border-[var(--workspace-border)]" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {conversationLabel(conversation)}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--workspace-text-muted)]">
                    {format.dateTime(new Date(conversation.updatedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Shanghai",
                    })}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-[var(--workspace-text-muted)] transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            ))
          ) : (
            <p className="px-4 py-6 text-center text-sm text-[var(--workspace-text-muted)]">
              {t("noConversationHistory")}
            </p>
          )}
        </div>

        <div className="mt-5 flex min-h-16 items-center gap-3 rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)] px-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--workspace-accent-soft)] text-[var(--workspace-accent)]">
            <FileText aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("sourcesTitle")}</span>
            <span className="mt-0.5 block text-xs text-[var(--workspace-text-muted)]">
              {t("workspaceSourceCount", { count: sourceCount })}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
