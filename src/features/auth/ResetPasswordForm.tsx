"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuthError } from "./AuthError";
import { AuthInput } from "./AuthInput";
import { authClient } from "./client";
import { loginHref } from "./redirect";
import { passwordError } from "./validators";

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError(t("passwordResetInvalid"));
      return;
    }
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    const invalidPassword = passwordError(password);
    if (invalidPassword === "password_short") {
      setError(t("passwordTooShort", { count: password.length }));
      return;
    }
    if (invalidPassword === "password_long") {
      setError(t("passwordTooLong"));
      return;
    }
    if (invalidPassword === "password_classes") {
      setError(t("passwordClasses"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(t("passwordResetInvalid"));
        return;
      }
      setCompleted(true);
    } catch {
      setError(t("passwordResetUnavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (completed) {
    return (
      <div className="space-y-6 text-center">
        <p className="rounded-xl bg-[var(--app-info-bg)] p-4 text-sm leading-6 text-[var(--app-info)]">
          {t("passwordResetCompleted")}
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
        label={t("newPassword")}
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder={t("newPasswordPlaceholder")}
        minLength={8}
        maxLength={128}
        disabled={isSubmitting}
      />
      <AuthInput
        label={t("confirmPassword")}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        placeholder={t("confirmPasswordPlaceholder")}
        minLength={8}
        maxLength={128}
        disabled={isSubmitting}
      />
      {error ? <AuthError message={error} /> : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] text-base font-semibold text-[var(--app-on-primary)] shadow-xl transition-[box-shadow,opacity] hover:bg-[var(--app-primary-hover)] disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? t("processing") : t("resetPassword")}
      </button>
    </form>
  );
}
