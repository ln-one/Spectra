"use client";

import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Globe2,
  Info,
  KeyRound,
  LogOut,
  Palette,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { authClient } from "@/features/auth/client";
import { PasskeySettings } from "@/features/auth/PasskeySettings";
import { useAppTheme } from "@/features/preferences/theme";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";

const themes = ["system", "light", "dark"] as const;
export function MobileAccountPage({ handle, email }: { handle: string; email: string }) {
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const t = useTranslations("Account");
  if (preferencesOpen) return <MobileAccountPreferences onBack={() => setPreferencesOpen(false)} />;
  return (
    <section className="mx-auto w-full max-w-xl px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-6 sm:px-6">
      <div className="rounded-3xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--workspace-accent)] to-violet-500 text-lg font-bold text-white shadow-sm">
            {handle.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-[var(--workspace-text-primary)]">
              {handle}
            </span>
            <span className="mt-0.5 block truncate text-sm text-[var(--workspace-text-muted)]">
              {email}
            </span>
          </span>
        </div>
      </div>
      <div className="mt-7">
        <p className="px-1 text-xs font-semibold text-[var(--workspace-text-muted)]">
          {t("mobileSettings")}
        </p>
        <button
          type="button"
          onClick={() => setPreferencesOpen(true)}
          className="mt-2 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-4 text-left shadow-sm outline-none transition hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--workspace-surface-muted)] text-[var(--workspace-accent)]">
            <Palette aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--workspace-text-primary)]">
              {t("mobilePreferences")}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[var(--workspace-text-muted)]">
              {t("mobilePreferencesDescription")}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="h-5 w-5 text-[var(--workspace-text-muted)]" />
        </button>
      </div>
      <div className="mt-7">
        <p className="px-1 text-xs font-semibold text-[var(--workspace-text-muted)]">
          {t("mobileAbout")}
        </p>
        <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] shadow-sm">
          <StaticRow icon={CircleHelp} label={t("mobileHelp")} />
          <StaticRow icon={ShieldCheck} label={t("mobileTerms")} />
          <StaticRow icon={Globe2} label={t("mobilePrivacy")} />
          <StaticRow icon={Info} label="Spectra 0.1.0" last />
        </div>
      </div>
      <SignOutButton />
    </section>
  );
}
function MobileAccountPreferences({ onBack }: { onBack: () => void }) {
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
    <section className="mx-auto w-full max-w-xl px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-5 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[var(--workspace-text-primary)] outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
      >
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        {t("mobileBackToAccount")}
      </button>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--workspace-text-primary)]">
        {t("mobilePreferences")}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--workspace-text-muted)]">
        {t("mobilePreferencesDescriptionFull")}
      </p>
      <div className="mt-6 space-y-6">
        <PreferenceCard icon={Globe2} title={t("language")}>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--workspace-surface-muted)] p-1.5">
            {(["zh-CN", "en-US"] as const).map((option) => (
              <label
                key={option}
                className={
                  (locale === option
                    ? "bg-[var(--workspace-surface)] text-[var(--workspace-text-primary)] shadow-sm"
                    : "text-[var(--workspace-text-muted)]") +
                  " cursor-pointer rounded-lg px-3 py-2.5 text-center text-sm font-medium focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--studio-ring)]"
                }
              >
                <input
                  type="radio"
                  name="mobile-locale"
                  checked={locale === option}
                  disabled={isChangingLocale}
                  onChange={() => changeLocale(option)}
                  className="sr-only"
                />
                {option === "zh-CN" ? t("chinese") : t("english")}
              </label>
            ))}
          </div>
        </PreferenceCard>
        <PreferenceCard icon={Palette} title={t("appearance")}>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--workspace-surface-muted)] p-1.5">
            {themes.map((option) => (
              <label
                key={option}
                className={
                  (mounted && theme === option
                    ? "bg-[var(--workspace-surface)] text-[var(--workspace-text-primary)] shadow-sm"
                    : "text-[var(--workspace-text-muted)]") +
                  " cursor-pointer rounded-lg px-2 py-2.5 text-center text-sm font-medium focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--studio-ring)]"
                }
              >
                <input
                  type="radio"
                  name="mobile-theme"
                  checked={mounted && theme === option}
                  disabled={!mounted}
                  onChange={() => setTheme(option)}
                  className="sr-only"
                />
                {t(option)}
              </label>
            ))}
          </div>
        </PreferenceCard>
        <PreferenceCard icon={KeyRound} title={t("passkeys")}>
          <PasskeySettings />
        </PreferenceCard>
      </div>
    </section>
  );
}
function PreferenceCard({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: typeof Palette;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--workspace-text-primary)]">
        <Icon aria-hidden="true" className="h-4 w-4 text-[var(--workspace-accent)]" />
        {title}
      </h2>
      {children}
    </section>
  );
}
function StaticRow({
  icon: Icon,
  label,
  last = false,
}: {
  icon: typeof Info;
  label: string;
  last?: boolean;
}) {
  const t = useTranslations("Account");
  return (
    <div
      className={
        (last ? "" : "border-b border-[var(--workspace-border)]") +
        " flex min-h-13 items-center gap-3 px-4"
      }
    >
      <Icon aria-hidden="true" className="h-5 w-5 text-[var(--workspace-text-muted)]" />
      <span className="min-w-0 flex-1 text-sm font-medium text-[var(--workspace-text-primary)]">
        {label}
      </span>
      {!last ? (
        <span className="text-xs text-[var(--workspace-text-muted)]">{t("mobileComingSoon")}</span>
      ) : null}
    </div>
  );
}
function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const t = useTranslations("Account");
  async function signOut() {
    setIsSigningOut(true);
    setSignOutFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutFailed(true);
        return;
      }
      window.location.assign("/auth/login");
    } catch {
      setSignOutFailed(true);
    } finally {
      setIsSigningOut(false);
    }
  }
  return (
    <div className="mt-8">
      <button
        type="button"
        disabled={isSigningOut}
        onClick={() => void signOut()}
        className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--app-danger)_22%,transparent)] bg-[var(--workspace-surface)] text-sm font-semibold text-[var(--app-danger)] shadow-sm outline-none transition hover:bg-[var(--app-danger-bg)] focus-visible:ring-2 focus-visible:ring-[var(--app-danger)] disabled:cursor-wait disabled:opacity-60"
      >
        <LogOut aria-hidden="true" className="h-5 w-5" />
        {isSigningOut ? t("signingOut") : t("signOut")}
      </button>
      {signOutFailed ? (
        <p role="alert" className="mt-2 text-center text-xs font-medium text-[var(--app-danger)]">
          {t("signOutFailed")}
        </p>
      ) : null}
    </div>
  );
}
