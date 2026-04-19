"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  Loader2,
  Menu,
  MonitorPlay,
  Play,
  Save,
  Square,
  Table,
  Type,
  Image as ImageIcon,
  FunctionSquare,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HtmlPreviewFrame } from "./components/HtmlPreviewFrame";
import { useGeneratePreviewState } from "./useGeneratePreviewState";
import { RunSelectorPopover } from "./components/RunSelectorPopover";
import { RegenerateSlideDialog } from "./components/RegenerateSlideDialog";
import { SlideEditorOverlay } from "./components/SlideEditorOverlay";

type SlideFrame = {
  index: number;
  slide_id: string;
  image_url?: string | null;
  html_preview?: string | null;
  split_index: number;
  split_count: number;
  width?: number | null;
  height?: number | null;
};

type SlideItem = {
  id?: string;
  index: number;
  title?: string;
  thumbnail_url?: string | null;
  rendered_html_preview?: string | null;
  rendered_previews?: SlideFrame[];
};

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const raw = (value || "").trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{3}$/.test(raw)) {
    return `#${raw
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase()}`;
  }
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return fallback;
}

function buildSlideFrames(slide: SlideItem): SlideFrame[] {
  if (Array.isArray(slide.rendered_previews) && slide.rendered_previews.length > 0) {
    return [...slide.rendered_previews].sort(
      (a, b) => (a.split_index ?? 0) - (b.split_index ?? 0)
    );
  }
  if (slide.rendered_html_preview || slide.thumbnail_url) {
    return [
      {
        index: slide.index,
        slide_id: slide.id || `slide-${slide.index}`,
        image_url: slide.thumbnail_url,
        html_preview: slide.rendered_html_preview,
        split_index: 0,
        split_count: 1,
      },
    ];
  }
  return [];
}

