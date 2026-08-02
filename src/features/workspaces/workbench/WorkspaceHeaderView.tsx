"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { QueryClientContext } from "@tanstack/react-query";
import { ChevronDown, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useActionState, useContext, useEffect, useRef, useState } from "react";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
import type {
  WorkspaceConversationNavigationItem,
  WorkspaceHeaderViewProps,
  WorkspaceSettingsFormAction,
  WorkspaceSettingsFormState,
  WorkspaceThreadDeleteFormAction,
  WorkspaceThreadRenameFormAction,
} from "./types";
import { useWorkspaceConversationPages } from "./useWorkspaceConversationPages";
import { WorkspaceThreadDeleteDialog } from "./WorkspaceThreadDeleteDialog";
import { WorkspaceThreadRenameDialog } from "./WorkspaceThreadRenameDialog";

type WorkspaceHeaderViewInput = WorkspaceHeaderViewProps & {
  accountMenu: ReactNode;
  conversationId: string;
  conversationNextCursor?: string | null;
  conversations: readonly WorkspaceConversationNavigationItem[];
  deleteThreadAction: WorkspaceThreadDeleteFormAction;
  newConversationId: string;
  renameThreadAction: WorkspaceThreadRenameFormAction;
  shareControl?: ReactNode;
  canManageSettings?: boolean;
  settingsAction: WorkspaceSettingsFormAction;
  settingsControl: ReactNode;
  workspaceId: string;
  workspaceHref: string;
  workspaceSlug: string | null;
};

export function WorkspaceHeaderView(props: WorkspaceHeaderViewInput) {
  const queryClient = useContext(QueryClientContext);
  if (!queryClient) return <WorkspaceHeaderViewContent {...props} />;
  return <WorkspaceHeaderViewWithPagination {...props} />;
}

function WorkspaceHeaderViewWithPagination(props: WorkspaceHeaderViewInput) {
  const query = useWorkspaceConversationPages({
    initialItems: props.conversations,
    initialNextCursor: props.conversationNextCursor ?? null,
    workspaceId: props.workspaceId,
  });
  const loadedConversations = query.data?.pages.flatMap((page) => page.items) ?? [];
  const conversations = new Map(
    loadedConversations.map((conversation) => [conversation.conversationId, conversation]),
  );
  for (const conversation of props.conversations) {
    conversations.set(conversation.conversationId, conversation);
  }
  return (
    <WorkspaceHeaderViewContent
      {...props}
      conversations={[...conversations.values()]}
      hasNextPage={query.hasNextPage}
      isLoadingNextPage={query.isFetchingNextPage}
      onLoadMore={() => void query.fetchNextPage()}
    />
  );
}

