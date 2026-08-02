"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { WorkspaceThreadDeleteFormAction, WorkspaceThreadDeleteFormState } from "./types";

export function WorkspaceThreadDeleteDialog({
  action,
  conversationId,
  conversationTitle,
  onOpenChange,
  open,
  workspaceId,
}: {
  action: WorkspaceThreadDeleteFormAction;
  conversationId: string;
  conversationTitle: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  workspaceId: string;
}) {
  const t = useTranslations("Workbench");
  const [state, formAction, pending] = useActionState(action, null);
  const errorMessage = (value: Exclude<WorkspaceThreadDeleteFormState, null>) =>
    value.code === "thread_not_found" ? t("threadNotFound") : t("threadDeleteFailed");

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[121] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl">
          <AlertDialog.Title className="text-lg font-semibold">
            {t("deleteConversationTitle")}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
            {t("deleteConversationDescription", { title: conversationTitle })}
          </AlertDialog.Description>

          <form action={formAction} className="mt-6">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="conversationId" value={conversationId} />
            {state ? (
              <p role="alert" className="mb-4 text-sm text-[var(--app-danger)]">
                {errorMessage(state)}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="h-10 rounded-xl border border-[var(--app-border-strong)] px-4 text-sm font-medium transition hover:bg-[var(--app-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("cancel")}
                </button>
              </AlertDialog.Cancel>
              <button
                type="submit"
                disabled={pending}
                className="h-10 rounded-xl bg-[var(--app-danger)] px-4 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-danger)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? t("deletingConversation") : t("deleteConversationConfirm")}
              </button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
