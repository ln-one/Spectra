"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import type { Workspace } from "../types";
import type { WorkspaceSettingsFormAction, WorkspaceSettingsFormState } from "./types";

function SettingsForm({
  action,
  conversationId,
  workspace,
}: {
  action: WorkspaceSettingsFormAction;
  conversationId: string;
  workspace: Workspace;
}) {
  const t = useTranslations("Workbench");
  const [state, formAction, pending] = useActionState(action, null);
  const nameId = useId();
  const slugId = useId();
  const slugHintId = useId();
  const [slug, setSlug] = useState(workspace.slug ?? "");
  const previewSlug = slug.trim().toLowerCase();
  const errorMessage = (value: Exclude<WorkspaceSettingsFormState, null>) => {
    if (value.code === "workspace_settings_invalid") return t("workspaceSettingsInvalid");
    if (value.code === "workspace_slug_conflict") return t("workspaceSlugConflict");
    if (value.code === "workspace_slug_required") return t("workspaceSlugRequired");
    return t("workspaceSettingsFailed");
  };

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <input type="hidden" name="workspaceId" value={workspace.id} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="space-y-2">
        <label htmlFor={nameId} className="block text-sm font-medium">
          {t("workspaceName")}
        </label>
        <input
          id={nameId}
          name="name"
          required
          maxLength={200}
          defaultValue={workspace.name}
          className="h-11 w-full rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] px-3 text-sm transition focus:border-[var(--app-border-strong)] focus:shadow-[0_8px_24px_rgb(0_0_0_/_0.06)] focus-visible:!outline-none"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={slugId} className="block text-sm font-medium">
          {t("workspaceSlug")}
        </label>
        <input
          id={slugId}
          name="slug"
          maxLength={100}
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          aria-describedby={slugHintId}
          className="h-11 w-full rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] px-3 text-sm transition focus:border-[var(--app-border-strong)] focus:shadow-[0_8px_24px_rgb(0_0_0_/_0.06)] focus-visible:!outline-none"
          placeholder={t("workspaceSlugPlaceholder")}
        />
        <span id={slugHintId} className="block text-xs text-[var(--app-text-muted)]">
          {t("workspaceSlugHint")}
        </span>
        <p className="break-all text-xs font-medium text-[var(--app-text)]">
          {previewSlug
            ? t("workspaceSlugPreview", {
                path: `/${workspace.ownerHandle}/${previewSlug}`,
              })
            : t("workspaceSlugInternalPreview")}
        </p>
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
          {pending ? t("savingWorkspaceSettings") : t("saveWorkspaceSettings")}
        </button>
      </div>
    </form>
  );
}

export function WorkspaceSettingsDialog({
  action,
  conversationId,
  workspace,
}: {
  action: WorkspaceSettingsFormAction;
  conversationId: string;
  workspace: Workspace;
}) {
  const t = useTranslations("Workbench");
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="workspace-header-control workspace-header-action-btn flex h-[var(--workspace-control-height)] w-9 items-center justify-center rounded-full border border-transparent transition-colors hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
          aria-label={t("workspaceSettingsTitle")}
        >
          <Settings className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      {open ? (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[121] w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl focus:outline-none">
            <Dialog.Title className="pr-10 text-lg font-semibold">
              {t("workspaceSettingsTitle")}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
              {t("workspaceSettingsDescription")}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
                aria-label={t("closeWorkspaceSettings")}
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
            <SettingsForm action={action} conversationId={conversationId} workspace={workspace} />
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
