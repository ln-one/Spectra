"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { PasskeySettings } from "@/features/auth/PasskeySettings";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";
import { useAppTheme } from "./theme";

const themes = ["system", "light", "dark"] as const;

export function PreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [isChangingLocale, startLocaleTransition] = useTransition();
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("Account");
  const { setTheme, theme } = useAppTheme();

  useEffect(() => setMounted(true), []);

  function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;
    startLocaleTransition(async () => {
      await setLocale(nextLocale);
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open ? (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[121] max-h-[calc(100svh-2rem)] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl focus:outline-none">
            <Dialog.Title className="pr-10 text-lg font-semibold">
              {t("settingsTitle")}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
              {t("settingsDescription")}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
                aria-label={t("closeSettings")}
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>

            <div className="mt-6 space-y-5">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("language")}</legend>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--app-surface-muted)] p-1.5">
                  {(["zh-CN", "en-US"] as const).map((option) => (
                    <label
                      key={option}
                      className={`cursor-pointer rounded-lg px-3 py-2.5 text-center text-sm font-medium focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--app-focus)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--app-surface)] ${locale === option ? "bg-[var(--app-surface)] text-[var(--app-text)] shadow-sm" : "text-[var(--app-text-muted)]"}`}
                    >
                      <input
                        type="radio"
                        name="locale"
                        value={option}
                        checked={locale === option}
                        disabled={isChangingLocale}
                        onChange={() => changeLocale(option)}
                        className="sr-only"
                      />
                      {option === "zh-CN" ? t("chinese") : t("english")}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("appearance")}</legend>
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--app-surface-muted)] p-1.5">
                  {themes.map((option) => (
                    <label
                      key={option}
                      className={`cursor-pointer rounded-lg px-2 py-2.5 text-center text-sm font-medium focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--app-focus)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--app-surface)] ${mounted && theme === option ? "bg-[var(--app-surface)] text-[var(--app-text)] shadow-sm" : "text-[var(--app-text-muted)]"}`}
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={option}
                        checked={mounted && theme === option}
                        disabled={!mounted}
                        onChange={() => setTheme(option)}
                        className="sr-only"
                      />
                      {t(option)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <PasskeySettings />

              <div className="flex justify-end pt-1">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-xl bg-[var(--app-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--app-on-primary)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface)]"
                  >
                    {t("done")}
                  </button>
                </Dialog.Close>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
