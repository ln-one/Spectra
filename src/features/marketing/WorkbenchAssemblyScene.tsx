"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef } from "react";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
import { sourceIconStyle } from "@/features/sources/ui/SourcePresentationIcon";
import { sourceFilePresentation } from "@/features/sources/ui/source-file-presentation";
import { SOURCE_ICON_PALETTE } from "@/features/sources/ui/source-icon-palette";
import {
  PUBLIC_PREVIEW_SOURCE_SPECS,
  PublicWorkbenchPreview,
} from "@/features/workspaces/workbench/PublicWorkbenchPreview";
import {
  STUDIO_TOOL_IDS,
  STUDIO_TOOL_PRESENTATIONS,
} from "@/features/workspaces/workbench/studioTools";

const TOOL_RAY_COLORS = {
  orange: "#f97316",
  blue: "#3b82f6",
  teal: "#14b8a6",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  green: "#22c55e",
} as const;

// Act 1 — sources scattered on the right side of the hero.
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

const GATHER_SLOT_RIGHT = "clamp(28px, 4.5vw, 72px)";

// Act 5 — artifacts materialize at the end of each refracted ray.
const toolPositions = [
  { left: "clamp(24px, 4vw, 64px)", top: "8%", rotate: -6 },
  { left: "clamp(260px, 23vw, 370px)", top: "13%", rotate: 4 },
  { left: "clamp(125px, 12vw, 190px)", top: "32%", rotate: 5 },
  { left: "clamp(330px, 29vw, 460px)", top: "43%", rotate: -4 },
  { left: "clamp(18px, 3vw, 48px)", top: "59%", rotate: -3 },
  { left: "clamp(230px, 20vw, 320px)", top: "73%", rotate: 6 },
] as const;