function hasAnyPreviewFrame(slide: SlideItem): boolean {
  return buildSlideFrames(slide).some(
    (frame) => Boolean(frame.html_preview || frame.image_url)
  );
}

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

  const sessionIdFromQuery = searchParams?.get("session") || null;
  const runIdFromQuery = searchParams?.get("run") || null;
  const artifactIdFromQuery = searchParams?.get("artifact_id") || null;
  const searchQueryString = searchParams?.toString() || "";

  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [activeFrameIndex, setActiveFrameIndex] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);

  const {
    slides,
    sessionRuns,
    isLoading,
    isExporting,
    isResuming,
    previewBlockedReason,
    isSessionGenerating,
    sessionFailureMessage,
    activeSessionId,
    activeRunId,
    diegoPreviewContext,
    currentRunDetail,
    generationModeLabel,
    runTitle,
    handleExport,
    handleResume,
  } = useGeneratePreviewState({
    projectId,
    sessionIdFromQuery,
    runIdFromQuery,
    artifactIdFromQuery,
  });

  const projectBackHref = (sessionId: string | null) =>
    sessionId
      ? `/projects/${projectId}?session=${encodeURIComponent(sessionId)}`
      : `/projects/${projectId}`;

  const orderedSlides = useMemo(
    () => [...slides].sort((a, b) => a.index - b.index),
    [slides]
  );
  const previewableSlides = useMemo(
    () => orderedSlides.filter((slide) => hasAnyPreviewFrame(slide)),
    [orderedSlides]
  );

  const activeSlide = useMemo(() => {
    if (previewableSlides.length === 0) return null;
    return (
      previewableSlides.find((slide) => slide.index === activeSlideIndex) ??
      previewableSlides[0]
    );
  }, [activeSlideIndex, previewableSlides]);

  const activeSlideFrames = useMemo(
    () => (activeSlide ? buildSlideFrames(activeSlide) : []),
    [activeSlide]
  );
  const resolvedActiveFrameIndex =
    activeSlideFrames.length > 0
      ? Math.min(activeFrameIndex, activeSlideFrames.length - 1)
      : 0;
  const activeFrame =
    activeSlideFrames[resolvedActiveFrameIndex] || activeSlideFrames[0] || null;

  const activeSlidePos = useMemo(() => {
    if (!activeSlide) return -1;
    return previewableSlides.findIndex((slide) => slide.index === activeSlide.index);
  }, [activeSlide, previewableSlides]);

  const currentRunOptions = useMemo(
    () =>
      sessionRuns
        .slice()
        .sort((a, b) => (b.run_no ?? 0) - (a.run_no ?? 0))
        .map((run) => ({
          value: run.run_id,
          label:
            run.run_title?.trim() ||
            `Run #${run.run_no ?? "?"} (${run.run_id.slice(0, 8)})`,
          status: run.run_status || "unknown",
        })),
    [sessionRuns]
  );

  const themedColors = useMemo(() => {
    const theme = diegoPreviewContext?.theme;
    return {
      primary: normalizeHexColor(theme?.primary, "#1F2937"),
      secondary: normalizeHexColor(theme?.secondary, "#475569"),
      accent: normalizeHexColor(theme?.accent, "#EAB308"),
      light: normalizeHexColor(theme?.light, "#E2E8F0"),
      bg: normalizeHexColor(theme?.bg, "#F8FAFC"),
    };
  }, [diegoPreviewContext?.theme]);

  const stageVars = useMemo(
    () =>
      ({
        "--deck-primary": themedColors.primary,
        "--deck-secondary": themedColors.secondary,
        "--deck-accent": themedColors.accent,
        "--deck-light": themedColors.light,
        "--deck-bg": themedColors.bg,
      }) as CSSProperties,
    [themedColors]
  );

  const updateRunInQuery = (runId: string) => {
    if (!projectId || !activeSessionId) return;
    const query = new URLSearchParams(searchQueryString);
    query.set("session", activeSessionId);
    if (runId.trim()) {
      query.set("run", runId.trim());
    } else {
      query.delete("run");
    }
    router.replace(`/projects/${projectId}/generate?${query.toString()}`);
  };

  const moveSlide = (delta: -1 | 1) => {
    if (activeSlidePos < 0) return;
    const nextPos = activeSlidePos + delta;
    if (nextPos < 0 || nextPos >= previewableSlides.length) return;
    setActiveSlideIndex(previewableSlides[nextPos].index);
    setActiveFrameIndex(0);
  };

  const runSelectionBlocked = Boolean(activeSessionId) && !activeRunId;
  const showWaitingState =
    !runSelectionBlocked &&
    !previewBlockedReason &&
    !isLoading &&
    previewableSlides.length === 0 && !isSessionGenerating;

  const expectedSlideCount = (currentRunDetail as any)?.target_slide_count || Math.max(orderedSlides.length, 10);
  const allSlotSlides = useMemo(() => {
    const totalCount = previewableSlides.length > 0 ? previewableSlides.length : (isSessionGenerating ? expectedSlideCount : previewableSlides.length);
    if (totalCount === 0) return [];
    
    return Array.from({ length: totalCount }, (_, i) => {
      const existing = previewableSlides.find(s => s.index === i);
      return existing || { index: i, title: `Slide ${i + 1}`, _placeholder: true } as any;
    });
  }, [previewableSlides, isSessionGenerating, expectedSlideCount]);

  const totalSlides = allSlotSlides.length;
  const currentSlideNumber = activeSlidePos >= 0 ? activeSlidePos + 1 : 0;

  return (
    <div
      style={stageVars}
      className="flex h-screen w-full flex-col overflow-hidden bg-[#f5f5f7] text-[#1d1d1f]"
    >
      {/* Top header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/5 bg-white px-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.push(projectBackHref(activeSessionId))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#1d1d1f] transition hover:bg-black/5"
            title="返回会话"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="hidden h-5 w-px bg-black/10 sm:block" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 rounded bg-[#3b82f6]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#3b82f6]">
              {generationModeLabel}
            </span>
            <h1 className="truncate text-sm font-medium text-[#1d1d1f] sm:text-base">
              {runTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-[#1d1d1f] transition hover:bg-black/5"
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">保存</span>
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            disabled={!activeSlide || !activeFrame}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-[#1d1d1f] transition hover:bg-black/5 disabled:opacity-40"
          >
            <MonitorPlay className="h-4 w-4" />
            <span className="hidden sm:inline">放映</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!activeRunId || isExporting}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1d1d1f] px-3 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">
              {isExporting ? "导出中" : "导出"}
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-black/5 bg-white">
          {/* Slide count + grid toggle */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-sm font-medium text-[#1d1d1f]">
              {totalSlides > 0 ? (
                <>
                  <span className="text-[#3b82f6]">
                    {String(currentSlideNumber).padStart(2, "0")}
                  </span>
                  <span className="text-black/30"> / </span>
                  <span className="text-black/60">
                    {String(totalSlides).padStart(2, "0")}
                  </span>
                </>
              ) : (
                <span className="text-black/40">-- / --</span>
              )}
            </div>
          </div>

          {/* Run selector */}
          <div className="px-4 pb-3">
            <RunSelectorPopover
              options={currentRunOptions}
              value={activeRunId ?? ""}
              onChange={updateRunInQuery}
              disabled={!activeSessionId || currentRunOptions.length === 0}
            />
          </div>

          {/* Thumbnails */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="flex flex-col gap-2">
              {isSessionGenerating && (
                <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mb-1 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-amber-700">生成中...</p>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-amber-200/50">
                      <div className="h-full bg-amber-400" style={{ width: `${Math.max(5, (orderedSlides.length / Math.max(1, 10)) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              )}
              {allSlotSlides.map((slide) => {
                if (slide._placeholder) {
                  return (
                    <div
                      key={`thumb-placeholder-${slide.index}`}
                      className="group relative w-full overflow-hidden rounded-xl border border-black/5 bg-white text-left shadow-sm"
                    >
                      <div className="aspect-video w-full bg-[#f5f5f7] flex items-center justify-center">
                         <Loader2 className="h-4 w-4 animate-spin text-black/20" />
                      </div>
                      <span className="absolute left-2 top-2 rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold text-black/40">
                        {String(slide.index + 1).padStart(2, "0")}
                      </span>
                      <span className="absolute bottom-2 left-2 right-2 line-clamp-1 text-[11px] font-medium text-black/40">
                        等待生成...
                      </span>
                    </div>
                  );
                }
                const slideFrames = buildSlideFrames(slide);
                const isActive = activeSlide?.index === slide.index;
                const firstFrame = slideFrames[0] || null;
                return (
                  <motion.button
                    key={slide.id || `thumb-${slide.index}`}
                    type="button"
                    onClick={() => {
                      setActiveSlideIndex(slide.index);
                      setActiveFrameIndex(0);
                    }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "group relative w-full overflow-hidden rounded-xl border text-left transition",
                      isActive
                        ? "border-[#3b82f6] shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
                        : "border-black/10 hover:border-black/25"
                    )}
                  >
                    <div className="aspect-video w-full bg-[#f5f5f7]">
                      {(firstFrame?.image_url || slide.thumbnail_url) ? (
                        <img
                          src={firstFrame?.image_url || slide.thumbnail_url || undefined}
                          alt={slide.title || `Slide ${slide.index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      ) : firstFrame?.html_preview ? (
                        <div className="h-full w-full">
                          <HtmlPreviewFrame
                            title={slide.title || `Slide ${slide.index + 1}`}
                            html={firstFrame.html_preview}
                            className="h-full"
                          />
                        </div>
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-zinc-100 to-zinc-200" />
                      )}
                    </div>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {String(slide.index + 1).padStart(2, "0")}
                    </span>
                    {slideFrames.length > 1 ? (
                      <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        +{slideFrames.length - 1}
                      </span>
                    ) : null}
                    <span className="absolute bottom-2 left-2 right-2 line-clamp-1 text-[11px] font-medium text-white/90">
                      {slide.title || `Slide ${slide.index + 1}`}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>



          {/* Compact status footer */}
          <div className="border-t border-black/5 px-4 py-2">
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-black/50">
              <span
                className={cn(
                  "inline-flex h-1.5 w-1.5 rounded-full",
                  isSessionGenerating ? "animate-pulse bg-amber-500" : "bg-emerald-500"
                )}
              />
              <span>{isSessionGenerating ? "生成中" : "已同步"}</span>
              {diegoPreviewContext?.palette ? (
                <span className="rounded bg-black/5 px-1 py-0.5">
                  {diegoPreviewContext.palette}
                </span>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Main stage */}
        <main className="relative flex flex-1 flex-col overflow-hidden bg-[#ebebed]">
          {sessionFailureMessage ? (
            <div className="absolute left-4 right-4 top-4 z-20 rounded-xl border border-red-200/35 bg-red-900/60 px-3 py-2 text-sm text-red-100 backdrop-blur">
              run 失败: {sessionFailureMessage}
            </div>
          ) : null}

          {/* Canvas */}
          <section className="relative flex flex-1 items-center justify-center p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 text-white/70">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--deck-accent)]" />
                <p className="text-sm">正在同步 Diego 预览...</p>
              </div>
            ) : runSelectionBlocked ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 text-center text-white/70">
                <p className="text-lg font-semibold text-white">请选择 run</p>
                <p className="max-w-[460px] text-sm text-white/60">
                  当前页面已切换为严格 Diego 预览链路，不再自动回退到 session 最新产物。
                </p>
              </div>
            ) : previewBlockedReason ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 text-center text-white/70">
                <p className="text-lg font-semibold text-white">预览不可用</p>
                <p className="max-w-[520px] text-sm text-white/60">
                  {previewBlockedReason}
                </p>
                <button
                  type="button"
                  onClick={() => void handleResume()}
                  disabled={!activeSessionId || isResuming}
                  className="mt-2 inline-flex h-9 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-sm text-white transition hover:bg-white/15 disabled:opacity-45"
                >
                  {isResuming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isResuming ? "恢复中" : "继续会话"}
                </button>
              </div>
            ) : showWaitingState ? (
              <div className="flex flex-col items-center justify-center gap-3 text-white/70">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--deck-accent)]" />
                <p className="text-sm">run 已绑定，等待第一页渲染...</p>
              </div>
            ) : activeSlide && activeFrame ? (
              <>
                <div className="relative w-full max-w-[1100px] overflow-hidden rounded-lg bg-white shadow-[0_24px_70px_-12px_rgba(0,0,0,0.35)]">
                  <div className="aspect-video w-full bg-white relative">
                    {activeFrame.html_preview ? (
                      <>
                        <HtmlPreviewFrame
                          title={activeSlide.title || `Slide ${activeSlide.index + 1}`}
                          html={activeFrame.html_preview}
                          className="h-full"
                          viewportWidth={activeFrame.width || undefined}
                          viewportHeight={activeFrame.height || undefined}
                        />
                        <SlideEditorOverlay
                          slideNo={activeSlide.index + 1}
                          width={activeFrame.width || undefined}
                          height={activeFrame.height || undefined}
                          interactive={true}
                        />
                      </>
                    ) : activeFrame.image_url ? (
                      <img
                        src={activeFrame.image_url}
                        alt={activeSlide.title || `Slide ${activeSlide.index + 1}`}
                        className="h-full w-full object-contain bg-white"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-black/50">
                        当前页预览仍在生成中
                      </div>
                    )}
                  </div>
                </div>

                {/* Date watermark */}
                <div className="pointer-events-none absolute bottom-6 right-6 rounded bg-black/40 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
                  2026.04.06
                </div>
              </>
            ) : null}
          </section>

          {/* Floating bottom toolbar */}
          <div className="pointer-events-none absolute bottom-5 left-0 right-0 z-10 flex items-end justify-center px-4">
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111]/80 px-3 py-2 shadow-2xl backdrop-blur-md">
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                disabled={!activeSlide || !activeFrame}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="放映"
              >
                <Play className="h-4 w-4" />
              </button>
              <div className="mx-1 h-4 w-px bg-white/10" />
              <button
                type="button"
                onClick={() => setRegenerateDialogOpen(true)}
                disabled={!activeSlide || !activeFrame}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="重做此页"
              >
                <Wand2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
                title="文本"
              >
                <Type className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
                title="形状"
              >
                <Square className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
                title="图片"
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
                title="表格"
              >
                <Table className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
                title="公式"
              >
                <FunctionSquare className="h-4 w-4" />
              </button>

              <div className="mx-1 h-4 w-px bg-white/10" />

              {/* Split frame chips */}
              {activeSlideFrames.length > 1 ? (
                <div className="hidden items-center gap-1 sm:flex">
                  {activeSlideFrames.map((frame, idx) => (
                    <button
                      key={`${frame.slide_id}-${frame.split_index ?? idx}`}
                      type="button"
                      onClick={() => setActiveFrameIndex(idx)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] transition",
                        idx === resolvedActiveFrameIndex
                          ? "border-[var(--deck-accent)] bg-[color:var(--deck-accent)]/20 text-white"
                          : "border-white/20 bg-black/30 text-white/70 hover:bg-black/40"
                      )}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center gap-1 pl-1 text-xs text-white/70">
                <span>113%</span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-xl transition hover:bg-white/10 hover:text-white"
                >
                  <Menu className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Fullscreen modal */}
      <AnimatePresence>
        {isFullscreen && activeSlide && activeFrame ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex bg-black/95 p-4 md:p-8"
          >
            <div className="flex w-full items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => moveSlide(-1)}
                disabled={activeSlidePos <= 0}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white transition hover:bg-black/60 disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="relative flex-1 overflow-hidden rounded-xl border border-white/15 bg-black/40">
                <div className="aspect-video w-full">
                  {activeFrame.html_preview ? (
                    <HtmlPreviewFrame
                      title={activeSlide.title || `Slide ${activeSlide.index + 1}`}
                      html={activeFrame.html_preview}
                      className="h-full"
                      viewportWidth={activeFrame.width || undefined}
                      viewportHeight={activeFrame.height || undefined}
                      interactive
                    />
                  ) : activeFrame.image_url ? (
                    <img
                      src={activeFrame.image_url}
                      alt={activeSlide.title || `Slide ${activeSlide.index + 1}`}
                      className="h-full w-full object-contain bg-white"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-white/65">
                      当前页预览仍在生成中
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => moveSlide(1)}
                disabled={activeSlidePos < 0 || activeSlidePos >= previewableSlides.length - 1}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white transition hover:bg-black/60 disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="absolute right-5 top-5 z-10 rounded-full border border-white/30 bg-black/45 px-4 py-1.5 text-sm text-white transition hover:bg-black/60"
            >
              关闭
            </button>

            {/* Fullscreen bottom info */}
            <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-black/50 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
              {activeSlide.title || `Slide ${activeSlide.index + 1}`} · {currentSlideNumber} / {totalSlides}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <RegenerateSlideDialog
        open={regenerateDialogOpen}
        onOpenChange={setRegenerateDialogOpen}
        runId={activeRunId || ""}
        slideNo={(activeSlide?.index ?? 0) + 1}
        slideTitle={activeSlide?.title}
        onSuccess={() => {
          // Additional success logic if needed
        }}
      />
    </div>
  );
}
