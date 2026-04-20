"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  MonitorPlay,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { previewApi, type EditableSlideScene } from "@/lib/sdk/preview";
import { derivePptStatus } from "@/components/project/features/studio/panel/usePptHistoryStatusSync";
import { PreviewCopilotDrawer } from "./components/PreviewCopilotDrawer";
import { useGeneratePreviewState } from "./useGeneratePreviewState";
import { RegenerateSlideDialog } from "./components/RegenerateSlideDialog";
import { SvgPreviewSurface } from "./components/SvgPreviewSurface";
import {
  resolveRenderableSlideIndex,
  slotHasRenderablePreview,
} from "./streamingWorkbenchPreview";
import { isRenderableSvgDataUrl } from "./svgPreview";

type SlideFrame = {
  index: number;
  slide_id: string;
  format?: string | null;
  svg_data_url?: string | null;
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
  rendered_previews?: SlideFrame[];
};

type AuthoritySlide = NonNullable<
  ReturnType<typeof useGeneratePreviewState>["authorityPreview"]
>["slides"][number];

type SlideSlot = {
  index: number;
  title?: string;
  legacySlide: SlideItem | null;
  authoritySlide: AuthoritySlide | null;
  isPlaceholder: boolean;
};

type StageSelectionState = {
  slideIndex: number;
  frameIndex: number;
};

type StageSelectionAction =
  | { type: "selectSlide"; slideIndex: number }
  | { type: "selectFrame"; frameIndex: number }
  | { type: "reset" };

function stageSelectionReducer(
  state: StageSelectionState,
  action: StageSelectionAction
): StageSelectionState {
  switch (action.type) {
    case "selectSlide":
      return {
        slideIndex: action.slideIndex,
        frameIndex: 0,
      };
    case "selectFrame":
      return {
        ...state,
        frameIndex: action.frameIndex,
      };
    case "reset":
      return { slideIndex: 0, frameIndex: 0 };
    default:
      return state;
  }
}

function normalizeHexColor(
  value: string | undefined,
  fallback: string
): string {
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
  if (
    Array.isArray(slide.rendered_previews) &&
    slide.rendered_previews.length > 0
  ) {
    return [...slide.rendered_previews].sort(
      (a, b) => (a.split_index ?? 0) - (b.split_index ?? 0)
    );
  }
  if (isRenderableSvgDataUrl(slide.thumbnail_url)) {
    return [
      {
        index: slide.index,
        slide_id: slide.id || `slide-${slide.index}`,
        format: "svg",
        svg_data_url: slide.thumbnail_url,
        split_index: 0,
        split_count: 1,
      },
    ];
  }
  return [];
}

function buildAuthorityFrames(
  slide: AuthoritySlide | null | undefined
): SlideFrame[] {
  if (!slide) return [];
  if (Array.isArray(slide.frames) && slide.frames.length > 0) {
    return slide.frames.map((frame) => ({
      index: frame.index,
      slide_id: frame.slide_id,
      format: "svg",
      svg_data_url: frame.svg_data_url,
      split_index: frame.split_index,
      split_count: frame.split_count,
      width: frame.width,
      height: frame.height,
    }));
  }
  if (isRenderableSvgDataUrl(slide.svg_data_url)) {
    return [
      {
        index: slide.index,
        slide_id: slide.slide_id,
        format: "svg",
        svg_data_url: slide.svg_data_url,
        split_index: 0,
        split_count: 1,
        width: slide.width,
        height: slide.height,
      },
    ];
  }
  return [];
}

function hasAuthorityPreviewContent(
  slide: AuthoritySlide | null | undefined
): boolean {
  return Boolean(
    slide &&
    (isRenderableSvgDataUrl(slide.svg_data_url) ||
      (Array.isArray(slide.frames) &&
        slide.frames.some((frame) =>
          isRenderableSvgDataUrl(frame.svg_data_url)
        )))
  );
}

function summarizeAuthoritySlide(
  slide: AuthoritySlide | null | undefined
): string {
  if (!slide) return "";
  if (slide.frames && slide.frames.length > 1) {
    return `包含 ${slide.frames.length} 个分片预览`;
  }
  if (slide.svg_data_url) return "Pagevra SVG preview";
  return "";
}

