import { ArrowRight, Library, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
import type { CreateWorkspaceFormState } from "./types";

export function NewWorkspaceHero({
  errorCode,
  isPending,
}: {
  errorCode: NonNullable<CreateWorkspaceFormState>["code"] | undefined;
  isPending: boolean;
}) {
  const t = useTranslations("NewWorkspace");
  const errorMessage = errorCode ? t(errorCode) : null;
  return (
    <section className="group relative">
      <div className="absolute -inset-1 rounded-[2.5rem] bg-gradient-to-r from-blue-500 to-purple-600 opacity-15 blur transition duration-500 group-focus-within:opacity-40" />
      <div className="relative space-y-6 rounded-[2rem] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl sm:space-y-8 sm:rounded-[2.5rem] sm:p-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
              <SpectraLogo className="h-8 w-8" />
            </span>
            <h2 className="text-xl font-black tracking-tight text-[var(--app-text)] sm:text-2xl">
              {t("idea")} <span className="text-blue-600">{t("ideaSuffix")}</span>
            </h2>
          </div>
          <textarea
            aria-label={t("idea")}
            name="idea"
            required
            maxLength={5_000}
            placeholder={t("ideaPlaceholder")}
            className="min-h-[160px] w-full resize-none rounded-2xl border-none bg-[var(--app-surface-subtle)] p-4 text-base font-bold leading-relaxed text-[var(--app-text)] outline-none ring-0 placeholder:text-[var(--app-text-faint)] focus:ring-0 sm:min-h-[200px] sm:text-2xl"
          />
          {errorMessage ? (
            <p role="alert" className="text-sm font-bold text-[var(--app-danger)]">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-stretch justify-between gap-4 border-t border-[var(--app-border)] pt-6 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
            <button
              type="button"
              disabled
              title={t("uploadUnavailable")}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl px-6 font-bold text-blue-700 transition-all hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed"
            >
              <Paperclip className="h-5 w-5" />
              {t("importFiles")}
            </button>
            <button
              type="button"
              disabled
              title={t("libraryUnavailable")}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl px-6 font-bold text-purple-700 transition-all hover:bg-purple-50 hover:text-purple-800 disabled:cursor-not-allowed"
            >
              <Library className="h-5 w-5" />
              {t("importLibrary")}
            </button>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-[1.5rem] bg-[var(--app-primary)] px-10 text-lg font-black text-[var(--app-on-primary)] shadow-2xl transition-all disabled:cursor-wait disabled:opacity-70 sm:w-auto"
          >
            <span>{isPending ? t("creating") : t("start")}</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
