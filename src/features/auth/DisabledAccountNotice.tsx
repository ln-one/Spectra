"use client";

import { Loader2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "./client";

export function DisabledAccountNotice() {
  const t = useTranslations("Auth");
  const account = useTranslations("Account");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setIsSigningOut(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(account("signOutFailed"));
        return;
      }
      window.location.assign("/auth/login");
    } catch {
      setError(account("signOutFailed"));
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="space-y-6 text-center">
      <p className="rounded-xl bg-[var(--app-warning-bg)] p-4 text-sm leading-6 text-[var(--app-warning)]">
        {t("disabledNotice")}
      </p>
      <button
        type="button"
        onClick={signOut}
        disabled={isSigningOut}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] font-semibold text-[var(--app-on-primary)] disabled:cursor-wait disabled:opacity-70"
      >
        {isSigningOut ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <LogOut className="mr-2 h-5 w-5" />
        )}
        {isSigningOut ? account("signingOut") : account("signOut")}
      </button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-[var(--app-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
