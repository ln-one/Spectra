import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewApi } from "@/lib/sdk/preview";
import { generateApi, type SessionRun } from "@/lib/sdk/generate";
import { ApiError } from "@/lib/sdk/client";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/hooks/use-toast";
import type { components } from "@/lib/sdk/types";
import { useShallow } from "zustand/react/shallow";

type Slide = components["schemas"]["Slide"] & {
  rendered_html_preview?: string | null;
  rendered_previews?: RenderedPreviewFrame[];
};

type RenderedPreviewFrame = {
  index: number;
  slide_id: string;
  image_url?: string | null;
  html_preview?: string | null;
  status?: string | null;
  split_index: number;
  split_count: number;
  width?: number | null;
  height?: number | null;
};

type RenderedPreview = {
  format?: string;
  page_count?: number;
  pages?: RenderedPreviewFrame[];
};

type DiegoPreviewContext = {
  provider: "diego";
  run_id?: string;
  palette?: string;
  style?: string;
  style_dna_id?: string;
  effective_template_style?: string;
  source_event_seq?: number;
  theme?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    light?: string;
    bg?: string;
  };
  fonts?: {
    title?: string;
    body?: string;
  };
};

type SessionIdentity = {
  session?: {
    session_id?: string;
  } | null;
} | null;

type RawPayload = Record<string, unknown>;

function resolveEventKey(event: {
  event_id?: string;
  cursor?: string;
  timestamp?: string;
  event_type?: string;
}): string {
  if (event.event_id) return `id:${event.event_id}`;
  if (event.cursor) return `cursor:${event.cursor}`;
  return `fallback:${event.timestamp ?? ""}:${event.event_type ?? ""}`;
}

