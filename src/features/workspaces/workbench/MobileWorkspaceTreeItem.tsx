"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Folder, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  artifactEffectiveGenerationState,
  type WorkspaceArtifactNavigationItem,
} from "@/features/artifacts/types";
import { fetchWorkspaceArtifactHistory } from "@/features/artifacts/workbench-client";
import { studioToolForArtifactKind } from "./artifactWorkbench";
import { fetchWorkspaceConversationPage } from "./read-client";
import { STUDIO_TOOL_PRESENTATIONS } from "./studioTools";
import type { MobileWorkspaceNavigationItem, WorkspaceConversationNavigationItem } from "./types";

type OtherWorkspaceData = {
  conversations: WorkspaceConversationNavigationItem[];
  artifacts: WorkspaceArtifactNavigationItem[];
  nextCursor: string | null;
};

function sectionKey(workspaceId: string, section: string) {
  return `spectra.mobileDrawer.${workspaceId}.${section}`;
}

export function MobileWorkspaceTreeItem({
  workspace,
  current,
  expanded,
  onExpand,
  onNavigate,
  query,
  conversationId,
  conversations,
  artifacts,
  hasNextPage,
  isLoadingNextPage,
  onLoadMore,
}: {
  workspace: MobileWorkspaceNavigationItem;
  current: boolean;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
  onNavigate: () => void;
  query: string;
  conversationId: string;
  conversations: readonly WorkspaceConversationNavigationItem[];
  artifacts: readonly WorkspaceArtifactNavigationItem[];
  hasNextPage: boolean;
  isLoadingNextPage: boolean;
  onLoadMore?: (() => void) | undefined;
}) {
  const t = useTranslations("Workbench");
  const format = useFormatter();
  const [sections, setSections] = useState({
    conversations: true,
    artifacts: true,
  });
  const [otherData, setOtherData] = useState<OtherWorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [_retry, setRetry] = useState(0);

  useEffect(() => {
    try {
      setSections({
        conversations:
          window.localStorage.getItem(sectionKey(workspace.id, "conversations")) !== "collapsed",
        artifacts:
          window.localStorage.getItem(sectionKey(workspace.id, "artifacts")) !== "collapsed",
      });
    } catch {
      setSections({ conversations: true, artifacts: true });
    }
  }, [workspace.id]);

  useEffect(() => {
    if (!expanded || current || otherData) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    void Promise.all([
      fetchWorkspaceConversationPage(workspace.id, null),
      fetchWorkspaceArtifactHistory(workspace.id),
    ])
      .then(([page, workspaceArtifacts]) => {
        if (!active) return;
        setOtherData({
          conversations: page.items,
          artifacts: workspaceArtifacts,
          nextCursor: page.nextCursor,
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [current, expanded, otherData, workspace.id]);

  const shownConversations = current ? conversations : (otherData?.conversations ?? []);
  const shownArtifacts = current ? artifacts : (otherData?.artifacts ?? []);
  const conversationLabel = useCallback(
    (item: WorkspaceConversationNavigationItem) =>
      item.title ??
      t("conversationAt", {
        date: format.dateTime(new Date(item.updatedAt), {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Shanghai",
        }),
      }),
    [format, t],
  );
  const filteredConversations = useMemo(
    () =>
      shownConversations.filter((item) =>
        conversationLabel(item).toLocaleLowerCase().includes(query),
      ),
    [shownConversations, query, conversationLabel],
  );
  const filteredArtifacts = useMemo(
    () => shownArtifacts.filter((item) => item.title.toLocaleLowerCase().includes(query)),
    [shownArtifacts, query],
  );
  const nextCursor = current ? null : (otherData?.nextCursor ?? null);

  function setSection(section: "conversations" | "artifacts") {
    const next = !sections[section];
    setSections((value) => ({ ...value, [section]: next }));
    try {
      window.localStorage.setItem(
        sectionKey(workspace.id, section),
        next ? "expanded" : "collapsed",
      );
    } catch {
      // The tree remains usable when browser storage is unavailable.
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore || !otherData) return;
    setLoadingMore(true);
    try {
      const page = await fetchWorkspaceConversationPage(workspace.id, nextCursor);
      setOtherData((value) =>
        value
          ? {
              ...value,
              conversations: [...value.conversations, ...page.items],
              nextCursor: page.nextCursor,
            }
          : value,
      );
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <div className="flex min-h-11 items-center rounded-xl hover:bg-[var(--workspace-surface-muted)]">
        <Link
          href={`${workspace.href}?view=overview`}
          onClick={onNavigate}
          aria-current={current ? "location" : undefined}
          className={
            "flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] " +
            (current ? "font-semibold" : "font-medium")
          }
        >
          <Folder aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--workspace-accent)]" />
          <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
        </Link>
        <button
          type="button"
          aria-label={t(expanded ? "collapseWorkspaceNavigation" : "expandWorkspaceNavigation", {
            name: workspace.name,
          })}
          aria-expanded={expanded}
          onClick={() => onExpand(!expanded)}
          className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
        >
          <ChevronDown
            aria-hidden="true"
            className={
              "h-4 w-4 text-[var(--workspace-text-muted)] transition-transform " +
              (expanded ? "" : "-rotate-90")
            }
          />
        </button>
      </div>
      {expanded ? (
        <div className="ml-7 border-l border-[var(--workspace-border)] pl-2">
          {loading ? (
            <p className="px-3 py-3 text-xs text-[var(--workspace-text-muted)]">
              {t("workspaceNavigationLoading")}
            </p>
          ) : null}
          {failed ? (
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setRetry((value) => value + 1);
              }}
              className="min-h-10 px-3 text-xs text-[var(--app-danger)]"
            >
              {t("workspaceNavigationRetry")}
            </button>
          ) : null}
          {current || otherData ? (
            <>
              <button
                type="button"
                aria-expanded={sections.conversations}
                onClick={() => setSection("conversations")}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-[var(--workspace-text-muted)] outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${sections.conversations ? "" : "-rotate-90"}`}
                />
                <span className="min-w-0 flex-1">{t("conversationNavigationTitle")}</span>
                <span className="tabular-nums">{shownConversations.length}</span>
              </button>
              {sections.conversations || query ? (
                <div className="space-y-0.5">
                  {filteredConversations.map((item) => (
                    <Dialog.Close asChild key={item.conversationId}>
                      <Link
                        href={`${workspace.href}?conversation=${item.conversationId}`}
                        aria-current={
                          current && item.conversationId === conversationId ? "page" : undefined
                        }
                        className={
                          "block min-h-10 truncate rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] " +
                          (current && item.conversationId === conversationId
                            ? "font-semibold text-[var(--workspace-text-primary)]"
                            : "text-[var(--workspace-text-muted)]")
                        }
                      >
                        {conversationLabel(item)}
                      </Link>
                    </Dialog.Close>
                  ))}
                  {(current ? hasNextPage : Boolean(nextCursor)) ? (
                    <button
                      type="button"
                      disabled={current ? isLoadingNextPage : loadingMore}
                      onClick={current ? onLoadMore : () => void loadMore()}
                      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium text-[var(--workspace-text-muted)] outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:opacity-60"
                    >
                      {(current ? isLoadingNextPage : loadingMore) ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin motion-reduce:animate-none"
                        />
                      ) : null}
                      {t(
                        (current ? isLoadingNextPage : loadingMore)
                          ? "loadingMoreConversations"
                          : "loadMoreConversations",
                      )}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                aria-expanded={sections.artifacts}
                onClick={() => setSection("artifacts")}
                className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-[var(--workspace-text-muted)] outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${sections.artifacts ? "" : "-rotate-90"}`}
                />
                <span className="min-w-0 flex-1">{t("creationResultsTitle")}</span>
                <span className="tabular-nums">{shownArtifacts.length}</span>
              </button>
              {sections.artifacts || query ? (
                <div className="space-y-1 pb-1">
                  {filteredArtifacts.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-[var(--workspace-text-muted)]">
                      {t("creationResultsEmpty")}
                    </p>
                  ) : (
                    filteredArtifacts.map((artifact) => {
                      const toolId = studioToolForArtifactKind(artifact.kind);
                      const presentation = toolId ? STUDIO_TOOL_PRESENTATIONS[toolId] : null;
                      const Icon = presentation?.Icon ?? Folder;
                      const state = artifactEffectiveGenerationState(artifact);
                      const active =
                        state === "queued" || state === "generating" || state === "finalizing";
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
                            href={
                              workspace.href +
                              "?conversation=" +
                              artifact.conversationId +
                              "&artifact=" +
                              artifact.id
                            }
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
                                <Icon aria-hidden="true" className="h-[17px] w-[17px]" />
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
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
