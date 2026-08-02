"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";

export default function WorkspacesError({ reset }: { reset: () => void }) {
  const t = useTranslations("Errors");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-6">
      <div className="w-full max-w-xl rounded-[2.5rem] border border-red-500/20 bg-[var(--app-surface)] p-12 text-center shadow-xl">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--app-danger-bg)]">
          <Bell className="h-10 w-10 text-[var(--app-danger)]" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--app-text)]">{t("workspaceLoadTitle")}</h1>
        <p className="mt-4 leading-relaxed text-[var(--app-text-muted)]">
          {t("workspaceLoadBody")}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-8 rounded-full bg-[var(--app-primary)] px-8 py-3 font-medium text-[var(--app-on-primary)]"
        >
          {t("retry")}
        </button>
      </div>
    </main>
  );
}
