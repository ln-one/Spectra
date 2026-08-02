"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function ArtifactHistoryDeleteDialog({
  artifact,
  onDelete,
  onOpenChange,
}: {
  artifact: { id: string; title: string } | null;
  onDelete: (artifactId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Workbench");
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");

  return (
    <AlertDialog.Root
      open={artifact !== null}
      onOpenChange={(open) => {
        if (state === "pending") return;
        if (!open) setState("idle");
        onOpenChange(open);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[121] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl">
          <AlertDialog.Title className="text-lg font-semibold">
            {t("deleteArtifactTitle")}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
            {t("deleteArtifactDescription", { title: artifact?.title ?? "" })}
          </AlertDialog.Description>
          {state === "error" ? (
            <p role="alert" className="mt-4 text-sm text-[var(--app-danger)]">
              {t("artifactDeleteFailed")}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                disabled={state === "pending"}
                className="h-10 rounded-xl border border-[var(--app-border-strong)] px-4 text-sm font-medium transition hover:bg-[var(--app-surface-muted)] disabled:opacity-60"
              >
                {t("cancel")}
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              disabled={state === "pending" || !artifact}
              onClick={async () => {
                if (!artifact) return;
                setState("pending");
                try {
                  await onDelete(artifact.id);
                  setState("idle");
                  onOpenChange(false);
                } catch {
                  setState("error");
                }
              }}
              className="h-10 rounded-xl bg-[var(--app-danger)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {state === "pending" ? t("deletingArtifact") : t("deleteArtifactConfirm")}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
