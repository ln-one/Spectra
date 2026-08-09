"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuthError } from "./AuthError";
import { AuthInput } from "./AuthInput";
import { authClient } from "./client";
import { loginHref, resetPasswordHref } from "./redirect";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) {
      setError(t("emailRequired"));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: resetPasswordHref(),
      });
      if (result.error) {
        setError(t("passwordResetUnavailable"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("passwordResetUnavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <p className="rounded-xl bg-[var(--app-info-bg)] p-4 text-sm leading-6 text-[var(--app-info)]">
          {t("passwordResetEmailSent")}
        </p>
        <Link
          href={loginHref("/workspaces")}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] font-semibold text-[var(--app-on-primary)]"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <AuthInput
        label={t("email")}
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        disabled={isSubmitting}
      />
      {error ? <AuthError message={error} /> : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] text-base font-semibold text-[var(--app-on-primary)] shadow-xl transition-[box-shadow,opacity] hover:bg-[var(--app-primary-hover)] disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? t("processing") : t("sendPasswordReset")}
      </button>
      <p className="text-center text-sm text-[var(--app-text-muted)]">
        <Link
          href={loginHref("/workspaces")}
          className="font-medium hover:text-[var(--app-text)] hover:underline"
        >
          {t("backToLogin")}
        </Link>
      </p>
    </form>
  );
}
