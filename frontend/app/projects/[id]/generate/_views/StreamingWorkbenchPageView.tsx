"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Image as ImageIcon, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TooltipProvider } from "@/components/ui/tooltip";
import { generateApi } from "@/lib/sdk";
import { SlideCard } from "./SlideCard";
import { useGeneratePreviewState } from "./useGeneratePreviewState";
import { PreviewHeader } from "./components/PreviewHeader";
import { PreviewSlideStrip } from "./components/PreviewSlideStrip";
import { PreviewFloatingTools } from "./components/PreviewFloatingTools";
import { PptArtifactRenderer } from "./components/PptArtifactRenderer";

export default function StreamingWorkbenchPageView() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : "";

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [projectTitle, setProjectTitle] = useState("PPT Streaming Workbench");
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [fullscreenSlideIndex, setFullscreenSlideIndex] = useState<
    number | null
  >(null);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const activeSlideIndexRef = useRef(0);

  const sessionIdFromQuery = searchParams?.get("session") || null;
  const runIdFromQuery = searchParams?.get("run") || null;
  const artifactIdFromQuery = searchParams?.get("artifact_id") || null;
  const searchQueryString = searchParams?.toString() || "";

  const projectBackHref = (sessionId: string | null) =>
    sessionId
      ? `/projects/${projectId}?session=${encodeURIComponent(sessionId)}`
      : `/projects/${projectId}`;

  const {
    slides,
    isLoading,
    isExporting,
    isResuming,
    regeneratingSlideId,
    previewBlockedReason,
    isSessionGenerating,
    sessionFailureMessage,
    isOutlineGenerating,
    outlineSections,
    slidesContentMarkdown,
    activeSessionId,
    currentArtifactId,
    handleExport,
    handleResume,
    handleRegenerateSlide,
    loadSlides,
  } = useGeneratePreviewState({
    projectId,
    sessionIdFromQuery,
    runIdFromQuery,
    artifactIdFromQuery,
  });

  const orderedSlides = useMemo(
    () => [...slides].sort((a, b) => a.index - b.index),
    [slides]
  );

  useEffect(() => {
    if (!sessionIdFromQuery || runIdFromQuery || !projectId) return;
    let cancelled = false;

    void (async () => {
      try {
        const runsResponse = await generateApi.listRuns(sessionIdFromQuery, {
          limit: 1,
        });
        const latestRunId = runsResponse?.data?.runs?.[0]?.run_id || null;
        if (!latestRunId || cancelled) return;

        const query = new URLSearchParams(searchQueryString);
        query.set("run", latestRunId);
        router.replace(`/projects/${projectId}/generate?${query.toString()}`);
      } catch {
        // Keep legacy session-only URL behavior when run lookup fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    router,
    runIdFromQuery,
    searchQueryString,
    sessionIdFromQuery,
  ]);

  useEffect(() => {
    activeSlideIndexRef.current = activeSlideIndex;
  }, [activeSlideIndex]);

  const renderedSlides = useMemo(
    () =>
      orderedSlides.filter(
        (slide) =>
          Boolean(slide.thumbnail_url) || Boolean(slide.rendered_html_preview)
      ),
    [orderedSlides]
  );
  const pendingSlide = useMemo(
    () =>
      orderedSlides.find(
        (slide) => !slide.thumbnail_url && !slide.rendered_html_preview
      ) ?? null,
    [orderedSlides]
  );
  const hasRenderableContent =
    renderedSlides.length > 0 || Boolean(pendingSlide);
  const shouldRenderArtifactOnly =
    !isLoading &&
    !previewBlockedReason &&
    !hasRenderableContent &&
    !isSessionGenerating &&
    Boolean(projectId && currentArtifactId);

  useEffect(() => {
    if (!leftScrollRef.current) return;
    let rafId: number | null = null;

    const updateActiveSlideByViewport = () => {
      if (!leftScrollRef.current) return;
      const slideElements =
        leftScrollRef.current.querySelectorAll(".slide-card");
      let currentActiveIndex = activeSlideIndexRef.current;
      const containerTop = leftScrollRef.current.scrollTop;
      const containerCenter =
        containerTop + leftScrollRef.current.clientHeight * 0.4;

      slideElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const top = htmlEl.offsetTop;
        const bottom = top + htmlEl.offsetHeight;

        if (containerCenter >= top && containerCenter <= bottom) {
          const idxStr = htmlEl.getAttribute("data-index");
          if (idxStr) {
            currentActiveIndex = parseInt(idxStr, 10);
          }
        }
      });

      if (currentActiveIndex !== activeSlideIndexRef.current) {
        setActiveSlideIndex(currentActiveIndex);
      }
    };

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateActiveSlideByViewport();
      });
    };

    const container = leftScrollRef.current;
    container.addEventListener("scroll", handleScroll, { passive: true });
    updateActiveSlideByViewport();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [orderedSlides]);

  const scrollToSlide = useCallback((index: number) => {
    setActiveSlideIndex(index);
    const slideElement = document.querySelector(`[data-index="${index}"]`);
    if (slideElement) {
      slideElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const fullscreenSlide = useMemo(() => {
    if (fullscreenSlideIndex === null) return null;
    return renderedSlides.find((slide) => slide.index === fullscreenSlideIndex);
  }, [fullscreenSlideIndex, renderedSlides]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20">
        <PreviewHeader
          activeSessionId={activeSessionId}
          isSessionGenerating={isSessionGenerating}
          isEditingTitle={isEditingTitle}
          projectTitle={projectTitle}
          isExporting={isExporting}
          isResuming={isResuming}
          canResume={Boolean(activeSessionId) && !isSessionGenerating}
          onSetEditingTitle={setIsEditingTitle}
          onSetProjectTitle={setProjectTitle}
          onGoBack={() => router.push(projectBackHref(activeSessionId))}
          onExport={handleExport}
          onRefresh={() => {
            void loadSlides();
          }}
          onResume={() => {
            void handleResume();
          }}
        />

        <main className="flex-1 overflow-hidden bg-muted/20 p-3 md:p-5">
          <div className="mx-auto flex h-full w-full max-w-[1800px] gap-3 md:gap-5">
            <section className="min-w-0 flex-1 rounded-2xl border bg-white/80 p-3 md:p-4">
              <div
                ref={leftScrollRef}
                className="h-full overflow-y-auto pr-1 md:pr-2"
              >
                {isOutlineGenerating ? (
                  <div className="mb-4 rounded-xl border bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-semibold text-zinc-700">
                      Outline streaming
                    </p>
                    <div className="space-y-1 text-xs text-zinc-600">
                      {outlineSections.length === 0 ? (
                        <p>Waiting outline sections...</p>
                      ) : (
                        outlineSections.map((section, index) => (
                          <p key={`${index}-${section}`}>
                            {index + 1}. {section}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}

                {sessionFailureMessage ? (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Generation failed: {sessionFailureMessage}
                  </div>
                ) : null}

                {isLoading ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center opacity-70">
                    <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Loading slides...
                    </p>
                  </div>
                ) : previewBlockedReason ? (
                  <div className="flex min-h-[240px] flex-col items-center justify-center opacity-90">
                    <ImageIcon className="mb-4 h-12 w-12 text-muted-foreground/40" />
                    <p className="mb-3 text-sm text-muted-foreground">
                      {previewBlockedReason}
                    </p>
                  </div>
                ) : !hasRenderableContent ? (
                  shouldRenderArtifactOnly && currentArtifactId ? (
                    <PptArtifactRenderer
                      projectId={projectId}
                      artifactId={currentArtifactId}
                      className="min-h-[260px]"
                    />
                  ) : (
                    <div className="flex min-h-[260px] flex-col items-center justify-center opacity-80">
                      <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        Waiting for the first rendered slide...
                      </p>
                    </div>
                  )
                ) : (
                  <AnimatePresence>
                    {renderedSlides.map((slide, i) => (
                      <motion.div
                        key={slide.id || `s-${i}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.35,
                          ease: "easeOut",
                          delay: i * 0.04,
                        }}
                      >
                        <SlideCard
                          slide={slide}
                          isActive={activeSlideIndex === slide.index}
                          onModify={(target) => {
                            void handleRegenerateSlide(target);
                          }}
                          isRegenerating={
                            regeneratingSlideId ===
                            (slide.id || `slide-${slide.index}`)
                          }
                          onOpenPreview={(target) => {
                            setFullscreenSlideIndex(target.index);
                          }}
                        />
                      </motion.div>
                    ))}
                    {isSessionGenerating && pendingSlide ? (
                      <motion.div
                        key={pendingSlide.id || `pending-${pendingSlide.index}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="mb-10 w-full overflow-hidden rounded-2xl border border-dashed bg-zinc-50 p-8 text-zinc-500 shadow-sm"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide">
                          Slide {pendingSlide.index + 1}
                        </p>
                        <p className="mt-3 text-sm">
                          正在生成该页最终渲染效果...
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                )}
              </div>
            </section>

            <aside className="hidden h-full w-[420px] shrink-0 overflow-hidden rounded-2xl border bg-black text-zinc-100 md:flex md:flex-col">
              <header className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-lg font-semibold">slides_content.md</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Current deck markdown content
                </p>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {slidesContentMarkdown.trim() ? (
                  <article className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {slidesContentMarkdown}
                    </ReactMarkdown>
                  </article>
                ) : (
                  <p className="text-base text-zinc-300">
                    Waiting markdown content...
                  </p>
                )}
              </div>
            </aside>
          </div>
        </main>

        {renderedSlides.length > 0 ? (
          <PreviewSlideStrip
            slides={renderedSlides}
            activeSlideIndex={activeSlideIndex}
            onScrollToSlide={scrollToSlide}
          />
        ) : null}
        <PreviewFloatingTools />

        {fullscreenSlide ? (
          <div className="fixed inset-0 z-50 flex bg-black/85">
            <aside className="hidden w-48 flex-col overflow-y-auto border-r border-white/10 bg-black/40 p-3 md:flex">
              {renderedSlides.map((slide) => (
                <button
                  key={slide.id || `thumb-${slide.index}`}
                  type="button"
                  onClick={() => setFullscreenSlideIndex(slide.index)}
                  className={`mb-3 overflow-hidden rounded-lg border text-left ${
                    slide.index === fullscreenSlide.index
                      ? "border-blue-400"
                      : "border-transparent"
                  }`}
                >
                  <img
                    src={slide.thumbnail_url || undefined}
                    alt={slide.title || `Slide ${slide.index + 1}`}
                    className="h-auto w-full object-cover"
                  />
                </button>
              ))}
            </aside>
            <div className="relative flex min-w-0 flex-1 items-center justify-center p-4 md:p-8">
              <button
                type="button"
                onClick={() => setFullscreenSlideIndex(null)}
                className="absolute right-4 top-4 rounded-full border border-white/30 bg-black/40 p-2 text-white hover:bg-black/60"
              >
                <X className="h-5 w-5" />
              </button>
              <img
                src={fullscreenSlide.thumbnail_url || undefined}
                alt={
                  fullscreenSlide.title || `Slide ${fullscreenSlide.index + 1}`
                }
                className="max-h-full max-w-full rounded-lg bg-white object-contain shadow-2xl"
              />
            </div>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