const PARTICLES_PER_SOURCE = 2;
const PARTICLE_IDS = ["first", "second"] as const;
const PORTAL_ACTS = [
  { key: "portalActGather", detailKey: "portalActGatherDetail" },
  { key: "portalActContext", detailKey: "portalActContextDetail" },
  { key: "portalActPrism", detailKey: "portalActPrismDetail" },
  { key: "portalActRefraction", detailKey: "portalActRefractionDetail" },
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
          const header = stage.querySelector<HTMLElement>("[data-portal-header]");
          const hero = stage.querySelector<HTMLElement>("[data-portal-hero]");
          const scrollHint = stage.querySelector<HTMLElement>("[data-portal-hint]");
          const actCopyQueries = PORTAL_ACTS.map((_act, index) =>
            stage.querySelector<HTMLElement>(`[data-portal-act="${index}"]`),
          );
          const gatherSlots = Array.from(stage.querySelectorAll<HTMLElement>("[data-gather-slot]"));
          const sourceCards = Array.from(
            stage.querySelectorAll<HTMLElement>("[data-portal-source]"),
          );
          const toolCards = Array.from(stage.querySelectorAll<HTMLElement>("[data-portal-tool]"));
          const particles = Array.from(
            stage.querySelectorAll<HTMLElement>("[data-portal-particle]"),
          );
          const glow = stage.querySelector<HTMLElement>("[data-portal-glow]");
          const prism = stage.querySelector<HTMLElement>("[data-portal-prism]");
          const prismShine = stage.querySelector<HTMLElement>("[data-prism-shine]");
          const prismBlobs = Array.from(stage.querySelectorAll<HTMLElement>("[data-prism-blob]"));
          const raysSvg = stage.querySelector<SVGSVGElement>("[data-portal-rays]");
          const beamPaths = Array.from(stage.querySelectorAll<SVGPathElement>("[data-beam]"));
          const exitGlows = Array.from(stage.querySelectorAll<HTMLElement>("[data-exit-glow]"));
          const rayHalos = Array.from(stage.querySelectorAll<SVGPathElement>("[data-ray-halo]"));
          const rayCores = Array.from(stage.querySelectorAll<SVGPathElement>("[data-ray-core]"));
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

          if (
            !shell ||
            sourceCards.length === 0 ||
            toolCards.length === 0 ||
            !raysSvg ||
            actCopyQueries.some((copy) => !copy)
          ) {
            return;
          }
          const actCopies = actCopyQueries as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];

          const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;

          // Measure with layout geometry (offsetLeft/offsetTop chain) instead of live
          // getBoundingClientRect: elements are mid-transform while function values are
          // evaluated, but flight coordinates must describe the transform-free layout.
          const measureWithinStage = (element: HTMLElement) => {
            let x = 0;
            let y = 0;
            let node: HTMLElement | null = element;
            while (node && node !== stage) {
              x += node.offsetLeft;
              y += node.offsetTop;
              node = node.offsetParent as HTMLElement | null;
            }
            return {
              width: element.offsetWidth,
              height: element.offsetHeight,
              centerX: x + element.offsetWidth / 2,
              centerY: y + element.offsetHeight / 2,
            };
          };

          const flyDelta = (card: HTMLElement, target: HTMLElement | undefined) => {
            if (!target) return { x: 0, y: 0 };
            const cardBox = measureWithinStage(card);
            const targetBox = measureWithinStage(target);
            return {
              x: targetBox.centerX - cardBox.centerX,
              y: targetBox.centerY - cardBox.centerY,
            };
          };

          const fitCardToTarget = (card: HTMLElement, target: HTMLElement | undefined) => {
            if (!target) return null;
            const cardBox = measureWithinStage(card);
            const targetBox = measureWithinStage(target);
            if (cardBox.width === 0 || cardBox.height === 0) return null;
            return {
              scaleX: targetBox.width / cardBox.width,
              scaleY: targetBox.height / cardBox.height,
              x: targetBox.centerX - cardBox.centerX,
              y: targetBox.centerY - cardBox.centerY,
            };
          };

          const stageCenterX = () => stage.clientWidth / 2;
          const stageCenterY = () => stage.clientHeight / 2;

          // Refit rays, particle origins and card widths to the current layout.
          // Runs before ScrollTrigger re-invalidates function-based tween values.
          // Card widths are synced to the real panel slots in CSS (not transform),
          // so the landing flight is a pure translation — no stretched, blurry text.
          const layoutFx = () => {
            const width = stage.clientWidth;
            const height = stage.clientHeight;
            raysSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
            const cx = width / 2;
            const cy = height / 2;
            sourceCards.forEach((card, index) => {
              const target = targetSources[index];
              if (target && target.offsetWidth > 0) card.style.width = `${target.offsetWidth}px`;
            });
            toolCards.forEach((card, index) => {
              const target = targetTools[index];
              if (target && target.offsetWidth > 0) card.style.width = `${target.offsetWidth}px`;
            });
            // The white beam enters the right facet, crosses the glass, and all six
            // rays leave from one shared exit point on the left facet. The CSS prism
            // spans (cx, cy-108) apex → (cx±106, cy+82) base corners.
            const entryX = cx + 56;
            const entryY = cy - 8;
            const exitY = cy + 6;
            const exitX = cx - (106 * (exitY - (cy - 108))) / 190 - 2;
            beamPaths.forEach((path) => {
              path.setAttribute("d", `M ${entryX} ${entryY} L ${exitX} ${exitY}`);
              const length = path.getTotalLength();
              path.style.strokeDasharray = `${length}`;
              path.style.strokeDashoffset = `${length}`;
            });
            exitGlows.forEach((glowSpot) => {
              glowSpot.style.left = `${exitX}px`;
              glowSpot.style.top = `${exitY}px`;
            });
            rayCores.forEach((core, index) => {
              const card = toolCards[index];
              const halo = rayHalos[index];
              if (!card || !halo) return;
              const cardBox = measureWithinStage(card);
              const tx = cardBox.centerX;
              const ty = cardBox.centerY;
              const d = `M ${exitX} ${exitY} C ${exitX + (tx - exitX) * 0.3} ${
                exitY + (ty - exitY) * 0.12
              }, ${exitX + (tx - exitX) * 0.72} ${exitY + (ty - exitY) * 0.88}, ${tx} ${ty}`;
              core.setAttribute("d", d);
              halo.setAttribute("d", d);
              for (const path of [core, halo]) {
                const length = path.getTotalLength();
                path.style.strokeDasharray = `${length}`;
                path.style.strokeDashoffset = `${length}`;
              }
            });
            particles.forEach((particle, index) => {
              const slot = gatherSlots[Math.floor(index / PARTICLES_PER_SOURCE)];
              if (!slot) return;
              const slotBox = measureWithinStage(slot);
              particle.dataset.originX = `${slotBox.centerX + (((index * 53) % 17) - 8)}`;
              particle.dataset.originY = `${slotBox.centerY + (((index * 97) % 23) - 11)}`;
            });
          };

          gsap.set(shell, { opacity: 0, scale: 0.955, transformOrigin: "50% 50%" });
          gsap.set(panelContents, { opacity: 0 });
          gsap.set([...targetSources, ...targetTools], { opacity: 0 });
          gsap.set(sourceCards, {
            force3D: false,
            transformOrigin: "50% 50%",
            rotation: (_index, element: HTMLElement) =>
              prefersReducedMotion ? 0 : Number(element.dataset.assemblyRotation ?? 0),
          });
          gsap.set(toolCards, {
            force3D: false,
            opacity: 0,
            scale: 0.66,
            y: 12,
            transformOrigin: "50% 50%",
            rotation: (_index, element: HTMLElement) =>
              prefersReducedMotion ? 0 : Number(element.dataset.assemblyRotation ?? 0),
          });
          gsap.set(actCopies, { opacity: 0, y: 14 });
          gsap.set(particles, { opacity: 0, scale: 0.7 });
          gsap.set(raysSvg, { opacity: 0 });
          gsap.set(prismBlobs, { opacity: 0 });
          gsap.set(glow, {
            opacity: 0,
            scale: 0.3,
            transformOrigin: "50% 50%",
            x: 56,
            y: -8,
            xPercent: -50,
            yPercent: -50,
          });
          gsap.set(prism, {
            opacity: 0,
            scale: 0.82,
            transformOrigin: "50% 50%",
            xPercent: -50,
            yPercent: -50,
          });

          const timeline = gsap.timeline({
            defaults: { ease: "power2.inOut" },
            scrollTrigger: {
              anticipatePin: 1,
              end: () => `+=${window.innerHeight * 4.4}`,
              invalidateOnRefresh: true,
              pin: stage,
              pinSpacing: true,
              scrub: prefersReducedMotion ? true : 0.85,
              start: "top top",
              trigger: section,
            },
          });

          ScrollTrigger.addEventListener("refreshInit", layoutFx);
          layoutFx();

          // Ambient blobs drift slowly so the glass prism picks up living light.
          if (!prefersReducedMotion) {
            const driftX = [18, -16, 12] as const;
            const driftY = [-12, 10, -8] as const;
            prismBlobs.forEach((blob, index) => {
              gsap.to(blob, {
                duration: 6 + index * 1.4,
                ease: "sine.inOut",
                repeat: -1,
                x: driftX[index % driftX.length] ?? 0,
                y: driftY[index % driftY.length] ?? 0,
                yoyo: true,
              });
            });
          }

          const ease = prefersReducedMotion ? "none" : "power2.inOut";

          // ── Act 1 → 2 · sources fall in line and travel together ──────────
          timeline
            .to(hero, { opacity: 0, y: -36, duration: 0.06, ease }, 0.02)
            .to(scrollHint, { opacity: 0, duration: 0.03 }, 0.02)
            .to(actCopies[0], { opacity: 1, y: 0, duration: 0.04 }, 0.05);
          sourceCards.forEach((card, index) => {
            const slot = gatherSlots[index];
            timeline.to(
              card,
              {
                duration: 0.09,
                ease,
                rotation: 0,
                x: () => flyDelta(card, slot).x,
                y: () => flyDelta(card, slot).y,
              },
              0.03 + index * 0.003,
            );
          });

          // ── Act 2 → 3 · knowledge clues converge into one context ─────────
          timeline
            .to(actCopies[0], { opacity: 0, y: -10, duration: 0.03 }, 0.13)
            .to(actCopies[1], { opacity: 1, y: 0, duration: 0.04 }, 0.14);
          particles.forEach((particle, index) => {
            const cardIndex = Math.floor(index / PARTICLES_PER_SOURCE);
            const t0 = 0.15 + cardIndex * 0.006 + (index % PARTICLES_PER_SOURCE) * 0.005;
            timeline
              .fromTo(
                particle,
                {
                  opacity: 0,
                  scale: 0.7,
                  x: () => Number(particle.dataset.originX ?? 0),
                  y: () => Number(particle.dataset.originY ?? 0),
                },
                { duration: 0.015, ease: "none", opacity: 1, scale: 1 },
                t0,
              )
              .to(
                particle,
                {
                  duration: 0.075,
                  ease: prefersReducedMotion ? "none" : "power2.in",
                  x: () => stageCenterX() + 56 + (((index * 31) % 13) - 6),
                  y: () => stageCenterY() - 8 + (((index * 71) % 11) - 5),
                },
                t0 + 0.008,
              )
              .to(particle, { duration: 0.02, ease: "none", opacity: 0, scale: 0.3 }, t0 + 0.068);
          });
          timeline
            .fromTo(
              glow,
              { opacity: 0, scale: 0.3 },
              {
                duration: 0.06,
                ease: prefersReducedMotion ? "none" : "power2.out",
                opacity: 0.95,
                scale: 1,
              },
              0.19,
            )
            .to(sourceCards, { opacity: 0.6, duration: 0.04 }, 0.2);

          // ── Act 3 → 4 · the white context enters the prism ────────────────
          timeline
            .to(actCopies[1], { opacity: 0, y: -10, duration: 0.03 }, 0.22)
            .to(actCopies[2], { opacity: 1, y: 0, duration: 0.04 }, 0.23)
            .to(
              prism,
              {
                duration: 0.05,
                ease: prefersReducedMotion ? "none" : "power2.out",
                opacity: 1,
                scale: 1,
              },
              0.23,
            )
            .to(prismBlobs, { opacity: 1, duration: 0.06, ease }, 0.23)
            .to(glow, { opacity: 0.55, scale: 0.4, duration: 0.05, ease }, 0.26)
            .set(raysSvg, { opacity: 1 }, 0.275)
            .fromTo(
              beamPaths,
              { strokeDashoffset: (_i, element: SVGPathElement) => element.getTotalLength() },
              {
                duration: 0.04,
                ease: prefersReducedMotion ? "none" : "power1.in",
                strokeDashoffset: 0,
              },
              0.29,
            )
            .fromTo(
              prismShine,
              { opacity: 0.1 },
              { duration: 0.03, ease: "none", opacity: 0.5, repeat: 3, yoyo: true },
              0.3,
            );

          // ── Act 4 → 5 · refraction into six creations ─────────────────────
          timeline
            .to(actCopies[2], { opacity: 0, y: -10, duration: 0.03 }, 0.34)
            .to(actCopies[3], { opacity: 1, y: 0, duration: 0.04 }, 0.35)
            .to(glow, { opacity: 0.2, duration: 0.08, ease }, 0.36)
            .fromTo(exitGlows, { opacity: 0 }, { duration: 0.03, ease: "none", opacity: 1 }, 0.335);
          rayCores.forEach((core, index) => {
            const halo = rayHalos[index];
            const paths = halo ? [halo, core] : [core];
            timeline.fromTo(
              paths,
              { strokeDashoffset: (_i, element: SVGPathElement) => element.getTotalLength() },
              {
                duration: 0.075,
                ease: prefersReducedMotion ? "none" : "power1.inOut",
                strokeDashoffset: 0,
              },
              0.345 + index * 0.013,
            );
          });
          timeline.to(
            toolCards,
            {
              duration: 0.05,
              ease: prefersReducedMotion ? "none" : "back.out(1.4)",
              opacity: 1,
              rotation: 0,
              scale: 1,
              stagger: 0.013,
              y: 0,
            },
            0.385,
          );

          // ── Act 5 → 6 · the real workbench emerges ────────────────────────
          timeline
            .to(actCopies[3], { opacity: 0, y: -10, duration: 0.03 }, 0.49)
            .to(header, { opacity: 0, duration: 0.05 }, 0.5)
            .set(header, { pointerEvents: "none" }, 0.55)
            .to(shell, { opacity: 0.4, duration: 0.08, ease }, 0.5)
            .to(panelContents, { opacity: 0.4, duration: 0.06, ease }, 0.53)
            .to(
              [prism, glow, raysSvg, ...exitGlows, ...prismBlobs],
              { opacity: 0, duration: 0.06, ease },
              0.52,
            )
            .to(sourceCards, { opacity: 1, duration: 0.03, ease: "none" }, 0.545);

          sourceCards.forEach((card, index) => {
            const target = targetSources[index];
            if (!target) return;
            timeline.to(
              card,
              {
                duration: 0.16,
                ease: prefersReducedMotion ? "none" : "power3.inOut",
                force3D: false,
                rotation: 0,
                scaleX: () => fitCardToTarget(card, target)?.scaleX ?? 1,
                scaleY: () => fitCardToTarget(card, target)?.scaleY ?? 1,
                x: () => fitCardToTarget(card, target)?.x ?? 0,
                y: () => fitCardToTarget(card, target)?.y ?? 0,
              },
              0.56 + index * 0.008,
            );
          });

          toolCards.forEach((card, index) => {
            const target = targetTools[index];
            if (!target) return;
            timeline.to(
              card,
              {
                duration: 0.15,
                ease: prefersReducedMotion ? "none" : "power3.inOut",
                force3D: false,
                rotation: 0,
                scaleX: () => fitCardToTarget(card, target)?.scaleX ?? 1,
                scaleY: () => fitCardToTarget(card, target)?.scaleY ?? 1,
                x: () => fitCardToTarget(card, target)?.x ?? 0,
                y: () => fitCardToTarget(card, target)?.y ?? 0,
              },
              0.58 + index * 0.01,
            );
          });

          timeline
            .to(shell, { opacity: 1, scale: 1, duration: 0.1, ease }, 0.66)
            .to(panelContents, { opacity: 1, duration: 0.08, ease }, 0.68);

          // ── Act 7 · handover to the real workbench, then settle ───────────
          timeline
            .to(
              [...targetSources, ...targetTools],
              { opacity: 1, duration: 0.04, ease: "none" },
              0.8,
            )
            .to([...sourceCards, ...toolCards], { opacity: 0, duration: 0.05, ease: "none" }, 0.815)
            .to({}, { duration: 0.14 }, 0.86);

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
        className="relative isolate h-screen h-[100dvh] w-full overflow-hidden"
      >
        <header
          data-portal-header
          className="absolute inset-x-0 top-0 z-50 mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 sm:px-8"
        >
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

        <div className="absolute inset-4 z-0 sm:inset-6">
          <div
            data-assembly-workbench
            className="workspace-workbench-background marketing-workbench relative h-full overflow-hidden rounded-[28px] border border-[var(--workspace-border)] bg-[var(--workspace-bg-base)] opacity-0 shadow-[0_26px_70px_rgba(24,24,27,0.15)]"
          >
            <PublicWorkbenchPreview />
          </div>
        </div>

        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
          <svg
            data-portal-rays
            aria-hidden="true"
            className="absolute inset-0 h-full w-full opacity-0"
            fill="none"
          >
            <path
              data-beam
              stroke="#ffffff"
              strokeLinecap="round"
              strokeOpacity="0.32"
              strokeWidth="10"
            />
            <path
              data-beam
              stroke="#ffffff"
              strokeLinecap="round"
              strokeOpacity="0.95"
              strokeWidth="3.5"
            />
            {STUDIO_TOOL_IDS.map((id) => {
              const { tone } = STUDIO_TOOL_PRESENTATIONS[id];
              const color = TOOL_RAY_COLORS[tone];
              return (
                <g key={id}>
                  <path
                    data-ray-halo
                    stroke={color}
                    strokeLinecap="round"
                    strokeOpacity="0.2"
                    strokeWidth="8"
                  />
                  <path
                    data-ray-core
                    stroke={color}
                    strokeLinecap="round"
                    strokeOpacity="0.9"
                    strokeWidth="2.6"
                  />
                </g>
              );
            })}
          </svg>

          {/* Ambient light the glass prism picks up and refracts */}
          <div
            data-prism-blob
            className="absolute left-1/2 top-1/2 -ml-14 -mt-28 h-40 w-40 rounded-full opacity-70 blur-2xl"
            style={{
              background: "radial-gradient(circle, rgba(196,181,253,0.55), transparent 70%)",
            }}
          />
          <div
            data-prism-blob
            className="absolute left-1/2 top-1/2 -ml-36 mt-6 h-44 w-44 rounded-full opacity-60 blur-2xl"
            style={{
              background: "radial-gradient(circle, rgba(186,230,253,0.5), transparent 70%)",
            }}
          />
          <div
            data-prism-blob
            className="absolute left-1/2 top-1/2 ml-4 mt-12 h-32 w-32 rounded-full opacity-60 blur-2xl"
            style={{
              background: "radial-gradient(circle, rgba(254,243,199,0.55), transparent 70%)",
            }}
          />

          <div
            data-portal-glow
            className="absolute left-1/2 top-1/2 h-[300px] w-[300px] rounded-full opacity-0"
            style={{
              background:
                "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(196,181,253,0.35) 42%, transparent 68%)",
            }}
          />

          {/* Frosted-glass prism: real backdrop refraction, not a painted triangle */}
          <div
            data-portal-prism
            className="absolute left-1/2 top-1/2 h-[240px] w-[240px] opacity-0 drop-shadow-[0_24px_44px_rgba(24,24,27,0.2)]"
          >
            <div
              className="absolute inset-0"
              style={{
                clipPath: "polygon(50% 5%, 94% 84%, 6% 84%)",
                background:
                  "linear-gradient(155deg, rgba(255,255,255,0.95) 0%, rgba(203,213,225,0.7) 45%, rgba(255,255,255,0.85) 100%)",
              }}
            />
            <div
              className="absolute inset-[3px]"
              style={{
                clipPath: "polygon(50% 7%, 92% 83%, 8% 83%)",
                backdropFilter: "blur(12px) saturate(1.35) brightness(1.07)",
                WebkitBackdropFilter: "blur(12px) saturate(1.35) brightness(1.07)",
                background:
                  "linear-gradient(165deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.1) 45%, rgba(148,163,184,0.16) 100%)",
              }}
            />
            <div
              className="absolute inset-[3px]"
              style={{
                clipPath: "polygon(50% 7%, 50% 83%, 8% 83%)",
                background:
                  "linear-gradient(115deg, rgba(255,255,255,0.4), rgba(255,255,255,0.05) 65%)",
              }}
            />
            <div
              data-prism-shine
              className="absolute left-[31%] top-[15%] h-[44%] w-[15%] opacity-10"
              style={{
                clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.05))",
              }}
            />
            <div className="absolute left-1/2 top-[87%] h-3.5 w-[68%] -translate-x-1/2 rounded-full bg-[rgba(24,24,27,0.1)] blur-[7px]" />
          </div>

          {/* Exit glow where the rays leave the left facet */}
          <div
            data-exit-glow
            className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50 opacity-0 blur-[7px]"
          />
          <div
            data-exit-glow
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0"
          />

          {PUBLIC_PREVIEW_SOURCE_SPECS.flatMap(([, fileName]) => {
            const presentation = sourceFilePresentation(fileName);
            const color = SOURCE_ICON_PALETTE[presentation.iconTone].light.foreground;
            return PARTICLE_IDS.map((particleId) => (
              <span
                key={`${fileName}-${particleId}`}
                data-portal-particle
                className="absolute left-0 top-0 h-1.5 w-1.5 rounded-full opacity-0"
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 10px ${color}`,
                }}
              />
            ));
          })}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-4 z-30 overflow-hidden rounded-[28px] [backface-visibility:hidden] sm:inset-6"
        >
          {PUBLIC_PREVIEW_SOURCE_SPECS.map(([, fileName], index) => (
            <span
              key={`gather-${fileName}`}
              data-gather-slot
              className="invisible absolute h-[52px] w-[clamp(170px,17vw,228px)]"
              style={{
                right: GATHER_SLOT_RIGHT,
                top: `${10 + index * 9.2}%`,
              }}
            />
          ))}

          {PUBLIC_PREVIEW_SOURCE_SPECS.map(([name, fileName], index) => {
            const presentation = sourceFilePresentation(fileName);
            const Icon = presentation.Icon;
            const position = sourcePositions[index];
            const extension = fileName.split(".").at(-1)?.toUpperCase();
            return (
              <article
                key={fileName}
                data-portal-source
                data-assembly-rotation={position?.rotate ?? 0}
                className="workspace-sources-rail-item absolute z-10 grid min-h-[52px] w-[clamp(170px,17vw,228px)] grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)] p-2.5 shadow-[0_14px_35px_rgba(24,24,27,0.14)] will-change-transform"
                style={{
                  right: position?.right,
                  top: position?.top,
                }}
              >
                <span className="col-span-2 grid min-w-0 grid-cols-[32px_1fr] items-center gap-2.5">
                  <span
                    className="workspace-source-file-icon flex h-8 w-8 items-center justify-center rounded-lg border"
                    style={sourceIconStyle(presentation.iconTone)}
                  >
                    <Icon className="h-[19px] w-[19px]" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-[var(--workspace-text-primary)]">
                      {name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--workspace-text-muted)]">
                      {extension} · 已建立上下文
                    </span>
                  </span>
                </span>
                <span className="flex items-center border-l border-[var(--workspace-border)] pl-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
                data-portal-tool
                data-assembly-rotation={position?.rotate ?? 0}
                data-studio-tone={tone}
                className="workspace-tool-card absolute z-10 isolate flex min-h-[96px] w-[clamp(120px,12vw,160px)] flex-col justify-between overflow-hidden rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-4 opacity-0 shadow-[0_18px_44px_rgba(24,24,27,0.16)] will-change-transform"
                style={{
                  left: position?.left,
                  top: position?.top,
                }}
              >
                <span className="workspace-tool-card-aura pointer-events-none absolute -left-10 -top-10 z-0 h-40 w-40 rounded-full opacity-50" />
                <span className="workspace-tool-icon-container pointer-events-none relative z-10 flex h-10 w-10 items-center justify-center rounded-xl border">
                  <Icon className="h-6 w-6" strokeWidth={2.25} />
                </span>
                <span className="relative z-10 mt-4 flex w-full items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-medium text-[var(--workspace-text-primary)]">
                    {t(labelKey)}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[var(--workspace-text-muted)] opacity-40"
                    strokeWidth={2.5}
                  />
                </span>
                <span className="workspace-tool-card-wash pointer-events-none absolute inset-0 z-0" />
              </article>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-0 z-40">
          <div data-portal-hero className="absolute left-[6%] top-1/2 max-w-xl -translate-y-1/2">
            <p className="text-sm font-semibold tracking-[0.18em] text-[var(--app-text-muted)]">
              {marketing("portalHeroEyebrow")}
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-[-0.055em] text-[var(--app-text)] sm:text-6xl">
              {marketing("portalHeroTitle")}
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[var(--app-text-muted)] sm:text-lg">
              {marketing("portalHeroSubtitle")}
            </p>
          </div>

          {PORTAL_ACTS.map((act, index) => (
            <div
              key={act.key}
              data-portal-act={index}
              className="absolute inset-x-0 top-[9%] flex justify-center px-6 opacity-0"
            >
              <div className="max-w-2xl text-center">
                <p className="text-xl font-bold tracking-[-0.03em] text-[var(--app-text)] sm:text-2xl">
                  {marketing(act.key)}
                </p>
                <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                  {marketing(act.detailKey)}
                </p>
              </div>
            </div>
          ))}

          <p
            data-portal-hint
            className="absolute inset-x-0 bottom-8 text-center text-xs font-medium tracking-[0.14em] text-[var(--app-text-muted)]"
          >
            {marketing("portalHeroHint")}
          </p>
        </div>
      </div>
    </section>
  );
}
