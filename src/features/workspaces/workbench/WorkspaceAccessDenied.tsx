import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SpectraLogo } from "@/components/icons/SpectraLogo";

export async function WorkspaceAccessDenied({
  name,
  ownerHandle,
}: {
  name: string;
  ownerHandle: string;
}) {
  const t = await getTranslations("Workbench");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-6 text-[var(--app-text)]">
      <section className="w-full max-w-lg rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] p-8 text-center shadow-xl">
        <SpectraLogo className="mx-auto h-14 w-14" />
        <p className="mt-5 text-sm font-semibold text-[var(--app-text-muted)]">
          {t("accessRestricted")}
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight">{name}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-text-muted)]">
          {t("accessRestrictedDescription", { handle: ownerHandle })}
        </p>
        <div className="mt-7 flex justify-center">
          <Link
            href="/workspaces"
            className="rounded-xl bg-[var(--app-primary)] px-5 py-3 text-sm font-bold text-[var(--app-on-primary)]"
          >
            {t("backToWorkspaces")}
          </Link>
        </div>
      </section>
    </main>
  );
}
