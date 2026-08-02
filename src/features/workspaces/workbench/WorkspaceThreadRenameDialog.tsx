"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useRef } from "react";
import type { WorkspaceThreadRenameFormAction, WorkspaceThreadRenameFormState } from "./types";

export function WorkspaceThreadRenameDialog({
  action,
  conversationId,
  initialTitle,
  onOpenChange,
  open,
  workspaceId,
}: {
  action: WorkspaceThreadRenameFormAction;
  conversationId: string;
  initialTitle: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  workspaceId: string;
}) {
  const t = useTranslations("Workbench");
  const [state, formAction, pending] = useActionState(action, null);
  const titleId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const errorMessage = (value: Exclude<WorkspaceThreadRenameFormState, null>) => {
    if (value.code === "thread_title_invalid") return t("threadTitleInvalid");
    if (value.code === "thread_not_found") return t("threadNotFound");
    return t("threadRenameFailed");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[121] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl focus:outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleInputRef.current?.focus();
          }}
        >
          <Dialog.Title className="pr-10 text-lg font-semibold">
            {t("renameConversationTitle")}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
            {t("renameConversationDescription")}
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
              aria-label={t("closeRenameConversation")}
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>

          <form action={formAction} className="mt-6 space-y-5">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="conversationId" value={conversationId} />
            <div className="space-y-2">
              <label htmlFor={titleId} className="block text-sm font-medium">
                {t("conversationTitle")}
              </label>
              <input
                ref={titleInputRef}
                id={titleId}
                name="title"
                required
                maxLength={60}
                defaultValue={initialTitle}
                placeholder={t("conversationTitlePlaceholder")}
                className="h-11 w-full rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] px-3 text-sm transition focus:shadow-[0_8px_24px_rgb(0_0_0_/_0.06)] focus-visible:!outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
              />
            </div>

            {state ? (
              <p role="alert" className="text-sm text-[var(--app-danger)]">
                {errorMessage(state)}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="h-10 rounded-xl border border-[var(--app-border-strong)] px-4 text-sm font-medium transition hover:bg-[var(--app-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("cancel")}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="h-10 rounded-xl bg-[var(--app-primary)] px-4 text-sm font-semibold text-[var(--app-on-primary)] transition hover:bg-[var(--app-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? t("savingConversationTitle") : t("saveConversationTitle")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
