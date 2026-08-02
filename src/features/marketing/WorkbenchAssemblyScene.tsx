"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef } from "react";
import { sourceIconStyle } from "@/features/sources/ui/SourcePresentationIcon";
import { sourceFilePresentation } from "@/features/sources/ui/source-file-presentation";
import {
  PUBLIC_PREVIEW_SOURCE_SPECS,
  PublicWorkbenchPreview,
} from "@/features/workspaces/workbench/PublicWorkbenchPreview";
import {
  STUDIO_TOOL_IDS,
  STUDIO_TOOL_PRESENTATIONS,
} from "@/features/workspaces/workbench/studioTools";

const sourcePositions = [
  { right: "clamp(250px, 21vw, 340px)", top: "7%", rotate: -5 },
  { right: "clamp(20px, 3vw, 48px)", top: "15%", rotate: 4 },
  { right: "clamp(310px, 27vw, 430px)", top: "27%", rotate: 3 },
  { right: "clamp(55px, 7vw, 110px)", top: "35%", rotate: -4 },
  { right: "clamp(260px, 23vw, 370px)", top: "47%", rotate: 5 },
  { right: "clamp(18px, 3vw, 48px)", top: "54%", rotate: -3 },
  { right: "clamp(330px, 29vw, 460px)", top: "66%", rotate: -4 },
  { right: "clamp(145px, 13vw, 210px)", top: "73%", rotate: 4 },
  { right: "clamp(24px, 4vw, 64px)", top: "83%", rotate: -5 },
] as const;

const toolPositions = [
  { left: "clamp(24px, 4vw, 64px)", top: "8%", rotate: -6 },
  { left: "clamp(260px, 23vw, 370px)", top: "13%", rotate: 4 },
  { left: "clamp(125px, 12vw, 190px)", top: "32%", rotate: 5 },
  { left: "clamp(330px, 29vw, 460px)", top: "43%", rotate: -4 },
  { left: "clamp(18px, 3vw, 48px)", top: "59%", rotate: -3 },
  { left: "clamp(230px, 20vw, 320px)", top: "73%", rotate: 6 },
] as const;

