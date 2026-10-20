"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

export const mobileLastWorkspaceKey = "spectra:mobile:last-workspace";

export type MobileConversationDestination = {
  href: string;
  name: string;
};

export function MobileConversationEntry({
  children,
  destinations,
}: {
  children: ReactNode;
  destinations: readonly MobileConversationDestination[];
}) {
  const router = useRouter();
  const first = destinations[0];

  useEffect(() => {
    if (
      !first ||
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(max-width: 1023px)").matches
    )
      return;
    let href = first.href;
    try {
      const saved = window.localStorage.getItem(mobileLastWorkspaceKey);
      href = destinations.find((destination) => destination.href === saved)?.href ?? href;
    } catch {
      // The most recently updated accessible workspace remains the fallback.
    }
    router.replace(href);
  }, [destinations, first, router]);

  if (!first) return children;
  return (
    <>
      <div className="hidden lg:block">{children}</div>
      <div className="flex min-h-dvh items-center justify-center bg-[var(--app-bg)] px-6 text-[var(--app-text)] lg:hidden">
        <Link
          className="rounded-xl px-5 py-3 text-center font-semibold focus-visible:outline-2"
          href={first.href}
        >
          Spectra · {first.name}
        </Link>
      </div>
    </>
  );
}
