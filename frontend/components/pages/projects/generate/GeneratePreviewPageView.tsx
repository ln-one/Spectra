"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Download,
  Edit3,
  Image as ImageIcon,
  Layout,
  Loader2,
  Play,
  Share2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SlideCard } from "./SlideCard";
import { useGeneratePreviewState } from "./useGeneratePreviewState";

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

  const sessionIdFromQuery = searchParams?.get("session") || null;
  const artifactIdFromQuery = searchParams?.get("artifact_id") || null;

  const {
    slides,
    isLoading,
    isExporting,
    previewBlockedReason,
    isSessionGenerating,
    activeSessionId,
    handleExport,
  } = useGeneratePreviewState({
    projectId,
    sessionIdFromQuery,
    artifactIdFromQuery,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const handleScroll = () => {
      if (!containerRef.current) return;
      const slideElements =
        containerRef.current.querySelectorAll(".slide-card");
      let currentActiveIndex = activeSlideIndex;
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

      if (currentActiveIndex !== activeSlideIndex) {
        setActiveSlideIndex(currentActiveIndex);
      }
    };

    const container = containerRef.current;
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeSlideIndex, slides]);

  const scrollToSlide = useCallback((index: number) => {
    const slideElement = document.querySelector(`[data-index="${index}"]`);
    if (slideElement) {
      slideElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20">
        <header className="h-14 border-b bg-background/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => router.push(`/projects/${projectId}`)}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            {isEditingTitle ? (
              <Input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setIsEditingTitle(false);
                }}
                className="h-8 w-56"
                autoFocus
              />
            ) : (
              <button
                className="text-sm font-medium hover:text-primary transition-colors truncate"
                onClick={() => setIsEditingTitle(true)}
              >
                {projectTitle}
              </button>
            )}

            {activeSessionId && (
              <span className="text-xs text-muted-foreground hidden md:inline">
                会话: {activeSessionId.slice(0, 8)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border bg-muted/40">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isSessionGenerating
                    ? "bg-amber-500 animate-pulse"
                    : "bg-emerald-500"
                )}
              />
              {isSessionGenerating ? "生成中" : "已同步"}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex rounded-full h-9"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              编辑
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex rounded-full h-9"
              onClick={handleExport}
              disabled={!activeSessionId || isExporting}
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "导出中" : "导出"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex rounded-full h-9"
            >
              <Share2 className="w-4 h-4 mr-2" />
              分享
            </Button>
            <Button
              size="sm"
              className="rounded-full h-9 bg-foreground text-background hover:bg-foreground/90"
            >
              <Play className="w-4 h-4 mr-2 fill-current" />
              演示
            </Button>
          </div>
        </header>

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

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-40 hidden sm:flex"
        >
          <div className="bg-card/90 border shadow-xl rounded-full flex flex-col p-1.5 gap-1.5 backdrop-blur-xl">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted w-10 h-10"
                >
                  <Edit3 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">编辑内容</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted w-10 h-10"
                >
                  <Layout className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">更换排版</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted w-10 h-10"
                >
                  <ImageIcon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">替换配图</TooltipContent>
            </Tooltip>
            <div className="h-px w-5 mx-auto bg-border/80 my-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-violet-500 hover:text-violet-600 hover:bg-violet-50 w-10 h-10"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="bg-violet-600 text-white border-violet-700"
              >
                AI 润色
              </TooltipContent>
            </Tooltip>
          </div>
        </motion.div>

        {slides.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.4,
              duration: 0.5,
              type: "spring",
              damping: 25,
            }}
            className="fixed bottom-0 left-0 w-full h-24 bg-background/85 backdrop-blur-md border-t z-40 flex items-center justify-center px-4"
          >
            <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-3 px-4 max-w-full">
              {slides.map((slide) => {
                const isActive = activeSlideIndex === slide.index;
                return (
                  <button
                    key={`thumb-${slide.id || slide.index}`}
                    onClick={() => scrollToSlide(slide.index)}
                    className={cn(
                      "relative group h-14 shrink-0 transition-all duration-300 rounded-xl overflow-hidden border-2 text-left flex flex-col justify-end p-2.5",
                      isActive
                        ? "w-36 border-primary bg-primary/10 shadow-sm"
                        : "w-20 border-border/50 bg-muted/50 hover:border-primary/40 hover:bg-muted"
                    )}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent pointer-events-none" />
                    <span
                      className={cn(
                        "text-[10px] font-bold z-10 truncate absolute top-1.5 left-2 bg-background/60 backdrop-blur rounded px-1.5",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {slide.index}
                    </span>
                    {isActive && (
                      <motion.span
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs font-semibold z-10 truncate text-foreground leading-tight mt-auto block drop-shadow-sm"
                      >
                        {slide.title || `第 ${slide.index} 页`}
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </TooltipProvider>
  );
}
