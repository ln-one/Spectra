"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HtmlPreviewFrame } from "./components/HtmlPreviewFrame";
import { useGeneratePreviewState } from "./useGeneratePreviewState";

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

  const {
    slides,
    sessionRuns,
    isLoading,
    isExporting,
    isResuming,
    previewBlockedReason,
    isSessionGenerating,
    sessionState,
    sessionFailureMessage,
    activeSessionId,
    activeRunId,
    diegoPreviewContext,
    loadSlides,
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
    previewableSlides.length === 0;

  return (
    <div
      style={stageVars}
      className="min-h-screen bg-[radial-gradient(110%_160%_at_8%_2%,_rgba(255,255,255,0.22)_0%,_rgba(255,255,255,0)_58%),linear-gradient(145deg,var(--deck-primary)_0%,#05070b_52%,#000_100%)] text-white"
    >
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 pb-6 pt-5 md:px-8 md:pb-8 md:pt-7">
        <header className="mb-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur md:px-5 md:py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(projectBackHref(activeSessionId))}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 text-sm font-medium text-white transition hover:bg-black/55"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </button>

            <div className="min-w-[280px] flex-1">
              <p
                className="text-[11px] uppercase tracking-[0.24em] text-white/65"
                style={{ fontFamily: '"Courier New", "SFMono-Regular", monospace' }}
              >
                Diego Preview Stage
              </p>
              <h1
                className="mt-1 text-xl font-semibold md:text-2xl"
                style={{
                  fontFamily:
                    '"Noto Serif SC","Source Han Serif SC","Palatino Linotype",serif',
                }}
              >
                /generate PPT 预览
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-white/70">Run</label>
              <select
                value={activeRunId ?? ""}
                onChange={(event) => updateRunInQuery(event.target.value)}
                disabled={!activeSessionId || currentRunOptions.length === 0}
                className="h-10 min-w-[230px] rounded-xl border border-white/20 bg-black/45 px-3 text-sm text-white outline-none transition focus:border-[var(--deck-accent)]"
              >
                <option value="">选择 run</option>
                {currentRunOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label} · {item.status}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  void loadSlides();
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 text-sm font-medium text-white transition hover:bg-black/55"
              >
                <RefreshCw className="h-4 w-4" />
                刷新
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleResume();
                }}
                disabled={!activeSessionId || isResuming}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 text-sm font-medium text-white transition hover:bg-black/55 disabled:opacity-45"
              >
                {isResuming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isResuming ? "恢复中" : "继续会话"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleExport();
                }}
                disabled={!activeRunId || isExporting}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 text-sm font-medium text-white transition hover:bg-black/55 disabled:opacity-45"
              >
                <Download className="h-4 w-4" />
                {isExporting ? "导出中" : "导出 HTML"}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
            <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1">
              session: {activeSessionId ? activeSessionId.slice(0, 12) : "n/a"}
            </span>
            <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1">
              run: {activeRunId ? activeRunId.slice(0, 12) : "未选择"}
            </span>
            <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1">
              state: {sessionState ?? "unknown"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1",
                isSessionGenerating
                  ? "border-amber-200/40 bg-amber-300/15 text-amber-100"
                  : "border-emerald-200/35 bg-emerald-300/15 text-emerald-100"
              )}
            >
              {isSessionGenerating ? "Diego 运行中" : "Diego 已同步"}
            </span>
            {diegoPreviewContext?.palette ? (
              <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1">
                palette: {diegoPreviewContext.palette}
              </span>
            ) : null}
            {diegoPreviewContext?.style ? (
              <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1">
                style: {diegoPreviewContext.style}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/25 px-2.5 py-1">
              <i
                className="inline-block h-2.5 w-2.5 rounded-full border border-white/35"
                style={{ background: themedColors.primary }}
              />
              <i
                className="inline-block h-2.5 w-2.5 rounded-full border border-white/35"
                style={{ background: themedColors.secondary }}
              />
              <i
                className="inline-block h-2.5 w-2.5 rounded-full border border-white/35"
                style={{ background: themedColors.accent }}
              />
              theme
            </span>
          </div>
        </header>

        <main className="grid flex-1 grid-rows-[1fr_auto] gap-4 md:gap-5">
          <section className="relative overflow-hidden rounded-[24px] border border-white/15 bg-black/35">
            {sessionFailureMessage ? (
              <div className="absolute left-4 right-4 top-4 z-20 rounded-xl border border-red-200/35 bg-red-900/35 px-3 py-2 text-sm text-red-100">
                run 失败: {sessionFailureMessage}
              </div>
            ) : null}

            {isLoading ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 text-white/75">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--deck-accent)]" />
                <p className="text-sm">正在同步 Diego 预览...</p>
              </div>
            ) : runSelectionBlocked ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center text-white/75">
                <p className="text-lg font-semibold text-white">请选择 run</p>
                <p className="max-w-[460px] text-sm text-white/65">
                  当前页面已切换为严格 Diego 预览链路，不再自动回退到 session 最新产物。
                </p>
              </div>
            ) : previewBlockedReason ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center text-white/75">
                <p className="text-lg font-semibold text-white">预览不可用</p>
                <p className="max-w-[520px] text-sm text-white/65">
                  {previewBlockedReason}
                </p>
              </div>
            ) : showWaitingState ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 text-white/75">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--deck-accent)]" />
                <p className="text-sm">run 已绑定，等待第一页渲染...</p>
              </div>
            ) : activeSlide && activeFrame ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5 md:px-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">
                      Slide {activeSlide.index + 1}
                    </p>
                    <h2
                      className="truncate text-sm font-semibold text-white md:text-base"
                      style={{
                        fontFamily:
                          '"Noto Serif SC","Source Han Serif SC","Palatino Linotype",serif',
                      }}
                    >
                      {activeSlide.title || `Untitled ${activeSlide.index + 1}`}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveSlide(-1)}
                      disabled={activeSlidePos <= 0}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition hover:bg-black/55 disabled:opacity-35"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlide(1)}
                      disabled={activeSlidePos < 0 || activeSlidePos >= previewableSlides.length - 1}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition hover:bg-black/55 disabled:opacity-35"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFullscreen(true)}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-white/20 bg-black/30 px-3 text-xs text-white transition hover:bg-black/55"
                    >
                      <Expand className="mr-1.5 h-3.5 w-3.5" />
                      全屏
                    </button>
                  </div>
                </div>

                <div className="relative flex-1 p-2.5 md:p-4">
                  <div className="h-full overflow-hidden rounded-2xl border border-white/15 bg-black/30">
                    {activeFrame.html_preview ? (
                      <HtmlPreviewFrame
                        title={activeSlide.title || `Slide ${activeSlide.index + 1}`}
                        html={activeFrame.html_preview}
                        className="h-full"
                      />
                    ) : activeFrame.image_url ? (
                      <img
                        src={activeFrame.image_url}
                        alt={activeSlide.title || `Slide ${activeSlide.index + 1}`}
                        className="h-full w-full object-contain bg-white"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-white/65">
                        当前页预览仍在生成中
                      </div>
                    )}
                  </div>
                </div>

                {activeSlideFrames.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 py-2 md:px-4">
                    {activeSlideFrames.map((frame, idx) => (
                      <button
                        key={`${frame.slide_id}-${frame.split_index ?? idx}`}
                        type="button"
                        onClick={() => setActiveFrameIndex(idx)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition",
                          idx === resolvedActiveFrameIndex
                            ? "border-[var(--deck-accent)] bg-[color:var(--deck-accent)]/20 text-white"
                            : "border-white/20 bg-black/25 text-white/70 hover:bg-black/40"
                        )}
                      >
                        分页 {idx + 1}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {previewableSlides.length > 0 ? (
            <section className="rounded-2xl border border-white/15 bg-black/35 px-3 py-3 md:px-4 md:py-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {previewableSlides.map((slide) => {
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
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        "group relative h-20 w-40 shrink-0 overflow-hidden rounded-xl border text-left transition",
                        isActive
                          ? "border-[var(--deck-accent)] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                          : "border-white/15 hover:border-white/35"
                      )}
                    >
                      {firstFrame?.image_url ? (
                        <img
                          src={firstFrame.image_url}
                          alt={slide.title || `Slide ${slide.index + 1}`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className="absolute inset-0 bg-[linear-gradient(130deg,var(--deck-secondary)_0%,var(--deck-primary)_50%,#0B1020_100%)]"
                          aria-hidden
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
                      <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {slide.index + 1}
                      </span>
                      {slideFrames.length > 1 ? (
                        <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
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
            </section>
          ) : null}
        </main>

        <AnimatePresence>
          {isFullscreen && activeSlide && activeFrame ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex bg-black/88 p-4 md:p-8"
            >
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="absolute right-5 top-5 z-10 rounded-full border border-white/30 bg-black/45 px-3 py-1.5 text-sm text-white"
              >
                关闭
              </button>
              <div className="mx-auto w-full max-w-[1500px] overflow-hidden rounded-2xl border border-white/15 bg-black/35">
                {activeFrame.html_preview ? (
                  <HtmlPreviewFrame
                    title={activeSlide.title || `Slide ${activeSlide.index + 1}`}
                    html={activeFrame.html_preview}
                    className="h-full"
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
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
