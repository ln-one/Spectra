"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { generateApi, projectSpaceApi } from "@/lib/sdk";
import { SlideCard } from "./SlideCard";
import { useGeneratePreviewState } from "./useGeneratePreviewState";
import { PreviewHeader } from "./components/PreviewHeader";
import { PreviewFloatingTools } from "./components/PreviewFloatingTools";
import { PreviewSlideStrip } from "./components/PreviewSlideStrip";
import { PptArtifactRenderer } from "./components/PptArtifactRenderer";

export default function GeneratePreviewPage() {
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
  const [projectTitle, setProjectTitle] = useState("生成结果");
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [pptRenderState, setPptRenderState] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const [artifactTypeState, setArtifactTypeState] = useState<{
    artifactId: string;
    type: string | null;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement>(null);
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
    previewMode,
    isSessionGenerating,
    isOutlineGenerating,
    outlineSections,
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
    if (!projectId || !currentArtifactId) return;
    let cancelled = false;

    void (async () => {
      try {
        const detail = await projectSpaceApi.getArtifact(
          projectId,
          currentArtifactId
        );
        if (cancelled) return;
        setArtifactTypeState({
          artifactId: currentArtifactId,
          type: detail?.data?.artifact?.type ?? null,
        });
      } catch {
        if (cancelled) return;
        setArtifactTypeState({
          artifactId: currentArtifactId,
          type: null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentArtifactId, projectId]);

  useEffect(() => {
    activeSlideIndexRef.current = activeSlideIndex;
  }, [activeSlideIndex]);

  useEffect(() => {
    if (!containerRef.current) return;
    let rafId: number | null = null;

    const updateActiveSlideByViewport = () => {
      if (!containerRef.current) return;
      const slideElements =
        containerRef.current.querySelectorAll(".slide-card");
      let currentActiveIndex = activeSlideIndexRef.current;
      const containerTop = containerRef.current.scrollTop;
      const containerCenter =
        containerTop + containerRef.current.clientHeight * 0.4;

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

    const container = containerRef.current;
    container.addEventListener("scroll", handleScroll, { passive: true });
    updateActiveSlideByViewport();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [slides]);

  const scrollToSlide = useCallback((index: number) => {
    setActiveSlideIndex(index);
    const slideElement = document.querySelector(`[data-index="${index}"]`);
    if (slideElement) {
      slideElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const boundArtifactType =
    artifactTypeState?.artifactId === currentArtifactId
      ? artifactTypeState.type
      : null;
  const canRenderRealPpt =
    Boolean(currentArtifactId) && boundArtifactType === "pptx";
  const shouldUseRenderedPreviewFirst = previewMode === "rendered";

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

        <main
          ref={containerRef}
          className="flex-1 overflow-y-auto bg-muted/20 relative scroll-smooth overflow-x-hidden p-4 md:p-8"
        >
          {isOutlineGenerating ? (
            <div className="max-w-4xl mx-auto w-full mb-4 rounded-xl border bg-white/90 p-3 shadow-sm">
              <p className="mb-2 text-xs font-semibold text-zinc-700">
                大纲增量生成中
              </p>
              <div className="space-y-1 text-xs text-zinc-600">
                {outlineSections.length === 0 ? (
                  <p>等待章节事件...</p>
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

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full opacity-70">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground animate-pulse">
                正在加载课件内容...
              </p>
            </div>
          ) : slides.length === 0 ? (
            previewBlockedReason ? (
              <div className="flex flex-col items-center justify-center h-full opacity-90">
                <ImageIcon className="w-12 h-12 text-muted-foreground/40 mb-4" />
                <p className="text-sm text-muted-foreground mb-3">
                  {previewBlockedReason}
                </p>
                <Button
                  onClick={() => router.push(projectBackHref(activeSessionId))}
                  className="rounded-full"
                >
                  返回项目并继续生成
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void handleResume();
                  }}
                  className="rounded-full mt-2"
                  disabled={!activeSessionId || isResuming}
                >
                  {isResuming ? "恢复中..." : "继续会话"}
                </Button>
              </div>
            ) : isSessionGenerating ? (
              <div className="flex flex-col items-center justify-center h-full opacity-80">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-sm text-muted-foreground">
                  正在按大纲生成课件，请稍候...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full opacity-70">
                <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm text-muted-foreground">
                  暂无幻灯片数据，请先生成。
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    void handleResume();
                  }}
                  className="rounded-full mt-3"
                  disabled={!activeSessionId || isResuming}
                >
                  {isResuming ? "恢复中..." : "继续会话"}
                </Button>
              </div>
            )
          ) : (
            <div
              className={
                previewMode === "rendered"
                  ? "mx-auto w-full max-w-[1400px] pb-32"
                  : "mx-auto w-full max-w-4xl pb-32"
              }
              ref={slidesRef}
            >
              {canRenderRealPpt &&
              currentArtifactId &&
              !shouldUseRenderedPreviewFirst ? (
                <PptArtifactRenderer
                  className="mb-4"
                  projectId={projectId}
                  artifactId={currentArtifactId}
                  onRenderStateChange={setPptRenderState}
                />
              ) : null}

              {currentArtifactId &&
              boundArtifactType &&
              boundArtifactType !== "pptx" ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Bound artifact type is <code>{boundArtifactType}</code>, not{" "}
                  <code>pptx</code>. Real PPT render is disabled until backend
                  binds a pptx artifact.
                </div>
              ) : null}

              {pptRenderState !== "ready" || shouldUseRenderedPreviewFirst ? (
                <div className="mb-4 rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 text-xs text-zinc-600">
                  {previewMode === "rendered"
                    ? "当前展示的是后端渲染后的页图预览。"
                    : "当前展示的是 Markdown 兼容预览，真实页图尚未就绪。"}
                  {regeneratingSlideId
                    ? " 当前版本正在重渲染，完成后会自动刷新。"
                    : ""}
                </div>
              ) : null}

              {!canRenderRealPpt ||
              pptRenderState !== "ready" ||
              shouldUseRenderedPreviewFirst ? (
                <AnimatePresence>
                  {slides.map((slide, i) => (
                    <motion.div
                      key={slide.id || `s-${i}`}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.4,
                        ease: "easeOut",
                        delay: i * 0.05,
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
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              ) : null}
            </div>
          )}
        </main>

        <PreviewFloatingTools />
        {slides.length > 0 ? (
          <PreviewSlideStrip
            slides={slides}
            activeSlideIndex={activeSlideIndex}
            onScrollToSlide={scrollToSlide}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
