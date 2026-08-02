"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef } from "react";
import type { Workspace } from "../types";
import type { WorkspaceRenameFormAction, WorkspaceRenameFormState } from "./types";

export function WorkspaceRenameDialog({
  action,
  onOpenChange,
  onRenamed,
  open,
  workspace,
}: {
  action: WorkspaceRenameFormAction;
  onOpenChange: (open: boolean) => void;
  onRenamed: (workspaceName: string) => void;
  open: boolean;
  workspace: Workspace;
}) {
  const t = useTranslations("Dashboard");
  const [state, formAction, pending] = useActionState(action, null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.status !== "success") return;
    onRenamed(state.workspaceName);
    onOpenChange(false);
  }, [onOpenChange, onRenamed, state]);

  const errorMessage = (value: Exclude<WorkspaceRenameFormState, null>) => {
    if (value.status === "success") return null;
    if (value.code === "workspace_name_invalid") return t("workspaceNameInvalid");
    if (value.code === "workspace_not_found") return t("workspaceNotFound");
    return t("workspaceRenameFailed");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[121] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl focus:outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
        >
          <Dialog.Title className="pr-10 text-lg font-semibold">
            {t("renameWorkspaceTitle")}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
            {t("renameWorkspaceDescription")}
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={t("closeRenameWorkspace")}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>

          <form action={formAction} className="mt-6 space-y-5">
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <div className="space-y-2">
              <label htmlFor={inputId} className="block text-sm font-medium">
                {t("workspaceName")}
              </label>
              <input
                ref={inputRef}
                id={inputId}
                name="name"
                required
                maxLength={200}
                defaultValue={workspace.name}
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
                {pending ? t("saving") : t("save")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
