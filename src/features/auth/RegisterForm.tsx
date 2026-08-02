"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuthInput } from "./AuthInput";
import { onboardPrincipal } from "./actions";
import { authClient } from "./client";
import { loginHref } from "./redirect";
import { handleError, normalizeHandle, passwordError } from "./validators";

export function RegisterForm({
  redirectPath,
  onboardingOnly: initialOnboardingOnly,
  signUpEnabled,
}: {
  redirectPath: string;
  onboardingOnly: boolean;
  signUpEnabled: boolean;
}) {
  const t = useTranslations("Auth");
  const [accountReady, setAccountReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [onboardingOnly, setOnboardingOnly] = useState(initialOnboardingOnly);
  const [requestedPasskey, setRequestedPasskey] = useState(false);

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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const shouldCreatePasskey = onboardingOnly
      ? requestedPasskey
      : !(submitter instanceof HTMLButtonElement && submitter.value === "password");
    const form = new FormData(event.currentTarget);
    const handle = normalizeHandle(String(form.get("handle") ?? ""));
    const invalidHandle = handleError(handle);
    if (invalidHandle) {
      setError(t(invalidHandle === "handle_reserved" ? "handleReserved" : "handleInvalid"));
      return;
    }

    setIsSubmitting(true);
    try {
      if (!onboardingOnly) {
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

        const signUp = await authClient.signUp.email({ email, password, name: handle });
        if (signUp.error) {
          setError(
            "code" in signUp.error && signUp.error.code === "PASSWORD_COMPROMISED"
              ? t("passwordCompromised")
              : t("registrationFailed"),
          );
          return;
        }
        setRequestedPasskey(shouldCreatePasskey);
        setOnboardingOnly(true);
      }

      const onboarding = await onboardPrincipal(handle);
      if (!onboarding.ok) {
        if (onboarding.code === "handle_unavailable") {
          setOnboardingOnly(true);
          setError(t("handleUnavailable"));
          return;
        }
        setError(t("onboardingFailed"));
        return;
      }

      if (shouldCreatePasskey) {
        setAccountReady(true);
        const passkeyCreated = await createPasskey();
        if (!passkeyCreated) return;
      }

      window.location.assign(redirectPath);
    } catch {
      setError(t("registrationUnavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createPasskey() {
    if (!window.PublicKeyCredential) {
      setError(t("passkeyUnsupported"));
      return false;
    }

    try {
      const result = await authClient.passkey.addPasskey({
        authenticatorAttachment: "platform",
        name: t("primaryPasskeyName"),
      });
      if (result.error) {
        setError(
          "code" in result.error && result.error.code === "REGISTRATION_CANCELLED"
            ? t("passkeyCancelled")
            : t("passkeyEnrollmentFailed"),
        );
        return false;
      }
      return true;
    } catch {
      setError(t("passkeyEnrollmentFailed"));
      return false;
    }
  }

  async function retryPasskey() {
    setError(null);
    setIsSubmitting(true);
    try {
      if (await createPasskey()) window.location.assign(redirectPath);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (accountReady) {
    return (
      <div className="space-y-5 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--app-surface-muted)] text-[var(--app-text)]">
          <Fingerprint className="h-7 w-7" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-[var(--app-text)]">
            {t("accountCreatedTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">
            {t("passkeyEnrollmentDescription")}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-[var(--app-danger)]">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void retryPasskey()}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] text-base font-semibold text-[var(--app-on-primary)] shadow-xl transition-[box-shadow,opacity] hover:bg-[var(--app-primary-hover)] disabled:cursor-wait disabled:opacity-70"
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Fingerprint className="mr-2 h-5 w-5" />
          )}
          {isSubmitting ? t("creatingPasskey") : t("createPasskey")}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => window.location.assign(redirectPath)}
          className="h-10 w-full text-sm font-medium text-[var(--app-text-muted)] transition hover:text-[var(--app-text)] disabled:opacity-60"
        >
          {t("skipPasskey")}
        </button>
      </div>
    );
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
        name="credentialMode"
        value="passkey"
        disabled={isSubmitting}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] text-base font-semibold text-[var(--app-on-primary)] shadow-xl transition-[box-shadow,opacity] hover:bg-[var(--app-primary-hover)] disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : !onboardingOnly ? (
          <Fingerprint className="mr-2 h-5 w-5" />
        ) : null}
        {isSubmitting
          ? t("processing")
          : onboardingOnly
            ? t("finishOnboarding")
            : t("registerWithPasskey")}
      </button>
      {!onboardingOnly ? (
        <>
          <button
            type="submit"
            name="credentialMode"
            value="password"
            disabled={isSubmitting}
            className="h-10 w-full text-sm font-medium text-[var(--app-text-muted)] transition hover:text-[var(--app-text)] disabled:opacity-60"
          >
            {t("registerWithPassword")}
          </button>
          <p className="pt-1 text-center text-sm text-[var(--app-text-muted)]">
            {t("hasAccount")}{" "}
            <Link
              href={loginHref(redirectPath)}
              className="inline-flex min-h-6 items-center font-medium text-[var(--app-text)] transition-colors hover:text-blue-600 hover:underline"
            >
              {t("loginNow")}
            </Link>
          </p>
        </>
      ) : null}
    </form>
  );
}
