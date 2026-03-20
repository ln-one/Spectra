"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SlideCard } from "./SlideCard";
import { useGeneratePreviewState } from "./useGeneratePreviewState";
import { PreviewHeader } from "./components/PreviewHeader";
import { PreviewFloatingTools } from "./components/PreviewFloatingTools";
import { PreviewSlideStrip } from "./components/PreviewSlideStrip";

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

  const containerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement>(null);
  const activeSlideIndexRef = useRef(0);

  useEffect(() => {
    activeSlideIndexRef.current = activeSlideIndex;
  }, [activeSlideIndex]);

  const sessionIdFromQuery = searchParams?.get("session") || null;
  const artifactIdFromQuery = searchParams?.get("artifact_id") || null;

  const {
    slides,
    isLoading,
    isExporting,
    isResuming,
    regeneratingSlideId,
    previewBlockedReason,
    isSessionGenerating,
    activeSessionId,
    handleExport,
    handleResume,
    handleRegenerateSlide,
    loadSlides,
  } = useGeneratePreviewState({
    projectId,
    sessionIdFromQuery,
    artifactIdFromQuery,
  });

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
    const slideElement = document.querySelector(`[data-index="${index}"]`);
    if (slideElement) {
      slideElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

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
          onGoBack={() => router.push(`/projects/${projectId}`)}
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
                  onClick={() => router.push(`/projects/${projectId}`)}
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
            <div className="max-w-4xl mx-auto w-full pb-32" ref={slidesRef}>
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
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </main>

        <PreviewFloatingTools />
        {slides.length > 0 ? (
          <PreviewSlideStrip
            slides={slides}
            activeSlideIndex={activeSlideIndex}
            onScrollToSlide={scrollToSlide}
            onRegenerateSlide={(slide) => {
              const target = slides.find(
                (item) =>
                  (item.id && item.id === slide.id) ||
                  item.index === slide.index
              );
              if (!target) return;
              void handleRegenerateSlide(target);
            }}
            regeneratingSlideId={regeneratingSlideId}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
