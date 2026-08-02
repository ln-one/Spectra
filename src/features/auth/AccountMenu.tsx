"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PreferencesDialog } from "@/features/preferences/PreferencesDialog";
import { authClient } from "./client";

export function AccountMenu({
  handle,
  email,
  appearance,
}: {
  handle: string;
  email: string;
  appearance: "dashboard" | "workbench";
}) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useTranslations("Account");
  const initial = handle.slice(0, 1).toUpperCase();

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
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t("openMenu")}
          className={
            appearance === "dashboard"
              ? "flex items-center gap-2 rounded-full border-4 border-[var(--app-surface)] bg-[var(--app-surface)]/80 pr-2 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
              : "workspace-avatar-interaction workspace-header-control workspace-header-avatar-btn ml-1 flex h-[var(--workspace-control-height)] w-9 items-center justify-center rounded-full border shadow-sm outline-none transition-all hover:shadow focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
          }
        >
          <span
            className={
              appearance === "dashboard"
                ? "flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white"
                : "flex h-8 w-8 items-center justify-center rounded-full bg-[var(--workspace-surface-muted)] text-xs font-semibold text-[var(--workspace-control-text)]"
            }
          >
            {initial}
          </span>
          {appearance === "dashboard" ? (
            <ChevronDown className="h-4 w-4 text-[var(--app-text-muted)]" />
          ) : null}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[80] w-56 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 text-[var(--app-text)] shadow-2xl outline-none"
        >
          <DropdownMenu.Label className="mb-1.5 rounded-xl bg-[var(--app-surface-subtle)] px-3 py-2.5">
            <span className="block break-words text-sm font-semibold">{handle}</span>
            <span className="mt-0.5 block break-words text-xs font-medium text-[var(--app-text-muted)]">
              {email}
            </span>
          </DropdownMenu.Label>
          <DropdownMenu.Item
            onSelect={() => setSettingsOpen(true)}
            className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium outline-none transition data-[highlighted]:bg-[var(--app-surface-muted)]"
          >
            <Settings className="h-4 w-4" />
            {t("settings")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1.5 h-px bg-[var(--app-border)]" />
          <DropdownMenu.Item
            disabled={isSigningOut}
            onSelect={(event) => {
              event.preventDefault();
              void signOut();
            }}
            className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[var(--app-danger)] outline-none transition data-[disabled]:cursor-wait data-[disabled]:opacity-60 data-[highlighted]:bg-[var(--app-danger-bg)]"
          >
            <LogOut className="h-4 w-4" />
            {isSigningOut ? t("signingOut") : t("signOut")}
          </DropdownMenu.Item>
          {signOutFailed ? (
            <p role="alert" className="px-3 pb-1 pt-1 text-xs font-medium text-[var(--app-danger)]">
              {t("signOutFailed")}
            </p>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
      <PreferencesDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </DropdownMenu.Root>
  );
}
