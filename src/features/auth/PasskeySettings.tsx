"use client";

import type { Passkey } from "@better-auth/passkey";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { authClient } from "./client";

export function PasskeySettings() {
  const locale = useLocale();
  const authT = useTranslations("Auth");
  const t = useTranslations("Account");
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadPasskeys() {
    const result = await authClient.passkey.listUserPasskeys();
    if (result.error) {
      setError(t("passkeyLoadFailed"));
      return;
    }
    setPasskeys(result.data ?? []);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await authClient.passkey.listUserPasskeys();
        if (!active) return;
        if (result.error) {
          setError(t("passkeyLoadFailed"));
          return;
        }
        setPasskeys(result.data ?? []);
      } catch {
        if (active) setError(t("passkeyLoadFailed"));
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [t]);

  async function addPasskey() {
    setError(null);
    if (!window.PublicKeyCredential) {
      setError(authT("passkeyUnsupported"));
      return;
    }

    setIsAdding(true);
    try {
      const result = await authClient.passkey.addPasskey({
        name: t("passkeyDefaultName"),
      });
      if (result.error) {
        setError(
          "code" in result.error && result.error.code === "REGISTRATION_CANCELLED"
            ? authT("passkeyCancelled")
            : t("passkeyAddFailed"),
        );
        return;
      }
      await loadPasskeys();
    } catch {
      setError(t("passkeyAddFailed"));
    } finally {
      setIsAdding(false);
    }
  }

  async function removePasskey(id: string) {
    setError(null);
    setRemovingId(id);
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result.error) {
        setError(t("passkeyDeleteFailed"));
        return;
      }
      setPasskeys((current) => current.filter((passkey) => passkey.id !== id));
    } catch {
      setError(t("passkeyDeleteFailed"));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="space-y-3 border-t border-[var(--app-border)] pt-5">
      <div>
        <h3 className="text-sm font-medium">{t("passkeys")}</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">
          {t("passkeysDescription")}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--app-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("passkeysLoading")}
        </div>
      ) : null}

      {passkeys.length > 0 ? (
        <ul className="space-y-2">
          {passkeys.map((passkey) => (
            <li
              key={passkey.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-3 py-2.5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--app-surface-muted)]">
                <Fingerprint className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {passkey.name || t("passkeyDefaultName")}
                </span>
                <span className="block text-xs text-[var(--app-text-muted)]">
                  {t("passkeyAdded", {
                    date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                      new Date(passkey.createdAt),
                    ),
                  })}
                </span>
              </span>
              <button
                type="button"
                aria-label={t("deletePasskey", {
                  name: passkey.name || t("passkeyDefaultName"),
                })}
                disabled={removingId !== null}
                onClick={() => void removePasskey(passkey.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--app-text-muted)] transition hover:bg-[var(--app-danger-bg)] hover:text-[var(--app-danger)] disabled:cursor-wait disabled:opacity-50"
              >
                {removingId === passkey.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!isLoading && passkeys.length === 0 ? (
        <p className="rounded-xl bg-[var(--app-surface-subtle)] px-3 py-2.5 text-xs text-[var(--app-text-muted)]">
          {t("noPasskeys")}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-medium text-[var(--app-danger)]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={isAdding || isLoading}
        onClick={() => void addPasskey()}
        className="flex h-10 w-full items-center justify-center rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] text-sm font-semibold transition hover:bg-[var(--app-surface-muted)] disabled:cursor-wait disabled:opacity-60"
      >
        {isAdding ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Fingerprint className="mr-2 h-4 w-4" />
        )}
        {isAdding ? t("addingPasskey") : t("addPasskey")}
      </button>
    </section>
  );
}