function WorkspaceHeaderViewContent({
  workspaceName,
  threadTitle,
  accountMenu,
  conversationId,
  conversations,
  deleteThreadAction,
  newConversationId,
  renameThreadAction,
  shareControl = null,
  canManageSettings = true,
  settingsAction,
  settingsControl,
  workspaceId,
  workspaceHref,
  workspaceSlug,
  hasNextPage = false,
  isLoadingNextPage = false,
  onLoadMore,
}: WorkspaceHeaderViewInput & {
  hasNextPage?: boolean;
  isLoadingNextPage?: boolean;
  onLoadMore?: () => void;
}) {
  const t = useTranslations("Workbench");
  const format = useFormatter();
  const [conversationToDelete, setConversationToDelete] =
    useState<WorkspaceConversationNavigationItem | null>(null);
  const [conversationToRename, setConversationToRename] =
    useState<WorkspaceConversationNavigationItem | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState(workspaceName);
  const workspaceNameInput = useRef<HTMLInputElement>(null);
  const workspaceNameSubmitting = useRef(false);
  const [workspaceNameState, workspaceNameAction, workspaceNamePending] = useActionState(
    settingsAction,
    null,
  );
  const workspaceNameError = (state: Exclude<WorkspaceSettingsFormState, null>) => {
    if (state.code === "workspace_settings_invalid") return t("workspaceSettingsInvalid");
    if (state.code === "workspace_slug_conflict") return t("workspaceSlugConflict");
    if (state.code === "workspace_slug_required") return t("workspaceSlugRequired");
    return t("workspaceSettingsFailed");
  };
  useEffect(() => {
    if (!editingWorkspaceName) return;
    workspaceNameInput.current?.focus();
    workspaceNameInput.current?.select();
  }, [editingWorkspaceName]);
  const conversationLabel = (conversation: WorkspaceConversationNavigationItem) =>
    conversation.title ??
    t("conversationAt", {
      date: format.dateTime(new Date(conversation.updatedAt), {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }),
    });
  const currentConversation = conversations.find(
    (conversation) => conversation.conversationId === conversationId,
  );
  return (
    <>
      <header className="workspace-header-enter workspace-header-shell relative z-50 grid h-[var(--workspace-header-height)] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 lg:px-6">
        <div className="workspace-header-left flex min-w-0 items-center gap-4">
          <Link
            href="/workspaces"
            aria-label={t("backToWorkspaces")}
            className="group relative flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
          >
            <div className="workspace-logo-interaction relative flex items-center justify-center">
              <SpectraLogo className="h-[60px] w-[60px]" />
            </div>
          </Link>
          <div className="workspace-title-trigger relative -ml-1.5 flex min-w-0 items-center rounded-[var(--workspace-chip-radius)] px-3 py-1.5">
            {editingWorkspaceName ? (
              <form
                action={workspaceNameAction}
                onSubmit={() => {
                  workspaceNameSubmitting.current = true;
                }}
                className="min-w-0"
              >
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input type="hidden" name="conversationId" value={conversationId} />
                <input type="hidden" name="slug" value={workspaceSlug ?? ""} />
                <input
                  aria-label={t("workspaceName")}
                  disabled={workspaceNamePending}
                  maxLength={200}
                  name="name"
                  ref={workspaceNameInput}
                  required
                  value={workspaceNameDraft}
                  onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                  onBlur={(event) => {
                    if (workspaceNameSubmitting.current || workspaceNamePending) return;
                    const name = workspaceNameDraft.trim();
                    if (!name || name === workspaceName) {
                      setWorkspaceNameDraft(workspaceName);
                      setEditingWorkspaceName(false);
                      return;
                    }
                    event.currentTarget.form?.requestSubmit();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    workspaceNameSubmitting.current = false;
                    setWorkspaceNameDraft(workspaceName);
                    setEditingWorkspaceName(false);
                  }}
                  className="workspace-title-text h-10 w-[min(320px,30vw)] rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-2 text-[30px] font-bold leading-[1.05] tracking-tight text-[var(--workspace-heading,#27272a)] outline-none focus:ring-2 focus:ring-[var(--workspace-accent)] disabled:opacity-60"
                />
                {workspaceNameState ? (
                  <p
                    role="alert"
                    className="absolute left-3 top-full mt-1 whitespace-nowrap rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-xs font-medium text-[var(--app-danger)] shadow-md"
                  >
                    {workspaceNameError(workspaceNameState)}
                  </p>
                ) : null}
              </form>
            ) : (
              <h1 className="min-w-0">
                <button
                  type="button"
                  disabled={!canManageSettings}
                  aria-label={
                    canManageSettings
                      ? t("renameWorkspaceNamed", { name: workspaceName })
                      : workspaceName
                  }
                  title={
                    canManageSettings
                      ? t("renameWorkspaceNamed", { name: workspaceName })
                      : workspaceName
                  }
                  onClick={() => {
                    if (!canManageSettings) return;
                    workspaceNameSubmitting.current = false;
                    setWorkspaceNameDraft(workspaceName);
                    setEditingWorkspaceName(true);
                  }}
                  className="workspace-title-text group flex max-w-[320px] min-w-0 items-center gap-2 rounded-lg text-left text-[30px] font-bold leading-[1.05] tracking-tight text-[var(--workspace-heading,#27272a)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)] disabled:cursor-default"
                >
                  <span className="truncate">{workspaceName}</span>
                  {canManageSettings ? (
                    <Pencil className="h-4 w-4 shrink-0 text-[var(--app-text-muted)] opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70" />
                  ) : null}
                </button>
              </h1>
            )}
          </div>
        </div>

        <div className="workspace-thread-wrap flex w-full max-w-[720px] justify-center justify-self-center px-2">
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="workspace-thread-trigger group flex items-center gap-2 rounded-[var(--workspace-control-radius)] px-4 py-2 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
              >
                <span className="workspace-thread-title max-w-[280px] truncate text-[20px] font-bold text-[var(--workspace-heading,#27272a)]">
                  {currentConversation ? conversationLabel(currentConversation) : threadTitle}
                </span>
                <span className="workspace-thread-indicator h-1.5 w-1.5 rounded-full bg-[var(--workspace-success,#10b981)]" />
                <ChevronDown className="workspace-thread-chevron ml-0.5 h-4 w-4 text-[var(--workspace-text-muted)]" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="center"
                sideOffset={6}
                style={{
                  maxHeight:
                    "min(34rem, calc(var(--radix-dropdown-menu-content-available-height) - 0.5rem))",
                }}
                className="z-[110] flex min-w-72 max-w-[min(24rem,calc(100vw-2rem))] flex-col overflow-visible rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1.5 text-[var(--app-text)] shadow-xl"
              >
                <DropdownMenu.Item asChild>
                  <Link
                    href={`${workspaceHref}?conversation=${newConversationId}`}
                    className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-[var(--app-surface-muted)] focus:bg-[var(--app-surface-muted)]"
                  >
                    <Plus className="h-4 w-4" />
                    {t("newConversation")}
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px shrink-0 bg-[var(--app-border)]" />
                <div
                  data-testid="workspace-thread-list"
                  className="workspace-thread-list min-h-0 overflow-y-auto overscroll-contain px-0.5"
                >
                  {conversations.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[var(--app-text-muted)]">
                      {t("noConversationHistory")}
                    </div>
                  ) : (
                    conversations.map((conversation) => {
                      const label = conversationLabel(conversation);
                      const isCurrent = conversation.conversationId === conversationId;
                      return (
                        <div
                          key={conversation.conversationId}
                          className={`group flex items-center rounded-lg transition-colors hover:bg-[var(--app-surface-muted)] focus-within:bg-[var(--app-surface-muted)] ${isCurrent ? "bg-[var(--app-surface-muted)]" : ""}`}
                        >
                          <DropdownMenu.Item asChild>
                            <Link
                              href={`${workspaceHref}?conversation=${conversation.conversationId}`}
                              aria-current={isCurrent ? "page" : undefined}
                              className="min-w-0 flex-1 cursor-pointer truncate rounded-lg px-3 py-2 text-sm outline-none"
                            >
                              {label}
                            </Link>
                          </DropdownMenu.Item>
                          <div className="flex shrink-0 items-center gap-0.5 pr-1.5 text-[var(--app-text-muted)]">
                            <DropdownMenu.Item
                              asChild
                              onSelect={() => setConversationToRename(conversation)}
                            >
                              <button
                                type="button"
                                aria-label={t("renameConversationNamed", { title: label })}
                                title={t("renameConversationNamed", { title: label })}
                                className="flex h-7 w-7 items-center justify-center rounded-md outline-none transition-colors hover:bg-[var(--app-surface)] hover:text-[var(--app-text)] focus:bg-[var(--app-surface)] focus:text-[var(--app-text)]"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              asChild
                              onSelect={() => setConversationToDelete(conversation)}
                            >
                              <button
                                type="button"
                                aria-label={t("deleteConversationNamed", { title: label })}
                                title={t("deleteConversationNamed", { title: label })}
                                className="flex h-7 w-7 items-center justify-center rounded-md outline-none transition-colors hover:bg-[var(--app-danger-bg)] hover:text-[var(--app-danger)] focus:bg-[var(--app-danger-bg)] focus:text-[var(--app-danger)]"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenu.Item>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {hasNextPage ? (
                    <button
                      type="button"
                      disabled={isLoadingNextPage}
                      onClick={onLoadMore}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[var(--app-text-muted)] outline-none transition-colors hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)] focus:bg-[var(--app-surface-muted)] disabled:cursor-wait disabled:opacity-60"
                    >
                      {isLoadingNextPage ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {isLoadingNextPage
                        ? t("loadingMoreConversations")
                        : t("loadMoreConversations")}
                    </button>
                  ) : null}
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        <div className="workspace-header-actions flex items-center gap-2 justify-self-end">
          {shareControl}
          {settingsControl}
          {accountMenu}
        </div>
      </header>
      {conversationToRename ? (
        <WorkspaceThreadRenameDialog
          action={renameThreadAction}
          conversationId={conversationToRename.conversationId}
          initialTitle={conversationToRename.title ?? ""}
          onOpenChange={(open) => {
            if (!open) setConversationToRename(null);
          }}
          open
          workspaceId={workspaceId}
        />
      ) : null}
      {conversationToDelete ? (
        <WorkspaceThreadDeleteDialog
          action={deleteThreadAction}
          conversationId={conversationToDelete.conversationId}
          conversationTitle={conversationLabel(conversationToDelete)}
          onOpenChange={(open) => {
            if (!open) setConversationToDelete(null);
          }}
          open
          workspaceId={workspaceId}
        />
      ) : null}
    </>
  );
}
