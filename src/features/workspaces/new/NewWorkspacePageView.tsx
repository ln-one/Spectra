"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { NewWorkspaceAdvancedOptions } from "./NewWorkspaceAdvancedOptions";
import { NewWorkspaceHero } from "./NewWorkspaceHero";
import type { CreateWorkspaceFormAction } from "./types";

export function NewWorkspacePageView({
  createAction,
}: {
  createAction: CreateWorkspaceFormAction;
}) {
  const t = useTranslations("NewWorkspace");
  const [state, formAction, isPending] = useActionState(createAction, null);
  useEffect(() => {
    document.body.classList.add("overflow-hidden");
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, []);
  return (
    <main className="relative flex h-screen flex-col overflow-x-hidden overflow-y-auto bg-[var(--app-bg)] px-4 text-[var(--app-text)] sm:px-6">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-blue-50 opacity-50 blur-[120px] transition-all duration-1000" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-purple-50 opacity-50 blur-[120px] transition-all duration-1000" />
      </div>

      <Link
        href="/workspaces"
        className="group absolute left-4 top-4 z-10 flex items-center gap-2 text-[var(--app-text-muted)] transition-colors hover:text-[var(--app-text)] sm:left-8 sm:top-8"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--app-border)] transition-all group-hover:bg-[var(--app-surface-subtle)]">
          <ArrowLeft className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold">{t("back")}</span>
      </Link>

      <div className="z-10 flex w-full flex-1 flex-col items-center justify-start pt-16 sm:pt-20">
        <div className="w-full max-w-4xl space-y-5 sm:space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl md:text-5xl">
              {t("title")}
            </h1>
            <p className="text-base font-medium text-[var(--app-text-muted)] sm:text-lg">
              {t("subtitle")}
            </p>
          </div>

          <form action={formAction} className="space-y-4 sm:space-y-5">
            <NewWorkspaceHero errorCode={state?.code} isPending={isPending} />
            <NewWorkspaceAdvancedOptions />
          </form>
        </div>
      </div>

      <p className="relative z-10 pb-4 text-center text-[10px] font-black uppercase tracking-widest text-[var(--app-text-muted)]">
        © 2026 Spectra AI Computing . Next Generation Teaching Engine
      </p>
    </main>
  );
}