function isBadRunTitle(value: string | null | undefined): boolean {
  const title = String(value || "").trim();
  if (!title) return true;
  const lowered = title.toLowerCase();
  return (
    /[A-Za-z]{4,}_[A-Za-z0-9_]+/.test(title) ||
    lowered.includes("generation_mode") ||
    lowered.includes("style_preset") ||
    lowered.includes("visual_policy")
  );
}

function resolveCopilotOutline(
  previewOutline: Record<string, unknown> | null,
  generationSession: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const isOutlineLike = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== "object") return false;
    const source = value as Record<string, unknown>;
    return (
      Array.isArray(source.nodes) ||
      Array.isArray(source.sections) ||
      Array.isArray(source.slides)
    );
  };
  if (isOutlineLike(previewOutline)) {
    return previewOutline;
  }
  const candidates = [
    generationSession,
    generationSession?.outline,
    generationSession?.session && typeof generationSession.session === "object"
      ? (generationSession.session as { outline?: unknown }).outline
      : null,
  ];
  for (const candidate of candidates) {
    if (isOutlineLike(candidate)) {
      return candidate as Record<string, unknown>;
    }
  }
  return null;
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

  const [
    { slideIndex: activeSlideIndex, frameIndex: activeFrameIndex },
    dispatchStageSelection,
  ] = useReducer(stageSelectionReducer, {
    slideIndex: 0,
    frameIndex: 0,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [sceneBySlideId, setSceneBySlideId] = useState<
    Record<string, EditableSlideScene>
  >({});
  const [selectedNodeBySlideId, setSelectedNodeBySlideId] = useState<
    Record<string, string | null>
  >({});
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const currentZoom = z === "fit" ? 1 : z;
        const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
        return Math.max(0.25, Math.min(3, currentZoom + zoomDelta));
      });
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [canvasRef]);

  const {
    slides,
    sessionRuns,
    isLoading,
    isExporting,
    previewBlockedReason,
    isSessionGenerating,
    sessionFailureMessage,
    sessionState,
    activeSessionId,
    activeRunId,
    authorityPreview,
    previewOutline,
    previewPreambleLogs,
    currentArtifactId,
    currentRenderVersion,
    diegoPreviewContext,
    currentRunDetail,
    generationSession,
    generationModeLabel,
    runTitle,
    handleExport,
    loadSlides,
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
  const authoritySlides = useMemo(
    () =>
      [...(authorityPreview?.slides ?? [])].sort((a, b) => a.index - b.index),
    [authorityPreview]
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

  const moveSlide = (delta: -1 | 1) => {
    if (!activeSlideSlot) return;
    const nextIndex = activeSlideSlot.index + delta;
    if (nextIndex < 0 || nextIndex >= slideSlots.length) return;
    dispatchStageSelection({ type: "selectSlide", slideIndex: nextIndex });
  };

  const runSelectionBlocked = Boolean(activeSessionId) && !activeRunId;

  const expectedSlideCount = useMemo(() => {
    const runTarget = (
      currentRunDetail as { target_slide_count?: unknown } | null
    )?.target_slide_count;
    const outlineNodes = (
      generationSession?.session as
        | { outline?: { nodes?: unknown } }
        | undefined
    )?.outline?.nodes;
    const outlineCount =
      Array.isArray(outlineNodes) && outlineNodes.length > 0
        ? outlineNodes.length
        : 0;
    const highestLegacyIndex =
      orderedSlides.length > 0
        ? Math.max(...orderedSlides.map((slide) => slide.index))
        : -1;
    const highestAuthorityIndex =
      authoritySlides.length > 0
        ? Math.max(...authoritySlides.map((slide) => slide.index))
        : -1;
    const highestKnownIndex = Math.max(
      highestLegacyIndex,
      highestAuthorityIndex
    );
    if (typeof runTarget === "number" && runTarget > 0) {
      return Math.max(runTarget, outlineCount, highestKnownIndex + 1);
    }
    if (outlineCount > 0 || highestKnownIndex >= 0) {
      return Math.max(outlineCount, highestKnownIndex + 1);
    }
    return 10;
  }, [authoritySlides, currentRunDetail, generationSession, orderedSlides]);

  const slideSlots: SlideSlot[] =
    expectedSlideCount === 0
      ? []
      : (() => {
          const legacyByIndex = new Map(
            orderedSlides.map((slide) => [slide.index, slide] as const)
          );
          const authorityByIndex = new Map(
            authoritySlides.map((slide) => [slide.index, slide] as const)
          );
          return Array.from({ length: expectedSlideCount }, (_, i) => {
            const legacySlide = legacyByIndex.get(i) ?? null;
            const authoritySlide = authorityByIndex.get(i) ?? null;
            return {
              index: i,
              title:
                authoritySlide?.title || legacySlide?.title || `Slide ${i + 1}`,
              legacySlide,
              authoritySlide,
              isPlaceholder: !legacySlide && !authoritySlide,
            };
          });
        })();

  const resolvedStageSlideIndex = resolveRenderableSlideIndex(
    slideSlots,
    activeSlideIndex
  );

  useEffect(() => {
    dispatchStageSelection({ type: "reset" });
  }, [activeRunId]);

  const activeSlideSlot =
    slideSlots.find((slide) => slide.index === resolvedStageSlideIndex) ??
    slideSlots[0] ??
    null;

  const activeLegacySlide = activeSlideSlot?.legacySlide ?? null;
  const activeAuthoritySlide = activeSlideSlot?.authoritySlide ?? null;
  const activeAuthorityFrames = buildAuthorityFrames(activeAuthoritySlide);
  const activeSlideFrames = activeLegacySlide
    ? buildSlideFrames(activeLegacySlide)
    : [];
  const stageFrames =
    activeAuthorityFrames.length > 0
      ? activeAuthorityFrames
      : activeSlideFrames;
  const resolvedActiveFrameIndex =
    stageFrames.length > 0
      ? Math.min(activeFrameIndex, stageFrames.length - 1)
      : 0;
  const activeStageFrame =
    stageFrames[resolvedActiveFrameIndex] || stageFrames[0] || null;
  const activeStageTitle =
    activeAuthoritySlide?.title ||
    activeLegacySlide?.title ||
    `Slide ${((activeSlideSlot?.index ?? 0) || 0) + 1}`;
  const activeAuthoritySlideId = activeAuthoritySlide?.slide_id ?? null;
  const activeScene = activeAuthoritySlideId
    ? (sceneBySlideId[activeAuthoritySlideId] ?? null)
    : null;
  const selectedNodeId = activeAuthoritySlideId
    ? (selectedNodeBySlideId[activeAuthoritySlideId] ?? null)
    : null;

  const handleActiveAuthorityNodeSelect = (nodeId: string | null) => {
    if (!activeAuthoritySlideId) return;
    setSelectedNodeBySlideId((previous) =>
      previous[activeAuthoritySlideId] === nodeId
        ? previous
        : {
            ...previous,
            [activeAuthoritySlideId]: nodeId,
          }
    );
  };

  useEffect(() => {
    if (!activeSessionId || !activeAuthoritySlideId) {
      return;
    }
    let cancelled = false;
    const loadScene = async () => {
      try {
        const response = await previewApi.getSessionSlideScene(
          activeSessionId,
          activeAuthoritySlideId,
          {
            artifact_id: currentArtifactId ?? undefined,
            run_id: activeRunId ?? undefined,
          }
        );
        if (cancelled) return;
        setSceneBySlideId((previous) => ({
          ...previous,
          [activeAuthoritySlideId]: response.data,
        }));
      } catch {
        if (cancelled) return;
        setSceneBySlideId((previous) => ({
          ...previous,
          [activeAuthoritySlideId]: {
            run_id: activeRunId || "",
            slide_id: activeAuthoritySlideId,
            slide_index: activeAuthoritySlide?.index ?? 0,
            slide_no: (activeAuthoritySlide?.index ?? 0) + 1,
            scene_version: "",
            nodes: [],
            readonly: true,
            readonly_reason: "当前页暂不支持结构化编辑",
          },
        }));
      }
    };
    void loadScene();
    return () => {
      cancelled = true;
    };
  }, [
    activeAuthoritySlide?.index,
    activeAuthoritySlideId,
    activeRunId,
    activeSessionId,
    currentArtifactId,
    currentRenderVersion,
  ]);

  const totalSlides = expectedSlideCount;
  const currentSlideNumber = activeSlideSlot ? activeSlideSlot.index + 1 : 0;
  const canRenderStage = isRenderableSvgDataUrl(activeStageFrame?.svg_data_url);
  const hasAnyRenderableSlide = slideSlots.some((slot) =>
    slotHasRenderablePreview(slot)
  );
  const copilotOutline = useMemo(
    () =>
      resolveCopilotOutline(
        previewOutline,
        (generationSession as Record<string, unknown> | null | undefined) ??
          null
      ),
    [generationSession, previewOutline]
  );
  const derivedRunStatus = useMemo(
    () =>
      derivePptStatus({
        sessionState: sessionState ?? null,
        runStatus: currentRunDetail?.run_status ?? null,
        runStep: currentRunDetail?.run_step ?? null,
        hasSlideReadyEvent: hasAnyRenderableSlide,
        hasOutlineCompletedEvent: false,
      }),
    [
      currentRunDetail?.run_status,
      currentRunDetail?.run_step,
      hasAnyRenderableSlide,
      sessionState,
    ]
  );
  const showPreviewLoadingNotice = isLoading && !hasAnyRenderableSlide;
  const isRunCompleted = derivedRunStatus?.status === "completed";
  const showGeneratingNotice =
    derivedRunStatus?.ppt_status === "slides_generating" &&
    !hasAnyRenderableSlide &&
    !isLoading;
  const syncStatusLabel =
    derivedRunStatus?.status === "completed"
      ? "已完成"
      : derivedRunStatus?.status === "failed"
        ? "失败"
        : derivedRunStatus?.ppt_status === "outline_generating"
          ? "大纲生成中"
          : derivedRunStatus?.ppt_status === "outline_pending_confirm"
            ? "大纲待确认"
            : derivedRunStatus?.ppt_status === "slides_generating"
              ? "课件生成中"
              : derivedRunStatus?.ppt_status === "slide_preview_ready"
                ? "单页可预览"
                : isLoading
                  ? "读取单页预览图"
                  : "已同步";
  const syncStatusDotClass =
    derivedRunStatus?.status === "failed"
      ? "bg-rose-500"
      : isRunCompleted || derivedRunStatus?.ppt_status === "slide_preview_ready"
        ? "bg-emerald-500"
        : isLoading ||
            derivedRunStatus?.status === "processing" ||
            derivedRunStatus?.status === "draft"
          ? "animate-pulse bg-amber-500"
          : "bg-emerald-500";
  const showWaitingState =
    !runSelectionBlocked &&
    !previewBlockedReason &&
    !isLoading &&
    !canRenderStage &&
    !isSessionGenerating &&
    !hasAnyRenderableSlide;

  const canExport = isRunCompleted;

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
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 rounded-lg border border-black/10 bg-white px-1 h-9 text-sm text-[#1d1d1f]">
            <button
              type="button"
              onClick={() =>
                setZoom((z) => (z === "fit" ? 0.75 : Math.max(0.25, z - 0.25)))
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-black/5"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => (z === "fit" ? 1 : "fit"))}
              className="w-12 text-center text-xs font-medium hover:text-black/70"
            >
              {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
            </button>
            <button
              type="button"
              onClick={() =>
                setZoom((z) => (z === "fit" ? 1.25 : Math.min(3, z + 0.25)))
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-black/5"
            >
              +
            </button>
          </div>

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
            disabled={!canRenderStage}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-[#1d1d1f] transition hover:bg-black/5 disabled:opacity-40"
          >
            <MonitorPlay className="h-4 w-4" />
            <span className="hidden sm:inline">放映</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!activeRunId || isExporting || !canExport}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1d1d1f] px-3 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isExporting ? "导出中" : !canExport ? "PPTX 生成中" : "导出"}
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
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

          {/* Thumbnails */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 pt-1">
            <div className="flex flex-col gap-2">
              {showPreviewLoadingNotice || showGeneratingNotice ? (
                <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mb-1 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-amber-700">
                      {showPreviewLoadingNotice
                        ? "正在读取单页预览图..."
                        : "正在同步可预览页..."}
                    </p>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-amber-200/50">
                      <div
                        className="h-full bg-amber-400"
                        style={{
                          width: `${Math.max(5, (orderedSlides.length / Math.max(1, 10)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              {slideSlots.map((slide) => {
                if (slide.isPlaceholder) {
                  if (hasAnyRenderableSlide) {
                    return null;
                  }
                  if (isLoading && slide.index > 0) {
                    return null;
                  }
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
                        {isLoading ? "正在加载预览..." : "等待 Pagevra SVG"}
                      </span>
                    </div>
                  );
                }
                const slideFrames = slide.legacySlide
                  ? buildSlideFrames(slide.legacySlide)
                  : [];
                const authorityFrames = buildAuthorityFrames(
                  slide.authoritySlide
                );
                const authoritySummary = summarizeAuthoritySlide(
                  slide.authoritySlide
                );
                const isActive = activeSlideSlot?.index === slide.index;
                const firstAuthorityFrame = authorityFrames[0] || null;
                const firstFrame = slideFrames[0] || null;
                const thumbnailSvgDataUrl =
                  firstAuthorityFrame?.svg_data_url ||
                  firstFrame?.svg_data_url ||
                  (isRenderableSvgDataUrl(slide.legacySlide?.thumbnail_url)
                    ? slide.legacySlide.thumbnail_url
                    : null);
                return (
                  <motion.button
                    key={
                      slide.legacySlide?.id ||
                      slide.authoritySlide?.slide_id ||
                      `thumb-${slide.index}`
                    }
                    type="button"
                    onClick={() => {
                      dispatchStageSelection({
                        type: "selectSlide",
                        slideIndex: slide.index,
                      });
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
                      {thumbnailSvgDataUrl ? (
                        <SvgPreviewSurface
                          svgDataUrl={thumbnailSvgDataUrl}
                          alt={slide.title || `Slide ${slide.index + 1}`}
                          objectClassName="pointer-events-none h-full w-full"
                          className="h-full w-full"
                          errorClassName="text-[10px]"
                        />
                      ) : hasAuthorityPreviewContent(slide.authoritySlide) ? (
                        <div className="flex h-full flex-col justify-center gap-1 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.96),_rgba(225,232,245,0.92),_rgba(240,244,250,0.98))] px-3 py-2">
                          <div className="line-clamp-2 text-[12px] font-semibold leading-5 text-[#1d1d1f]">
                            {slide.title || `Slide ${slide.index + 1}`}
                          </div>
                          <div className="line-clamp-2 text-[10px] leading-4 text-black/45">
                            {authoritySummary || "等待 Pagevra SVG 到达"}
                          </div>
                        </div>
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-zinc-100 to-zinc-200" />
                      )}
                    </div>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {String(slide.index + 1).padStart(2, "0")}
                    </span>
                    {Math.max(authorityFrames.length, slideFrames.length) >
                    1 ? (
                      <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        +
                        {Math.max(authorityFrames.length, slideFrames.length) -
                          1}
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
                  syncStatusDotClass
                )}
              />
              <span>{syncStatusLabel}</span>
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
          <section className="relative flex flex-1 overflow-auto p-6">
            {runSelectionBlocked ? (
              <div className="flex flex-col items-center justify-center m-auto gap-3 px-6 text-center text-white/70">
                <p className="text-lg font-semibold text-white">请选择 run</p>
                <p className="max-w-[460px] text-sm text-white/60">
                  当前页面已切换为严格 Diego 预览链路，不再自动回退到 session
                  最新产物。
                </p>
              </div>
            ) : canRenderStage ? (
              <>
                <div
                  ref={canvasRef}
                  className={cn(
                    "relative bg-white shadow-[0_24px_70px_-12px_rgba(0,0,0,0.35)] transition-all duration-200 m-auto",
                    zoom === "fit"
                      ? "w-full max-w-[1100px] rounded-lg overflow-hidden"
                      : "rounded-lg overflow-hidden"
                  )}
                  style={
                    zoom !== "fit"
                      ? {
                          width: `${1100 * zoom}px`,
                          minWidth: `${1100 * zoom}px`,
                        }
                      : {}
                  }
                >
                  <div className="aspect-video w-full bg-white relative">
                    {activeStageFrame?.svg_data_url ? (
                      <SvgPreviewSurface
                        svgDataUrl={activeStageFrame.svg_data_url}
                        alt={activeStageTitle}
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-black/55">
                        <p className="font-medium text-black/70">
                          Pagevra 单页 SVG 预览未就绪
                        </p>
                        <p className="max-w-[360px] text-xs text-black/45">
                          当前 PPT 预览只接受 Pagevra single-slide compile
                          返回的 SVG manifest，不再显示 HTML/PNG 旧链路结果。
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {isLoading ? (
                  <div className="absolute right-6 top-6 z-10 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-xs text-white/85 backdrop-blur">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在同步最新页
                  </div>
                ) : null}

                {/* Date watermark */}
                <div className="pointer-events-none absolute bottom-6 right-6 rounded bg-black/40 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
                  {diegoPreviewContext?.palette || "compile-context"}
                </div>
              </>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center m-auto gap-3 text-white/70">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--deck-accent)]" />
                <p className="text-sm">正在读取 Pagevra 单页 SVG...</p>
              </div>
            ) : previewBlockedReason && !hasAnyRenderableSlide ? (
              <div className="flex flex-col items-center justify-center m-auto gap-3 text-white/70">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--deck-accent)]" />
                <p className="text-sm">课程内容加载中，请稍候...</p>
              </div>
            ) : showWaitingState ? (
              <div className="flex flex-col items-center justify-center m-auto gap-3 text-white/70">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--deck-accent)]" />
                <p className="text-sm">run 已绑定，正在等待第一页 SVG...</p>
              </div>
            ) : null}
          </section>
        </main>
        <PreviewCopilotDrawer
          projectId={projectId}
          sessionId={activeSessionId}
          runId={activeRunId}
          artifactId={currentArtifactId}
          activeSlide={activeAuthoritySlide}
          activeScene={activeScene}
          selectedNodeId={selectedNodeId}
          preambleLogs={previewPreambleLogs}
          outline={copilotOutline}
          onSelectSlide={(slideIndex) => {
            dispatchStageSelection({
              type: "selectSlide",
              slideIndex,
            });
          }}
          onSelectNode={handleActiveAuthorityNodeSelect}
          onSceneUpdated={(scene) => {
            setSceneBySlideId((previous) => ({
              ...previous,
              [scene.slide_id]: scene,
            }));
          }}
          onRefreshPreview={() => void loadSlides()}
        />
      </div>

      {/* Fullscreen modal */}
      <AnimatePresence>
        {isFullscreen && canRenderStage ? (
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
                disabled={!activeSlideSlot || activeSlideSlot.index <= 0}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white transition hover:bg-black/60 disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="relative flex-1 overflow-hidden rounded-xl border border-white/15 bg-black/40">
                <div className="aspect-video w-full">
                  {activeStageFrame?.svg_data_url ? (
                    <SvgPreviewSurface
                      svgDataUrl={activeStageFrame.svg_data_url}
                      alt={activeStageTitle}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-white/65">
                      <p>Pagevra 单页 SVG 预览未就绪</p>
                      <p className="max-w-[360px] text-xs text-white/40">
                        当前 PPT 预览不再显示 HTML/PNG 旧链路结果。
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => moveSlide(1)}
                disabled={
                  !activeSlideSlot ||
                  activeSlideSlot.index >= slideSlots.length - 1
                }
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
              {activeSlideSlot?.title || `Slide ${currentSlideNumber || 1}`} ·{" "}
              {currentSlideNumber} / {totalSlides}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <RegenerateSlideDialog
        open={regenerateDialogOpen}
        onOpenChange={setRegenerateDialogOpen}
        sessionId={activeSessionId}
        runId={activeRunId || ""}
        artifactId={currentArtifactId}
        expectedRenderVersion={currentRenderVersion}
        slideId={activeAuthoritySlide?.slide_id || activeLegacySlide?.id}
        slideNo={currentSlideNumber || 1}
        slideTitle={activeSlideSlot?.title}
        onSuccess={() => {
          void loadSlides();
        }}
      />
    </div>
  );
}
