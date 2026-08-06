"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AuthInput } from "./AuthInput";
import { postSignInDestination } from "./actions";
import { authClient } from "./client";
import { forgotPasswordHref, registerHref } from "./redirect";

export function LoginForm({ redirectPath }: { redirectPath: string }) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [isPasskeySubmitting, setIsPasskeySubmitting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => setIsClientReady(true), []);

  useEffect(() => {
    let active = true;

    async function preloadPasskey() {
      if (
        !window.PublicKeyCredential ||
        !PublicKeyCredential.isConditionalMediationAvailable ||
        !(await PublicKeyCredential.isConditionalMediationAvailable())
      ) {
        return;
      }

      const result = await authClient.signIn.passkey({ autoFill: true });
      if (!active || result.error) return;
      window.location.assign(await postSignInDestination(redirectPath));
    }

    void preloadPasskey();
    return () => {
      active = false;
    };
  }, [redirectPath]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        const verificationRequired =
          ("code" in result.error && result.error.code === "EMAIL_NOT_VERIFIED") ||
          ("status" in result.error && result.error.status === 403);
        setError(verificationRequired ? t("emailVerificationRequired") : t("loginInvalid"));
        return;
      }
      window.location.assign(await postSignInDestination(redirectPath));
    } catch {
      setError(t("loginUnavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signInWithPasskey() {
    setError(null);
    if (!window.PublicKeyCredential) {
      setError(t("passkeyUnsupported"));
      return;
    }

    setIsPasskeySubmitting(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result.error) {
        setError(
          "code" in result.error && result.error.code === "AUTH_CANCELLED"
            ? t("passkeyCancelled")
            : t("passkeyLoginFailed"),
        );
        return;
      }
      window.location.assign(await postSignInDestination(redirectPath));
    } catch {
      setError(t("passkeyLoginFailed"));
    } finally {
      setIsPasskeySubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <AuthInput
        label={t("email")}
        name="email"
        type="email"
        autoComplete="username webauthn"
        placeholder="you@example.com"
        disabled={isSubmitting || isPasskeySubmitting}
      />
      <AuthInput
        label={t("password")}
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder={t("passwordPlaceholder")}
        minLength={8}
        disabled={isSubmitting || isPasskeySubmitting}
      />
      {error ? (
        <p role="alert" className="text-sm font-medium text-[var(--app-danger)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!isClientReady || isSubmitting || isPasskeySubmitting}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--app-primary)] text-base font-semibold text-[var(--app-on-primary)] shadow-xl transition-[box-shadow,opacity] hover:bg-[var(--app-primary-hover)] disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
        {isSubmitting ? t("loggingIn") : t("login")}
      </button>
      <div className="text-right">
        <Link
          href={forgotPasswordHref()}
          className="text-sm font-medium text-[var(--app-text-muted)] transition-colors hover:text-[var(--app-text)] hover:underline"
        >
          {t("forgotPassword")}
        </Link>
      </div>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--app-border)]" />
        <span className="text-xs font-medium text-[var(--app-text-muted)]">{t("or")}</span>
        <span className="h-px flex-1 bg-[var(--app-border)]" />
      </div>
      <button
        type="button"
        disabled={!isClientReady || isSubmitting || isPasskeySubmitting}
        onClick={() => void signInWithPasskey()}
        className="flex h-12 w-full items-center justify-center rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] text-base font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-muted)] disabled:cursor-wait disabled:opacity-70"
      >
        {isPasskeySubmitting ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <Fingerprint className="mr-2 h-5 w-5" />
        )}
        {isPasskeySubmitting ? t("passkeyLoggingIn") : t("loginWithPasskey")}
      </button>
      <p className="pt-4 text-center text-sm text-[var(--app-text-muted)]">
        {t("noAccount")}{" "}
        <Link
          href={registerHref(redirectPath)}
          className="inline-flex min-h-6 items-center font-medium text-[var(--app-text)] transition-colors hover:text-blue-600 hover:underline"
        >
          {t("registerNow")}
        </Link>
      </p>
    </form>
  );
}
