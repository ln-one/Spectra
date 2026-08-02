"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
import { WorkbenchAssemblyScene } from "./WorkbenchAssemblyScene";

export function WorkbenchPortal() {
  const reducedMotion = useReducedMotion();

  return (
    <main className="marketing-snap-scroll min-h-svh overflow-x-hidden bg-[var(--app-bg)] text-[var(--app-text)] transition-colors">
      <section className="relative flex h-screen h-[100dvh] items-center justify-center px-5 sm:px-8">
        <header className="absolute inset-x-0 top-0 mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 sm:px-8">
          <Link href="/welcome" className="flex items-center gap-2.5" aria-label="Spectra 首页">
            <SpectraLogo className="h-9 w-9" blendMode="normal" />
            <span className="text-xl font-bold tracking-tight">Spectra</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm font-medium">
            <Link
              href="/auth/login"
              className="rounded-full px-4 py-2 text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
            >
              登录
            </Link>
            <Link
              href="/auth/register"
              className="rounded-full bg-[var(--app-primary)] px-5 py-2 text-[var(--app-on-primary)] shadow-sm transition hover:bg-[var(--app-primary-hover)]"
            >
              开始创作
            </Link>
          </nav>
        </header>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.55 }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--app-text-muted)]">
            SPECTRA KNOWLEDGE WORKBENCH
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-[-0.055em] text-[var(--app-text)] sm:text-6xl">
            让资料，变成正在发生的创作。
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[var(--app-text-muted)] sm:text-lg">
            资料、对话与六种创作方式，始终在同一个工作台里。先理解，再表达。
          </p>
        </motion.div>
        <p className="absolute bottom-8 text-xs font-medium tracking-[0.14em] text-[var(--app-text-muted)]">
          向下查看工作台
        </p>
      </section>

      <WorkbenchAssemblyScene />

      <section className="flex h-screen h-[100dvh] items-center border-t border-[var(--app-border-strong)] bg-[var(--app-surface)] py-20 transition-colors sm:py-28">
        <div className="mx-auto grid max-w-[1120px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold tracking-[0.16em] text-violet-500">ONE CONTEXT</p>
            <h2 className="mt-4 text-4xl font-bold tracking-[-0.045em] text-[var(--app-text)]">
              从一个真实的工作台开始。
            </h2>
          </div>
          <div>
            <p className="text-lg leading-8 text-[var(--app-text-muted)]">
              门户不再讲一堆虚构能力。它先让人看见 Spectra
              实际如何工作：右侧资料成为上下文，中间对话推进行动，左侧工具把知识变成不同的作品。
            </p>
            <Link
              href="/auth/register"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[var(--app-primary)] px-5 py-3 text-sm font-semibold text-[var(--app-on-primary)] shadow-lg transition hover:-translate-y-0.5 hover:bg-[var(--app-primary-hover)]"
            >
              进入工作台 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
