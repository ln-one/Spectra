"use client";

import { ArrowRight, Github } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
import {
  STUDIO_TOOL_IDS,
  STUDIO_TOOL_PRESENTATIONS,
} from "@/features/workspaces/workbench/studioTools";
import { WorkbenchAssemblyScene } from "./WorkbenchAssemblyScene";

export function WorkbenchPortal() {
  const t = useTranslations("Workbench");
  const marketing = useTranslations("Marketing");

  return (
    <main className="marketing-snap-scroll min-h-svh overflow-x-hidden bg-[var(--app-bg)] text-[var(--app-text)] transition-colors">
      <WorkbenchAssemblyScene />

      <section className="relative flex min-h-screen min-h-[100dvh] items-center overflow-hidden border-t border-[var(--app-border-strong)] bg-[var(--app-surface)] transition-colors">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(720px at 50% -8%, rgba(139,92,246,0.12), transparent 70%), radial-gradient(640px at 10% 96%, rgba(14,165,233,0.09), transparent 70%), radial-gradient(560px at 92% 88%, rgba(245,158,11,0.07), transparent 70%)",
          }}
        />
        {/* Refraction caustics — overlapping radial spectrum blobs, no hard edges */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[60%] h-[420px] w-[min(1080px,96vw)] -translate-x-1/2 -translate-y-1/2 blur-[38px]"
          style={{
            background:
              "radial-gradient(300px 190px at 24% 52%, rgba(139,92,246,0.5), transparent 70%), radial-gradient(330px 210px at 43% 44%, rgba(56,189,248,0.52), transparent 70%), radial-gradient(300px 190px at 60% 56%, rgba(45,212,191,0.44), transparent 70%), radial-gradient(310px 200px at 76% 46%, rgba(251,113,133,0.5), transparent 70%), radial-gradient(280px 180px at 90% 56%, rgba(251,146,60,0.5), transparent 70%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[60%] h-40 w-[min(620px,70vw)] -translate-x-1/2 -translate-y-1/2 blur-[24px]"
          style={{
            background:
              "radial-gradient(180px 90px at 30% 50%, rgba(196,181,253,0.65), transparent 70%), radial-gradient(200px 100px at 52% 46%, rgba(125,211,252,0.62), transparent 70%), radial-gradient(190px 95px at 72% 54%, rgba(253,164,175,0.6), transparent 70%), radial-gradient(170px 85px at 88% 48%, rgba(253,186,116,0.62), transparent 70%)",
          }}
        />
        {/* Faint refracted streaks fanning upward, radial mask so no rectangle shows */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[58%] h-[480px] w-[min(1200px,100vw)] -translate-x-1/2 -translate-y-full opacity-40"
          style={{
            background:
              "conic-gradient(from 248deg at 50% 100%, transparent 0deg, rgba(139,92,246,0.5) 12deg, transparent 24deg, rgba(59,130,246,0.5) 38deg, transparent 52deg, rgba(20,184,166,0.45) 66deg, transparent 80deg, rgba(244,63,94,0.5) 94deg, transparent 108deg, rgba(249,115,22,0.5) 122deg, transparent 136deg)",
            maskImage: "radial-gradient(60% 100% at 50% 100%, black 20%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(60% 100% at 50% 100%, black 20%, transparent 78%)",
          }}
        />
        <div
          data-workspace-style="mist-zinc"
          data-workspace-theme="mist-zinc"
          className="relative mx-auto flex w-full max-w-[1120px] flex-col items-center px-5 py-24 text-center sm:px-8 sm:py-32"
        >
          <p className="text-sm font-semibold tracking-[0.16em] text-violet-500">
            {marketing("portalClosingEyebrow")}
          </p>
          <h2 className="mt-5 text-4xl font-bold tracking-[-0.045em] text-[var(--app-text)] sm:text-5xl">
            {marketing("portalClosingTitle")}
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--app-text-muted)] sm:text-lg">
            {marketing("portalClosingBody")}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
            {STUDIO_TOOL_IDS.map((id) => {
              const { Icon, labelKey, tone } = STUDIO_TOOL_PRESENTATIONS[id];
              return (
                <span
                  key={id}
                  data-studio-tone={tone}
                  className="flex cursor-default items-center gap-2 rounded-full border border-white/70 bg-white/55 py-1.5 pl-1.5 pr-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_18px_rgba(24,24,27,0.08)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/70 hover:shadow-md dark:border-white/15 dark:bg-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] dark:hover:bg-white/15"
                >
                  <span className="workspace-tool-icon-container flex h-7 w-7 items-center justify-center rounded-full border">
                    <Icon className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <span className="text-[13px] font-medium text-[var(--workspace-text-primary)]">
                    {t(labelKey)}
                  </span>
                </span>
              );
            })}
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/auth/register"
              className="group relative inline-flex h-12 items-center gap-2.5 overflow-hidden rounded-full border border-white/30 bg-zinc-950/60 pl-7 pr-6 text-sm font-semibold text-white shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.45),inset_0_-2px_6px_rgba(139,92,246,0.35),0_12px_36px_rgba(76,29,149,0.4)] backdrop-blur-2xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:bg-zinc-950/50 hover:shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.55),inset_0_-2px_8px_rgba(139,92,246,0.45),0_16px_46px_rgba(76,29,149,0.48)]"
            >
              {/* Specular reflection — a skewed band of light sweeping the glass */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-y-2 left-[-20%] w-[55%] -skew-x-[24deg] bg-gradient-to-r from-transparent via-white/30 to-transparent"
              />
              {/* Iridescent body tint */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-90"
                style={{
                  background:
                    "linear-gradient(115deg, rgba(167,139,250,0.3) 0%, transparent 34%, transparent 64%, rgba(56,189,248,0.28) 100%)",
                }}
              />
              {/* Rainbow caustic refracted along the bottom edge */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-5 bottom-[3px] h-[3px] rounded-full bg-gradient-to-r from-violet-400/80 via-sky-300/70 to-orange-300/80 blur-[3px]"
              />
              <span className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                {marketing("portalClosingPrimaryCta")}
              </span>
              <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/auth/login"
              className="relative inline-flex h-12 items-center overflow-hidden rounded-full border border-white/80 bg-white/35 px-7 text-sm font-medium text-[var(--app-text)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,1),inset_0_-2px_5px_rgba(148,163,184,0.25),0_10px_26px_rgba(24,24,27,0.1)] backdrop-blur-2xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:bg-white/55 dark:border-white/20 dark:bg-white/10 dark:shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.2)] dark:hover:bg-white/15"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-y-2 left-[-25%] w-[60%] -skew-x-[24deg] bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/15"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-5 bottom-[3px] h-[3px] rounded-full bg-gradient-to-r from-violet-400/60 via-sky-300/55 to-orange-300/60 blur-[3px]"
              />
              <span className="relative">{marketing("portalClosingSecondaryCta")}</span>
            </Link>
          </div>

          <footer className="mt-20 flex w-full flex-wrap items-center justify-between gap-4 border-t border-[var(--app-border)] pt-8 text-sm text-[var(--app-text-muted)]">
            <Link href="/welcome" className="flex items-center gap-2" aria-label="Spectra 首页">
              <SpectraLogo className="h-6 w-6" blendMode="normal" />
              <span className="font-semibold text-[var(--app-text)]">Spectra</span>
            </Link>
            <p>{marketing("portalClosingFooter")}</p>
            <div className="flex items-center gap-3">
              <p>© 2026 Spectra</p>
              <a
                aria-label="View Spectra on GitHub"
                className="transition-colors hover:text-[var(--app-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
                href="https://github.com/ln-one/Spectra"
                rel="noreferrer"
                target="_blank"
                title="View Spectra on GitHub"
              >
                <Github aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
          </footer>
        </div>
      </section>
    </main>
  );
}
