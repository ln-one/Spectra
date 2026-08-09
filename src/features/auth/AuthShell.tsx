import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SpectraLogo } from "@/components/icons/SpectraLogo";

export function AuthShell({
  title,
  subtitle,
  prismTitle,
  prismSubtitle,
  children,
}: {
  title: string;
  subtitle: string;
  prismTitle: string;
  prismSubtitle: string;
  children: ReactNode;
}) {
  const t = useTranslations("Common");

  return (
    <main className="flex h-screen min-h-screen w-full bg-[var(--app-surface)] text-[var(--app-text)]">
      <section className="relative hidden h-screen w-1/2 items-center justify-center overflow-hidden bg-zinc-950 lg:flex">
        <Image
          src="/images/prism_core_bg.png"
          alt="Spectra knowledge prism"
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover opacity-90"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-zinc-950/20" />
        <div className="auth-copy-enter absolute bottom-12 left-12 right-12 z-10">
          <h2 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-white">
            {prismTitle}
          </h2>
          <p className="text-lg font-medium tracking-wide text-zinc-400">{prismSubtitle}</p>
        </div>
      </section>

      <section className="relative flex h-screen min-h-screen w-full flex-col overflow-y-auto px-5 pb-10 pt-24 sm:p-8 lg:w-1/2">
        <Link
          href="/welcome"
          className="absolute left-5 top-5 inline-flex min-h-10 items-center text-sm font-medium text-[var(--app-text-muted)] transition-colors hover:text-[var(--app-text)] sm:left-8 sm:top-8"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("backToStart")}
        </Link>

        <div className="my-auto flex w-full flex-col items-center">
          <div className="auth-form-enter w-full max-w-[400px] space-y-6">
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <SpectraLogo className="h-24 w-24 sm:h-28 sm:w-28" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[var(--app-text)]">
                  {title}
                </h1>
                <p className="mt-2 text-[var(--app-text-muted)]">{subtitle}</p>
              </div>
            </div>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
