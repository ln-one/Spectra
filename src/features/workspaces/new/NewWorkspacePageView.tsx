"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
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
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden bg-[var(--app-bg)] px-4 text-[var(--app-text)] sm:px-6">
      <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-blue-50 opacity-50 blur-[120px] transition-all duration-1000" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-purple-50 opacity-50 blur-[120px] transition-all duration-1000" />

      <Link
        href="/workspaces"
        className="group absolute left-4 top-4 z-10 flex items-center gap-2 text-[var(--app-text-muted)] transition-colors hover:text-[var(--app-text)] sm:left-8 sm:top-8"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--app-border)] transition-all group-hover:bg-[var(--app-surface-subtle)]">
          <ArrowLeft className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold">{t("back")}</span>
      </Link>

      <div className="z-10 w-full max-w-4xl space-y-8 py-20 sm:space-y-12 sm:py-24">
        <div className="space-y-4 text-center">
          <div className="inline-flex items-center gap-3 rounded-full bg-[var(--app-primary)] px-4 py-2.5 text-[var(--app-on-primary)] shadow-xl sm:px-6">
            <SpectraLogo className="h-8 w-8" blendMode="normal" />
            <span className="text-xs font-black uppercase tracking-[0.2em]">Spectra Agent</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-[var(--app-text)] sm:text-5xl md:text-6xl">
            {t("title")}
          </h1>
          <p className="text-lg font-medium text-[var(--app-text-muted)]">{t("subtitle")}</p>
        </div>

        <form action={formAction} className="space-y-8 sm:space-y-12">
          <NewWorkspaceHero errorCode={state?.code} isPending={isPending} />
          <NewWorkspaceAdvancedOptions />
        </form>
      </div>

      <p className="relative z-10 pb-6 text-center text-[10px] font-black uppercase tracking-widest text-[var(--app-text-muted)] lg:absolute lg:bottom-8 lg:pb-0">
        © 2026 Spectra AI Computing . Next Generation Teaching Engine
      </p>
    </main>
  );
}