function readStringField(payload: RawPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(payload: RawPayload, key: string): number | null {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function readRunIdFromTrace(payload: RawPayload): string | null {
  const trace = payload.run_trace;
  if (!trace || typeof trace !== "object") return null;
  const runId = (trace as { run_id?: unknown }).run_id;
  if (typeof runId === "string" && runId.trim()) return runId.trim();
  const traceRun = (trace as { run?: { run_id?: unknown } }).run;
  if (
    traceRun &&
    typeof traceRun === "object" &&
    typeof traceRun.run_id === "string" &&
    traceRun.run_id.trim()
  ) {
    return traceRun.run_id.trim();
  }
  return null;
}

function readRunIdFromPayload(payload: RawPayload): string | null {
  return readStringField(payload, "run_id") || readRunIdFromTrace(payload);
}

function normalizeTheme(value: unknown): DiegoPreviewContext["theme"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as RawPayload;
  const theme: DiegoPreviewContext["theme"] = {};
  for (const key of ["primary", "secondary", "accent", "light", "bg"] as const) {
    const parsed = readStringField(source, key);
    if (parsed) theme[key] = parsed;
  }
  return Object.keys(theme).length > 0 ? theme : undefined;
}

function normalizeFonts(value: unknown): DiegoPreviewContext["fonts"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as RawPayload;
  const fonts: DiegoPreviewContext["fonts"] = {};
  const title = readStringField(source, "title");
  const body = readStringField(source, "body");
  if (title) fonts.title = title;
  if (body) fonts.body = body;
  return Object.keys(fonts).length > 0 ? fonts : undefined;
}

function normalizeDiegoPreviewContext(
  value: unknown,
  runIdFallback: string | null
): DiegoPreviewContext | null {
  if (!value || typeof value !== "object") return null;
  const source = value as RawPayload;
  const normalized: DiegoPreviewContext = {
    provider: "diego",
  };

  const runId = readStringField(source, "run_id") || runIdFallback || undefined;
  if (runId) normalized.run_id = runId;
  const palette = readStringField(source, "palette");
  if (palette) normalized.palette = palette;
  const style = readStringField(source, "style");
  if (style) normalized.style = style;
  const styleDnaId = readStringField(source, "style_dna_id");
  if (styleDnaId) normalized.style_dna_id = styleDnaId;
  const templateStyle = readStringField(source, "effective_template_style");
  if (templateStyle) normalized.effective_template_style = templateStyle;
  const sourceSeq = readNumberField(source, "source_event_seq");
  if (sourceSeq !== null) normalized.source_event_seq = sourceSeq;

  normalized.theme = normalizeTheme(source.theme);
  normalized.fonts = normalizeFonts(source.fonts);

  return normalized;
}

function buildDiegoContextUpdateFromEvent(
  eventType: string,
  rawPayload: RawPayload,
  runId: string | null,
  seq: number | null
): DiegoPreviewContext | null {
  if (
    eventType !== "plan.completed" &&
    eventType !== "requirements.analyzed" &&
    eventType !== "requirements.analyzing.completed"
  ) {
    return null;
  }

  const update: DiegoPreviewContext = {
    provider: "diego",
    ...(runId ? { run_id: runId } : {}),
    ...(seq !== null ? { source_event_seq: seq } : {}),
  };

  if (eventType === "plan.completed") {
    const palette = readStringField(rawPayload, "palette");
    const style = readStringField(rawPayload, "style");
    const styleDnaId = readStringField(rawPayload, "style_dna_id");
    if (palette) update.palette = palette;
    if (style) update.style = style;
    if (styleDnaId) update.style_dna_id = styleDnaId;
    update.theme = normalizeTheme(rawPayload.theme);
    update.fonts = normalizeFonts(rawPayload.fonts);
    return update;
  }

  const palette = readStringField(rawPayload, "palette_name");
  const style =
    readStringField(rawPayload, "style_recipe") ||
    readStringField(rawPayload, "style_intent");
  const styleDnaId = readStringField(rawPayload, "style_dna_id");
  const templateStyle = readStringField(rawPayload, "effective_template_style");
  if (palette) update.palette = palette;
  if (style) update.style = style;
  if (styleDnaId) update.style_dna_id = styleDnaId;
  if (templateStyle) update.effective_template_style = templateStyle;
  return update;
}

function mergeDiegoPreviewContext(
  current: DiegoPreviewContext | null,
  update: DiegoPreviewContext | null,
  runIdFallback: string | null
): DiegoPreviewContext | null {
  if (!current && !update && !runIdFallback) return null;
  const base: DiegoPreviewContext = {
    provider: "diego",
    ...(current ?? {}),
  };
  if (runIdFallback && !base.run_id) {
    base.run_id = runIdFallback;
  }
  if (!update) return base;

  const merged: DiegoPreviewContext = {
    ...base,
    ...update,
    provider: "diego",
  };

  if (base.theme || update.theme) {
    merged.theme = {
      ...(base.theme ?? {}),
      ...(update.theme ?? {}),
    };
  }
  if (base.fonts || update.fonts) {
    merged.fonts = {
      ...(base.fonts ?? {}),
      ...(update.fonts ?? {}),
    };
  }
  if (typeof base.source_event_seq === "number" || typeof update.source_event_seq === "number") {
    merged.source_event_seq = Math.max(
      base.source_event_seq ?? 0,
      update.source_event_seq ?? 0
    );
  }
  return merged;
}

function buildSlidesContentMarkdown(slides: Slide[]): string {
  const sections = [...slides]
    .sort((a, b) => a.index - b.index)
    .map((slide) => {
      const title = (slide.title || `Slide ${slide.index + 1}`).trim();
      const body = (slide.content || "").trim();
      if (!body) return `## ${title}`;
      return `## ${title}\n\n${body}`;
    });
  return sections.join("\n\n---\n\n").trim();
}

function hasRenderablePreviewFrame(
  page: RenderedPreviewFrame | null | undefined
): boolean {
  if (!page) return false;
  return Boolean(page.image_url || page.html_preview);
}

function isGeneratingState(state: string | null | undefined): boolean {
  return (
    state === "DRAFTING_OUTLINE" ||
    state === "AWAITING_OUTLINE_CONFIRM" ||
    state === "GENERATING_CONTENT" ||
    state === "RENDERING"
  );
}

export function resolveActivePreviewRunId({
  activeSessionId,
  runIdFromQuery,
  storeActiveSessionId,
  storeActiveRunId,
  generationSession,
}: {
  activeSessionId: string | null;
  runIdFromQuery: string | null;
  storeActiveSessionId: string | null;
  storeActiveRunId: string | null;
  generationSession: SessionIdentity;
}): string | null {
  void activeSessionId;
  void storeActiveSessionId;
  void storeActiveRunId;
  void generationSession;
  return runIdFromQuery ? runIdFromQuery : null;
}

export function shouldAdoptStudioArtifactForPptPreview(
  payload: Record<string, unknown>
): boolean {
  const cardId = readStringField(payload, "card_id");
  const artifactType = readStringField(payload, "artifact_type");
  if (cardId === "courseware_ppt") return true;
  if (artifactType === "pptx") return true;
  return false;
}

export function useGeneratePreviewState({
  projectId,
  sessionIdFromQuery,
  runIdFromQuery,
  artifactIdFromQuery,
}: {
  projectId: string;
  sessionIdFromQuery: string | null;
  runIdFromQuery: string | null;
  artifactIdFromQuery: string | null;
}) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([]);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(
    artifactIdFromQuery
  );
  const [currentRenderVersion, setCurrentRenderVersion] = useState<number | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [previewBlockedReason, setPreviewBlockedReason] = useState<string | null>(
    null
  );
  const [slidesContentMarkdown, setSlidesContentMarkdown] = useState("");
  const [sessionFailureMessage, setSessionFailureMessage] = useState<
    string | null
  >(null);
  const [previewSessionState, setPreviewSessionState] = useState<string | null>(
    null
  );
  const [diegoPreviewContext, setDiegoPreviewContext] =
    useState<DiegoPreviewContext | null>(null);

  const processedEventKeysRef = useRef<Set<string>>(new Set());

  const {
    generationSession,
    generationHistory,
    fetchGenerationHistory,
    setActiveSessionId,
  } = useProjectStore(
    useShallow((state) => ({
      generationSession: state.generationSession,
      generationHistory: state.generationHistory,
      fetchGenerationHistory: state.fetchGenerationHistory,
      setActiveSessionId: state.setActiveSessionId,
    }))
  );

  const activeSessionId =
    sessionIdFromQuery ||
    generationSession?.session.session_id ||
    (generationHistory.length > 0 ? generationHistory[0].id : null);
  const activeRunId = runIdFromQuery?.trim() || null;

  useEffect(() => {
    if (!activeSessionId) return;
    setActiveSessionId(activeSessionId);
  }, [activeSessionId, setActiveSessionId]);

  useEffect(() => {
    if (!projectId) return;
    fetchGenerationHistory(projectId);
  }, [fetchGenerationHistory, projectId]);

  useEffect(() => {
    if (artifactIdFromQuery) {
      setCurrentArtifactId(artifactIdFromQuery);
    }
  }, [artifactIdFromQuery]);

  const loadSessionRuns = useCallback(async () => {
    if (!activeSessionId) {
      setSessionRuns([]);
      return;
    }
    try {
      const response = await generateApi.listRuns(activeSessionId, {
        limit: 50,
      });
      const runs = response?.data?.runs ?? [];
      setSessionRuns(runs);
    } catch {
      setSessionRuns([]);
    }
  }, [activeSessionId]);

  const loadSlides = useCallback(async () => {
    if (!activeSessionId) {
      setSlides([]);
      setSlidesContentMarkdown("");
      setPreviewBlockedReason("未找到可预览的会话。");
      setSessionFailureMessage(null);
      setPreviewSessionState(null);
      setIsLoading(false);
      return;
    }
    if (!activeRunId) {
      setSlides([]);
      setSlidesContentMarkdown("");
      setPreviewBlockedReason("请选择一个 Diego run 后再加载预览。");
      setSessionFailureMessage(null);
      setPreviewSessionState(null);
      setDiegoPreviewContext((current) =>
        mergeDiegoPreviewContext(current, null, null)
      );
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setPreviewBlockedReason(null);

      const response = await previewApi.getSessionPreview(activeSessionId, {
        run_id: activeRunId,
        artifact_id: currentArtifactId ?? undefined,
      });
      const previewData = (response.data ?? null) as {
        slides?: Slide[];
        rendered_preview?: RenderedPreview | null;
        diego_preview_context?: unknown;
      } | null;

      if (!response.success || !previewData?.slides) {
        setSlides([]);
        setSlidesContentMarkdown("");
        setPreviewBlockedReason("当前 run 暂无可展示预览。");
        return;
      }

      const renderedPreview = previewData.rendered_preview as
        | RenderedPreview
        | undefined;
      const renderedPages = ((renderedPreview?.pages ?? []) as RenderedPreviewFrame[])
        .filter(
          (page) =>
            page &&
            typeof page.index === "number" &&
            hasRenderablePreviewFrame(page)
        )
        .sort((a, b) => {
          const indexDiff = a.index - b.index;
          if (indexDiff !== 0) return indexDiff;
          return (a.split_index ?? 0) - (b.split_index ?? 0);
        });

      const pagesBySlideId = new Map<string, RenderedPreviewFrame[]>();
      const pagesByIndex = new Map<number, RenderedPreviewFrame[]>();
      for (const page of renderedPages) {
        if (page.slide_id) {
          const existing = pagesBySlideId.get(page.slide_id) ?? [];
          existing.push(page);
          pagesBySlideId.set(page.slide_id, existing);
        }
        const existingByIndex = pagesByIndex.get(page.index) ?? [];
        existingByIndex.push(page);
        pagesByIndex.set(page.index, existingByIndex);
      }

      const nextSlides = previewData.slides
        .map((slide) => {
          const matchedPages =
            (slide.id ? pagesBySlideId.get(slide.id) : undefined) ??
            pagesByIndex.get(slide.index) ??
            [];
          const primaryPage = matchedPages[0];
          return {
            ...slide,
            ...(primaryPage?.image_url
              ? { thumbnail_url: primaryPage.image_url }
              : {}),
            ...(typeof primaryPage?.html_preview === "string" &&
            primaryPage.html_preview.trim()
              ? { rendered_html_preview: primaryPage.html_preview }
              : {}),
            ...(matchedPages.length > 0
              ? { rendered_previews: matchedPages }
              : {}),
          };
        })
        .sort((a, b) => a.index - b.index);

      const payload = previewData as RawPayload;
      const incomingSlidesContent = payload.slides_content_markdown;
      const markdown =
        typeof incomingSlidesContent === "string" && incomingSlidesContent.trim()
          ? incomingSlidesContent
          : buildSlidesContentMarkdown(nextSlides);
      const incomingSessionState = payload.session_state;
      if (typeof incomingSessionState === "string" && incomingSessionState) {
        setPreviewSessionState(incomingSessionState);
      }
      const incomingContext = normalizeDiegoPreviewContext(
        previewData.diego_preview_context,
        activeRunId
      );
      setDiegoPreviewContext((current) =>
        mergeDiegoPreviewContext(current, incomingContext, activeRunId)
      );
      setSlides(nextSlides);
      setSlidesContentMarkdown(markdown);
      setCurrentArtifactId(response.data.artifact_id ?? null);
      setCurrentRenderVersion(response.data.render_version ?? null);
      setPreviewBlockedReason(
        nextSlides.length === 0 ? "当前 run 暂无可展示预览。" : null
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const reason =
          typeof error.details?.reason === "string"
            ? error.details.reason
            : null;
        if (reason === "run_not_ready") {
          setPreviewBlockedReason("当前 run 仍在生成中，请稍后刷新。");
        } else {
          setPreviewBlockedReason(error.message || "预览版本冲突，请稍后重试。");
        }
      } else if (error instanceof ApiError && error.status === 404) {
        setPreviewBlockedReason("该 run 不存在或不属于当前会话。");
      } else if (error instanceof ApiError) {
        setPreviewBlockedReason(error.message);
      } else {
        setPreviewBlockedReason("预览加载失败，请稍后重试。");
      }
      setSlides([]);
      setSlidesContentMarkdown("");
    } finally {
      setIsLoading(false);
    }
  }, [activeRunId, activeSessionId, currentArtifactId]);

  const { events } = useGenerationEvents({
    sessionId: activeSessionId && activeRunId ? activeSessionId : null,
    runId: activeRunId,
  });

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const snapshotSessionState =
    (generationSession as { session?: { state?: string } } | null)?.session
      ?.state ?? null;
  const sessionState = previewSessionState || snapshotSessionState;
  const isSessionGenerating = isGeneratingState(sessionState || latestEvent?.state);

  useEffect(() => {
    processedEventKeysRef.current.clear();
    setSessionFailureMessage(null);
    setPreviewSessionState(null);
    setDiegoPreviewContext((current) =>
      mergeDiegoPreviewContext(current, null, activeRunId)
    );
    void Promise.all([loadSessionRuns(), loadSlides()]);
  }, [activeRunId, activeSessionId, loadSessionRuns, loadSlides]);

  useEffect(() => {
    if (!activeRunId) return;
    for (const event of events) {
      const key = resolveEventKey(event as never);
      if (processedEventKeysRef.current.has(key)) continue;
      processedEventKeysRef.current.add(key);

      const eventType = event.event_type as string;
      const payload = (event.payload ?? {}) as RawPayload;
      const eventRunId = readRunIdFromPayload(payload);
      if (eventRunId && eventRunId !== activeRunId) {
        continue;
      }

      const sectionPayload =
        payload.section_payload && typeof payload.section_payload === "object"
          ? (payload.section_payload as RawPayload)
          : null;
      const diegoEventType =
        typeof sectionPayload?.diego_event_type === "string"
          ? sectionPayload.diego_event_type
          : eventType;
      const rawPayload =
        sectionPayload?.raw_payload && typeof sectionPayload.raw_payload === "object"
          ? (sectionPayload.raw_payload as RawPayload)
          : null;
      const diegoSeq = sectionPayload ? readNumberField(sectionPayload, "diego_seq") : null;

      if (rawPayload) {
        const update = buildDiegoContextUpdateFromEvent(
          diegoEventType,
          rawPayload,
          activeRunId,
          diegoSeq
        );
        if (update) {
          setDiegoPreviewContext((current) =>
            mergeDiegoPreviewContext(current, update, activeRunId)
          );
        }
      }

      if (
        eventType === "ppt.slide.generated" ||
        eventType === "ppt.completed" ||
        diegoEventType === "slide.generated" ||
        diegoEventType === "compile.completed"
      ) {
        void loadSlides();
        continue;
      }
      if (diegoEventType === "run.failed" || diegoEventType === "slide.failed") {
        const failedMessage =
          readStringField(payload, "progress_message") ||
          readStringField(payload, "error_message") ||
          readStringField(payload, "state_reason") ||
          diegoEventType;
        setSessionFailureMessage(failedMessage);
        void loadSlides();
        continue;
      }
      if (eventType === "state.changed" && event.state) {
        setPreviewSessionState(event.state);
      }
      if (eventType === "task.completed" || event.state === "SUCCESS") {
        void loadSlides();
      }
    }
  }, [activeRunId, events, loadSlides]);

  useEffect(() => {
    if (!activeRunId || !isSessionGenerating) return;
    const timer = window.setInterval(() => {
      void loadSlides();
    }, 2500);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeRunId, isSessionGenerating, loadSlides]);

  const handleResume = useCallback(async () => {
    if (!activeSessionId || isResuming) return;
    try {
      setIsResuming(true);
      await generateApi.sendCommand(activeSessionId, {
        command: {
          command_type: "RESUME_SESSION",
        },
      });
      await fetchGenerationHistory(projectId);
      await Promise.all([loadSessionRuns(), loadSlides()]);
      toast({
        title: "会话恢复成功",
        description: "已触发恢复并刷新 Diego 预览。",
      });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "恢复会话失败，请稍后重试";
      toast({
        title: "恢复会话失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsResuming(false);
    }
  }, [
    activeSessionId,
    fetchGenerationHistory,
    isResuming,
    loadSessionRuns,
    loadSlides,
    projectId,
  ]);

  const handleExport = useCallback(async () => {
    if (!activeSessionId || !activeRunId || isExporting) return;
    try {
      setIsExporting(true);
      const response = await previewApi.exportSessionPreview(activeSessionId, {
        artifact_id: currentArtifactId ?? undefined,
        run_id: activeRunId,
        format: "html",
        include_sources: true,
      });
      const content = response?.data?.content ?? "";
      if (!content) {
        toast({
          title: "导出失败",
          description: "当前 run 暂无可导出的预览内容。",
          variant: "destructive",
        });
        return;
      }

      const blob = new Blob([content], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `diego-preview-${activeRunId.slice(0, 8)}.html`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: "导出成功",
        description: "已导出当前 Diego run 的 HTML 预览。",
      });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "导出失败，请稍后重试";
      toast({
        title: "导出失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  }, [activeRunId, activeSessionId, currentArtifactId, isExporting]);

  return useMemo(
    () => ({
      slides,
      sessionRuns,
      isLoading,
      isExporting,
      isResuming,
      previewBlockedReason,
      isSessionGenerating,
      sessionState,
      sessionFailureMessage,
      slidesContentMarkdown,
      activeSessionId,
      activeRunId,
      currentArtifactId,
      currentRenderVersion,
      diegoPreviewContext,
      handleExport,
      handleResume,
      loadSlides,
      loadSessionRuns,
    }),
    [
      slides,
      sessionRuns,
      isLoading,
      isExporting,
      isResuming,
      previewBlockedReason,
      isSessionGenerating,
      sessionState,
      sessionFailureMessage,
      slidesContentMarkdown,
      activeSessionId,
      activeRunId,
      currentArtifactId,
      currentRenderVersion,
      diegoPreviewContext,
      handleExport,
      handleResume,
      loadSlides,
      loadSessionRuns,
    ]
  );
}