export function WorkbenchAssemblyScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("Workbench");
  const marketing = useTranslations("Marketing");

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    let disposed = false;
    let cleanup: () => void = () => undefined;

    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (disposed) return;
        const gsap = gsapModule.gsap;
        const ScrollTrigger = scrollTriggerModule.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);

        let resizeObserver: ResizeObserver | undefined;
        const context = gsap.context(() => {
          const shell = stage.querySelector<HTMLElement>("[data-assembly-workbench]");
          const sourceCards = Array.from(
            stage.querySelectorAll<HTMLElement>("[data-assembly-source]"),
          );
          const toolCards = Array.from(stage.querySelectorAll<HTMLElement>("[data-assembly-tool]"));
          const assemblyLabel = stage.querySelector<HTMLElement>("[data-assembly-label]");
          const sourceLabel = stage.querySelector<HTMLElement>("[data-assembly-source-label]");
          const toolLabel = stage.querySelector<HTMLElement>("[data-assembly-tool-label]");
          const gatheringMessage = stage.querySelector<HTMLElement>(
            "[data-assembly-gathering-message]",
          );
          const expressionMessage = stage.querySelector<HTMLElement>(
            "[data-assembly-expression-message]",
          );
          const inputFlow = stage.querySelector<SVGPathElement>("[data-assembly-input-flow]");
          const outputFlow = stage.querySelector<SVGPathElement>("[data-assembly-output-flow]");
          const targetSources = Array.from(
            stage.querySelectorAll<HTMLElement>('[data-source-id^="public-preview-source-"]'),
          );
          const targetTools = Array.from(
            stage.querySelectorAll<HTMLElement>("[data-studio-tool-id]"),
          );
          const panelContents = Array.from(
            stage.querySelectorAll<HTMLElement>(
              '[data-testid="public-preview-chat-panel"], [data-testid="studio-panel"], [data-testid="sources-panel"]',
            ),
          );

          if (!shell || sourceCards.length === 0 || toolCards.length === 0) return;

          const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;

          gsap.set(shell, { opacity: 1, scale: 1 });
          gsap.set(sourceCards, {
            force3D: false,
            rotation: 0,
            transformOrigin: "50% 50%",
          });
          gsap.set(toolCards, {
            force3D: false,
            opacity: 0,
            rotation: 0,
            scale: 0.72,
            transformOrigin: "50% 50%",
            x: 150,
          });

          const fitCardToTarget = (card: HTMLElement, target: HTMLElement | undefined) => {
            if (!target) return null;
            const cardRect = card.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const currentX = Number(gsap.getProperty(card, "x")) || 0;
            const currentY = Number(gsap.getProperty(card, "y")) || 0;
            return {
              scaleX: targetRect.width / card.offsetWidth,
              scaleY: targetRect.height / card.offsetHeight,
              x:
                currentX +
                targetRect.left +
                targetRect.width / 2 -
                (cardRect.left + cardRect.width / 2),
              y:
                currentY +
                targetRect.top +
                targetRect.height / 2 -
                (cardRect.top + cardRect.height / 2),
            };
          };
          gsap.set([...sourceCards, ...toolCards], {
            rotation: (_index, element: HTMLElement) =>
              prefersReducedMotion ? 0 : Number(element.dataset.assemblyRotation ?? 0),
          });

          gsap.set(shell, {
            opacity: 0.035,
            scale: 0.955,
            transformOrigin: "50% 50%",
          });
          gsap.set(panelContents, { opacity: 0.08 });
          gsap.set([...targetSources, ...targetTools], { opacity: 0 });
          gsap.set(toolLabel, { opacity: 0, x: 16 });
          gsap.set(expressionMessage, { opacity: 0, scale: 0.94 });
          gsap.set(inputFlow, { opacity: 0.28, strokeDashoffset: 48 });
          gsap.set(outputFlow, { opacity: 0, strokeDashoffset: 64 });

          const timeline = gsap.timeline({
            defaults: { ease: "power2.inOut" },
            scrollTrigger: {
              anticipatePin: 1,
              end: () => `+=${window.innerHeight * 1.65}`,
              invalidateOnRefresh: true,
              pin: stage,
              pinSpacing: true,
              scrub: prefersReducedMotion ? true : 0.85,
              start: "top top",
              trigger: section,
            },
          });

          timeline
            .to(
              sourceCards,
              {
                duration: 0.24,
                ease: prefersReducedMotion ? "none" : "power2.inOut",
                rotation: 0,
                scale: 0.94,
                x: -72,
              },
              0,
            )
            .to(inputFlow, { opacity: 0.72, strokeDashoffset: 0, duration: 0.22 }, 0)
            .to(gatheringMessage, { scale: 1.04, duration: 0.16, yoyo: true, repeat: 1 }, 0.05)
            .to(sourceLabel, { opacity: 0.42, duration: 0.14 }, 0.18)
            .to(gatheringMessage, { opacity: 0, scale: 0.96, duration: 0.12 }, 0.23)
            .to(inputFlow, { opacity: 0.18, duration: 0.12 }, 0.24)
            .to(sourceCards, { opacity: 0.5, duration: 0.16 }, 0.25)
            .to(expressionMessage, { opacity: 1, scale: 1, duration: 0.18 }, 0.25)
            .to(outputFlow, { opacity: 0.76, strokeDashoffset: 0, duration: 0.24 }, 0.25)
            .to(toolLabel, { opacity: 1, x: 0, duration: 0.16 }, 0.29)
            .to(
              toolCards,
              {
                duration: 0.28,
                ease: prefersReducedMotion ? "none" : "back.out(1.35)",
                opacity: 1,
                scale: 1,
                stagger: 0.025,
                x: 0,
              },
              0.28,
            )
            .to(shell, { opacity: 0.34, scale: 0.982, duration: 0.22 }, 0.46)
            .to(panelContents, { opacity: 0.36, duration: 0.2 }, 0.49);

          sourceCards.forEach((card, index) => {
            const target = targetSources[index];
            if (!target) return;
            timeline.to(
              card,
              {
                duration: 0.38,
                ease: prefersReducedMotion ? "none" : "power3.inOut",
                force3D: false,
                opacity: 1,
                rotation: 0,
                scaleX: () => fitCardToTarget(card, target)?.scaleX ?? 1,
                scaleY: () => fitCardToTarget(card, target)?.scaleY ?? 1,
                x: () => fitCardToTarget(card, target)?.x ?? 0,
                y: () => fitCardToTarget(card, target)?.y ?? 0,
              },
              0.5 + index * 0.018,
            );
          });

          toolCards.forEach((card, index) => {
            const target = targetTools[index];
            if (!target) return;
            timeline.to(
              card,
              {
                duration: 0.36,
                ease: prefersReducedMotion ? "none" : "power3.inOut",
                force3D: false,
                rotation: 0,
                scaleX: () => fitCardToTarget(card, target)?.scaleX ?? 1,
                scaleY: () => fitCardToTarget(card, target)?.scaleY ?? 1,
                x: () => fitCardToTarget(card, target)?.x ?? 0,
                y: () => fitCardToTarget(card, target)?.y ?? 0,
              },
              0.54 + index * 0.022,
            );
          });

          timeline
            .to(shell, { opacity: 1, scale: 1, duration: 0.3 }, 0.67)
            .to(panelContents, { opacity: 1, duration: 0.24 }, 0.7)
            .to(
              [assemblyLabel, sourceLabel, toolLabel, inputFlow, outputFlow],
              { opacity: 0, duration: 0.14 },
              0.71,
            )
            .to(expressionMessage, { opacity: 0, scale: 0.96, duration: 0.12 }, 0.72)
            .to([...targetSources, ...targetTools], { opacity: 1, duration: 0.07 }, 0.94)
            .to([...sourceCards, ...toolCards], { opacity: 0, duration: 0.07 }, 0.94);

          const refresh = () => ScrollTrigger.refresh(true);
          resizeObserver = new ResizeObserver(refresh);
          resizeObserver.observe(stage);

          void document.fonts.ready.then(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!disposed) refresh();
              });
            });
          });
        }, stage);

        cleanup = () => {
          resizeObserver?.disconnect();
          context.revert();
        };
      },
    );

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative w-full">
      <div
        ref={stageRef}
        data-workspace-style="mist-zinc"
        data-workspace-theme="mist-zinc"
        className="relative isolate h-screen h-[100dvh] w-full overflow-hidden p-4 sm:p-6"
      >
        <div
          data-assembly-workbench
          className="workspace-workbench-background marketing-workbench relative z-0 h-full overflow-hidden rounded-[28px] border border-[var(--workspace-border)] bg-[var(--workspace-bg-base)] shadow-[0_26px_70px_rgba(24,24,27,0.15)]"
        >
          <PublicWorkbenchPreview />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-4 z-50 overflow-hidden rounded-[28px] [backface-visibility:hidden] sm:inset-6"
        >
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 1200 800"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="assembly-input-gradient" x1="1" x2="0">
                <stop offset="0" stopColor="var(--workspace-text-muted)" stopOpacity="0.18" />
                <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="assembly-output-gradient" x1="1" x2="0">
                <stop offset="0" stopColor="#8b5cf6" />
                <stop offset="0.34" stopColor="#3b82f6" />
                <stop offset="0.67" stopColor="#14b8a6" />
                <stop offset="1" stopColor="#f97316" />
              </linearGradient>
            </defs>
            <path
              data-assembly-input-flow
              d="M 1160 330 C 930 330, 815 400, 635 400"
              fill="none"
              stroke="url(#assembly-input-gradient)"
              strokeDasharray="7 10"
              strokeLinecap="round"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <path
              data-assembly-output-flow
              d="M 565 400 C 395 400, 300 330, 40 330"
              fill="none"
              stroke="url(#assembly-output-gradient)"
              strokeDasharray="8 11"
              strokeLinecap="round"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div
            data-assembly-tool-label
            className="absolute left-[3%] top-[3%] flex items-center gap-2 rounded-full border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)]/90 px-3 py-1.5 shadow-sm backdrop-blur-md"
          >
            <span className="h-2 w-2 rounded-full bg-gradient-to-br from-orange-400 via-blue-500 to-violet-500" />
            <span className="text-[10px] font-semibold tracking-[0.16em] text-[var(--workspace-text-muted)]">
              {marketing("assemblyOutput")}
            </span>
          </div>

          <div
            data-assembly-source-label
            className="absolute right-[3%] top-[3%] flex items-center gap-2 rounded-full border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)]/90 px-3 py-1.5 shadow-sm backdrop-blur-md"
          >
            <span className="text-[10px] font-semibold tracking-[0.16em] text-[var(--workspace-text-muted)]">
              {marketing("assemblyInput")}
            </span>
            <span className="h-2 w-2 rounded-full bg-violet-500" />
          </div>

          {PUBLIC_PREVIEW_SOURCE_SPECS.map(([name, fileName], index) => {
            const presentation = sourceFilePresentation(fileName);
            const Icon = presentation.Icon;
            const position = sourcePositions[index];
            return (
              <article
                key={fileName}
                data-assembly-source
                data-assembly-rotation={position?.rotate ?? 0}
                className="workspace-sources-rail-item absolute z-10 grid min-h-[58px] w-[clamp(170px,17vw,228px)] grid-cols-[34px_1fr] items-center gap-3 rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)] p-2.5 shadow-[0_14px_35px_rgba(24,24,27,0.14)] will-change-transform"
                style={{
                  right: position?.right,
                  top: position?.top,
                }}
              >
                <span
                  className="workspace-source-file-icon flex h-9 w-9 items-center justify-center rounded-[10px] border"
                  style={sourceIconStyle(presentation.iconTone)}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-[var(--workspace-text-primary)]">
                    {name}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] uppercase text-[var(--workspace-text-muted)]">
                    {fileName.split(".").at(-1)}
                  </span>
                </span>
              </article>
            );
          })}

          {STUDIO_TOOL_IDS.map((id, index) => {
            const { Icon, labelKey, tone } = STUDIO_TOOL_PRESENTATIONS[id];
            const position = toolPositions[index];
            return (
              <article
                key={id}
                data-assembly-tool
                data-assembly-rotation={position?.rotate ?? 0}
                data-studio-tone={tone}
                className="workspace-tool-card absolute z-10 isolate flex h-[132px] w-[clamp(120px,12vw,160px)] flex-col justify-between overflow-hidden rounded-[18px] border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-4 shadow-[0_18px_44px_rgba(24,24,27,0.16)] will-change-transform"
                style={{
                  left: position?.left,
                  top: position?.top,
                }}
              >
                <span className="workspace-tool-card-aura pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-70" />
                <span className="workspace-tool-icon-container relative z-10 flex h-10 w-10 items-center justify-center rounded-xl border">
                  <Icon className="h-6 w-6" strokeWidth={2.25} />
                </span>
                <span className="relative z-10 text-sm font-semibold text-[var(--workspace-text-primary)]">
                  {t(labelKey)}
                </span>
                <span className="workspace-tool-card-wash pointer-events-none absolute inset-0" />
              </article>
            );
          })}

          <div
            data-assembly-label
            className="absolute left-1/2 top-1/2 z-30 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2"
          >
            <span className="absolute inset-0 rounded-full border border-[var(--workspace-border)] opacity-40" />
            <span className="absolute inset-7 rounded-full border border-[var(--workspace-border-strong)] opacity-60" />
            <span className="absolute inset-[42px] rounded-full border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)]/95 shadow-[0_18px_50px_rgba(24,24,27,0.14)] backdrop-blur-xl" />
            <div
              data-assembly-gathering-message
              className="absolute inset-0 flex flex-col items-center justify-center text-center"
            >
              <p className="text-[10px] font-semibold tracking-[0.18em] text-violet-500">
                {marketing("assemblyContext")}
              </p>
              <p className="mt-2 text-base font-semibold tracking-tight text-[var(--workspace-text-primary)]">
                {marketing("assemblyUnderstanding")}
              </p>
              <p className="mt-1 text-[10px] text-[var(--workspace-text-muted)]">
                {marketing("assemblyUnderstandingDetail")}
              </p>
            </div>
            <div
              data-assembly-expression-message
              className="absolute inset-0 flex flex-col items-center justify-center text-center"
            >
              <p className="text-[10px] font-semibold tracking-[0.18em] text-violet-500">
                {marketing("assemblyContext")}
              </p>
              <p className="mt-2 max-w-[150px] text-base font-semibold tracking-tight text-[var(--workspace-text-primary)]">
                {marketing("assemblyExpressing")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
