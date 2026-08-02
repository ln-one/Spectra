import { ChevronDown, Settings, Shield, Users } from "lucide-react";
import { useTranslations } from "next-intl";

export function NewWorkspaceAdvancedOptions() {
  const t = useTranslations("NewWorkspace");
  const gradeLevels = [
    { id: "primary", label: t("primary") },
    { id: "middle", label: t("middle") },
    { id: "high", label: t("high") },
    { id: "university", label: t("university") },
  ];
  return (
    <details className="group w-full">
      <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-2.5 rounded-full border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-6 py-2.5 text-sm font-bold text-[var(--app-text)] transition-all hover:border-[var(--app-border-strong)] [&::-webkit-details-marker]:hidden">
        <Settings className="h-4 w-4 text-zinc-400" />
        <span>{t("moreOptions")}</span>
        <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-8 w-full overflow-hidden rounded-[2rem] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-xl sm:p-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-3">
            <label
              htmlFor="new-workspace-name"
              className="text-[10px] font-black uppercase tracking-widest text-zinc-400"
            >
              {t("projectName")}
            </label>
            <input
              id="new-workspace-name"
              name="projectName"
              maxLength={200}
              placeholder={t("projectNamePlaceholder")}
              className="h-12 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-3 font-bold text-[var(--app-text)] outline-none transition-all"
            />
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
              {t("gradeLevel")}
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--app-surface-subtle)] p-1 sm:flex">
              {gradeLevels.map((gradeLevel) => (
                <button
                  type="button"
                  disabled
                  key={gradeLevel.id}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all disabled:cursor-not-allowed ${
                    gradeLevel.id === "middle"
                      ? "bg-[var(--app-surface)] text-[var(--app-text)] shadow-sm"
                      : "text-[var(--app-text-faint)]"
                  }`}
                >
                  {gradeLevel.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
              {t("visibility")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--app-primary)] bg-[var(--app-primary)] text-xs font-bold text-[var(--app-on-primary)] shadow-lg disabled:cursor-not-allowed"
              >
                <Shield className="h-4 w-4" />
                {t("private")}
              </button>
              <button
                type="button"
                disabled
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] text-xs font-bold text-[var(--app-text-faint)] disabled:cursor-not-allowed"
              >
                <Users className="h-4 w-4" />
                {t("shared")}
              </button>
            </div>
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-zinc-400">{t("allowReferences")}</p>
                  <p className="text-[11px] text-zinc-500">{t("allowReferencesBody")}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={t("allowReferences")}
                  aria-checked="true"
                  disabled
                  className="inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent bg-[var(--app-primary)] disabled:cursor-not-allowed"
                >
                  <span className="block h-5 w-5 translate-x-5 rounded-full bg-white shadow-lg" />
                </button>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-zinc-500">
                {t("allowReferencesNote")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
