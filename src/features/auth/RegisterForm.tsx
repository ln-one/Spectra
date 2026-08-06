"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuthInput } from "./AuthInput";
import { onboardPrincipal } from "./actions";
import { authClient } from "./client";
import { loginHref, registerHref } from "./redirect";
import { handleError, normalizeHandle, passwordError } from "./validators";

export function RegisterForm({
  redirectPath,
  onboardingOnly,
  signUpEnabled,
}: {
  redirectPath: string;
  onboardingOnly: boolean;
  signUpEnabled: boolean;
}) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);

  if (!signUpEnabled && !onboardingOnly) {
    return (
      <div className="space-y-6 text-center">
        <p className="rounded-xl bg-[var(--app-surface-subtle)] p-4 text-sm leading-6 text-[var(--app-text-muted)]">
          {t("signUpClosed")}
        </p>
        <Link
          href={loginHref(redirectPath)}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] font-semibold text-[var(--app-on-primary)]"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  if (verificationPending) {
    return (
      <div className="space-y-6 text-center">
        <p className="rounded-xl bg-[var(--app-info-bg)] p-4 text-sm leading-6 text-[var(--app-info)]">
          {t("verificationEmailSent")}
        </p>
        <p className="text-sm leading-6 text-[var(--app-text-muted)]">
          {t("verificationEmailSentDescription")}
        </p>
        <Link
          href={loginHref(redirectPath)}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] font-semibold text-[var(--app-on-primary)]"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const handle = normalizeHandle(String(form.get("handle") ?? ""));
    const invalidHandle = handleError(handle);
    if (invalidHandle) {
      setError(t(invalidHandle === "handle_reserved" ? "handleReserved" : "handleInvalid"));
      return;
    }

    setIsSubmitting(true);
    try {
      if (onboardingOnly) {
        const onboarding = await onboardPrincipal(handle);
        if (!onboarding.ok) {
          setError(
            onboarding.code === "handle_unavailable"
              ? t("handleUnavailable")
              : t("onboardingFailed"),
          );
          return;
        }
        window.location.assign(redirectPath);
        return;
      }

      const email = String(form.get("email") ?? "").trim();
      const password = String(form.get("password") ?? "");
      const confirmPassword = String(form.get("confirmPassword") ?? "");
      const invalidPassword = passwordError(password);
      if (invalidPassword) {
        setError(t("passwordLength"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("passwordMismatch"));
        return;
      }

      const signUp = await authClient.signUp.email({
        callbackURL: registerHref(redirectPath, true),
        email,
        name: handle,
        password,
      });
      if (signUp.error) {
        setError(
          "code" in signUp.error && signUp.error.code === "PASSWORD_COMPROMISED"
            ? t("passwordCompromised")
            : t("registrationFailed"),
        );
        return;
      }
      setVerificationPending(true);
    } catch {
      setError(onboardingOnly ? t("onboardingFailed") : t("registrationUnavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {onboardingOnly ? (
        <p className="rounded-xl bg-[var(--app-info-bg)] p-4 text-sm leading-6 text-[var(--app-info)]">
          {t("onboardingNotice")}
        </p>
      ) : null}
      {!onboardingOnly ? (
        <AuthInput
          label={t("email")}
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@example.com"
          disabled={isSubmitting}
        />
      ) : null}
      <AuthInput
        label={t("handle")}
        name="handle"
        autoComplete="nickname"
        placeholder={t("handlePlaceholder")}
        maxLength={39}
        disabled={isSubmitting}
      />
      {!onboardingOnly ? (
        <>
          <AuthInput
            label={t("password")}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder={t("newPasswordPlaceholder")}
            minLength={15}
            maxLength={128}
            disabled={isSubmitting}
          />
          <AuthInput
            label={t("confirmPassword")}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder={t("confirmPasswordPlaceholder")}
            minLength={15}
            maxLength={128}
            disabled={isSubmitting}
          />
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-[var(--app-danger)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] text-base font-semibold text-[var(--app-on-primary)] shadow-xl transition-[box-shadow,opacity] hover:bg-[var(--app-primary-hover)] disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting
          ? t("processing")
          : onboardingOnly
            ? t("finishOnboarding")
            : t("registerAndVerify")}
      </button>
      {!onboardingOnly ? (
        <p className="pt-1 text-center text-sm text-[var(--app-text-muted)]">
          {t("hasAccount")}{" "}
          <Link
            href={loginHref(redirectPath)}
            className="inline-flex min-h-6 items-center font-medium text-[var(--app-text)] transition-colors hover:text-blue-600 hover:underline"
          >
            {t("loginNow")}
          </Link>
        </p>
      ) : null}
    </form>
  );
}
