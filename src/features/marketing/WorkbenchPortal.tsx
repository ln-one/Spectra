"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { WorkbenchAssemblyScene } from "./WorkbenchAssemblyScene";

export function WorkbenchPortal() {
  return (
    <main className="marketing-snap-scroll min-h-svh overflow-x-hidden bg-[var(--app-bg)] text-[var(--app-text)] transition-colors">
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
