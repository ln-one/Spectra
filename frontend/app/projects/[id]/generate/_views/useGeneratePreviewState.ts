import { useCallback, useEffect, useRef, useState } from "react";
import { previewApi, type ModifySessionRequest } from "@/lib/sdk/preview";
import { generateApi, type SessionRun } from "@/lib/sdk/generate";
import { projectSpaceApi } from "@/lib/sdk/project-space";
import { ApiError } from "@/lib/sdk/client";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/hooks/use-toast";
import type { components } from "@/lib/sdk/types";
import { useShallow } from "zustand/react/shallow";
import {
  buildArtifactDownloadFilename,
  inferArtifactDownloadExt,
  resolveArtifactTitleFromMetadata,
} from "@/lib/project-space/download-filename";

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
type SessionStatePayload = components["schemas"]["SessionStatePayloadTarget"];
type ArtifactType = components["schemas"]["Artifact"]["type"];
type SessionStatePayloadWithRun = SessionStatePayload & {
  current_run?: {
    run_id?: string;
  };
};

type ModifyTargetSlide = Pick<Slide, "id" | "index">;

type ModifyRetryContext = {
  slide: ModifyTargetSlide;
  instruction: string;
};

type SessionIdentity = {
  session?: {
    session_id?: string;
  } | null;
  current_run?: {
    run_id?: string;
  } | null;
} | null;

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

function readStringField(
  payload: Record<string, unknown>,
  key: string
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readRunIdFromTrace(payload: Record<string, unknown>): string | null {
  const trace = payload.run_trace;
  if (!trace || typeof trace !== "object") return null;
  const runId = (trace as { run_id?: unknown }).run_id;
  if (typeof runId === "string" && runId.trim()) return runId;
  const traceRun = (trace as { run?: { run_id?: unknown } }).run;
  if (
    traceRun &&
    typeof traceRun === "object" &&
    typeof traceRun.run_id === "string" &&
    traceRun.run_id.trim()
  ) {
    return traceRun.run_id;
  }
  return null;
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

function readBooleanField(
  payload: Record<string, unknown>,
  key: string
): boolean | null {
  const value = payload[key];
  return typeof value === "boolean" ? value : null;
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
  if (typeof page.html_preview === "string" && page.html_preview.trim()) {
    return true;
  }
  return Boolean(page.image_url);
}

function hasRenderablePreview(slide: Slide | null | undefined): boolean {
  if (!slide) return false;
  const pages = Array.isArray(slide.rendered_previews)
    ? slide.rendered_previews
    : [];
  if (pages.some((page) => hasRenderablePreviewFrame(page))) {
    return true;
  }
  if (
    typeof slide.rendered_html_preview === "string" &&
    slide.rendered_html_preview.trim()
  ) {
    return true;
  }
  return Boolean(slide.thumbnail_url);
}

function isGeneratingState(state: string | null | undefined): boolean {
  return state === "GENERATING_CONTENT" || state === "RENDERING";
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
  if (runIdFromQuery) return runIdFromQuery;
  if (
    activeSessionId &&
    storeActiveSessionId === activeSessionId &&
    storeActiveRunId
  ) {
    return storeActiveRunId;
  }
  if (
    activeSessionId &&
    generationSession?.session?.session_id === activeSessionId &&
    generationSession.current_run?.run_id
  ) {
    return generationSession.current_run.run_id;
  }
  return null;
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
    null
  );
  const [currentRenderVersion, setCurrentRenderVersion] = useState<
    number | null
  >(null);
  const [previewMode, setPreviewMode] = useState<"rendered" | "markdown">(
    "markdown"
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [regeneratingSlideId, setRegeneratingSlideId] = useState<string | null>(
    null
  );
  const [previewBlockedReason, setPreviewBlockedReason] = useState<
    string | null
  >(null);
  const [slidesContentMarkdown, setSlidesContentMarkdown] = useState("");
  const [sessionFailureMessage, setSessionFailureMessage] = useState<
    string | null
  >(null);
  const [previewSessionState, setPreviewSessionState] = useState<string | null>(
    null
  );

  const processedEventKeysRef = useRef<Set<string>>(new Set());
  const eventsCursorRef = useRef<string | null>(null);
  const pendingModifyRetryRef = useRef<ModifyRetryContext | null>(null);
  const eventsSnapshotReadyRef = useRef(false);

  const {
    generationSession,
    generationHistory,
    activeSessionId: activeSessionIdInStore,
    activeRunId: activeRunIdInStore,
    fetchGenerationHistory,
    setActiveSessionId,
    setActiveRunId,
  } = useProjectStore(
    useShallow((state) => ({
      generationSession: state.generationSession,
      generationHistory: state.generationHistory,
      activeSessionId: state.activeSessionId,
      activeRunId: state.activeRunId,
      fetchGenerationHistory: state.fetchGenerationHistory,
      setActiveSessionId: state.setActiveSessionId,
      setActiveRunId: state.setActiveRunId,
    }))
  );

  const activeSessionId =
    sessionIdFromQuery ||
    generationSession?.session.session_id ||
    (generationHistory.length > 0 ? generationHistory[0].id : null);

  const activeRunId = resolveActivePreviewRunId({
    activeSessionId,
    runIdFromQuery,
    storeActiveSessionId: activeSessionIdInStore,
    storeActiveRunId: activeRunIdInStore,
    generationSession: generationSession as SessionStatePayloadWithRun | null,
  });
  const hasPinnedPreviewAnchor = Boolean(runIdFromQuery || artifactIdFromQuery);

  useEffect(() => {
    if (!sessionIdFromQuery) return;
    setActiveSessionId(sessionIdFromQuery);
  }, [sessionIdFromQuery, setActiveSessionId]);

  useEffect(() => {
    if (!activeSessionId || activeSessionId === activeSessionIdInStore) return;
    setActiveSessionId(activeSessionId);
  }, [activeSessionId, activeSessionIdInStore, setActiveSessionId]);

  useEffect(() => {
    if (!runIdFromQuery) return;
    setActiveRunId(runIdFromQuery);
  }, [runIdFromQuery, setActiveRunId]);

  useEffect(() => {
    if (artifactIdFromQuery) {
      setCurrentArtifactId(artifactIdFromQuery);
    }
  }, [artifactIdFromQuery]);

  useEffect(() => {
    if (projectId) {
      fetchGenerationHistory(projectId);
    }
  }, [projectId, fetchGenerationHistory]);

  const loadSessionRuns = useCallback(async () => {
    if (!activeSessionId) {
      setSessionRuns([]);
      return;
    }
    try {
      const response = await generateApi.listRuns(activeSessionId, {
        limit: 30,
      });
      setSessionRuns(response?.data?.runs ?? []);
    } catch {
      setSessionRuns([]);
    }
  }, [activeSessionId]);

  const loadSlides = useCallback(async () => {
    if (!activeSessionId) {
      setSlides([]);
      setSlidesContentMarkdown("");
      setSessionFailureMessage(null);
      setIsLoading(false);
      return;
    }

    const applyPreviewResponse = (
      response: Awaited<ReturnType<typeof previewApi.getSessionPreview>>
    ): {
      renderedCount: number;
      markdownReady: boolean;
    } => {
      const previewData = (response.data ?? null) as {
        slides?: Slide[];
        rendered_preview?: RenderedPreview | null;
      } | null;
      if (response.success && previewData?.slides) {
        const renderedPreview = previewData.rendered_preview as
          | RenderedPreview
          | undefined;
        const renderedPages = (
          (renderedPreview?.pages ?? []) as RenderedPreviewFrame[]
        )
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
        const payload = previewData as Record<string, unknown>;
        const incomingSlidesContent = payload.slides_content_markdown;
        const markdown =
          typeof incomingSlidesContent === "string" &&
          incomingSlidesContent.trim()
            ? incomingSlidesContent
            : buildSlidesContentMarkdown(nextSlides);
        const incomingSessionState = payload.session_state;
        if (typeof incomingSessionState === "string" && incomingSessionState) {
          setPreviewSessionState(incomingSessionState);
        }
        setPreviewBlockedReason(null);
        setSlides(nextSlides);
        setSlidesContentMarkdown(markdown);
        setCurrentArtifactId(response.data.artifact_id ?? null);
        setCurrentRenderVersion(response.data.render_version ?? null);
        setPreviewMode(
          previewData.slides.some((slide) => hasRenderablePreview(slide))
            ? "rendered"
            : "markdown"
        );
        return {
          renderedCount: renderedPages.length,
          markdownReady: Boolean(markdown.trim()),
        };
      }
      return { renderedCount: 0, markdownReady: false };
    };

    try {
      setPreviewBlockedReason(null);
      const response = await previewApi.getSessionPreview(activeSessionId, {
        artifact_id: currentArtifactId ?? undefined,
        run_id: activeRunId ?? undefined,
      });
      const applied = applyPreviewResponse(response);

      const shouldFallbackToSessionAnchor =
        !hasPinnedPreviewAnchor &&
        Boolean(activeRunId || currentArtifactId) &&
        applied.renderedCount === 0 &&
        !applied.markdownReady;

      if (shouldFallbackToSessionAnchor) {
        const fallbackResponse =
          await previewApi.getSessionPreview(activeSessionId);
        setActiveRunId(null);
        setCurrentArtifactId(fallbackResponse.data?.artifact_id ?? null);
        applyPreviewResponse(fallbackResponse);
      } else if (
        hasPinnedPreviewAnchor &&
        applied.renderedCount === 0 &&
        !applied.markdownReady
      ) {
        setPreviewBlockedReason("该历史记录关联的预览内容不存在或已失效。");
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        activeRunId &&
        !runIdFromQuery &&
        error.message.includes("不属于会话")
      ) {
        try {
          setActiveRunId(null);
          const fallbackResponse = await previewApi.getSessionPreview(
            activeSessionId,
            {
              artifact_id: currentArtifactId ?? undefined,
            }
          );
          applyPreviewResponse(fallbackResponse);
          return;
        } catch (fallbackError) {
          console.error(
            "Failed to reload slides preview after clearing stale run:",
            fallbackError
          );
        }
      }
      if (error instanceof ApiError && error.status === 409) {
        const reason =
          typeof error.details?.reason === "string"
            ? error.details.reason
            : null;
        if (reason === "run_not_ready") {
          setPreviewBlockedReason("当前运行尚未生成可预览内容，请稍后再试。");
          return;
        }
        toast({
          title: "版本已变化",
          description: "版本已变化，请刷新后重试。",
          variant: "destructive",
        });
        return;
      }

      if (error instanceof ApiError && error.message.includes("不支持预览")) {
        try {
          const sessionResp = await generateApi.getSessionSnapshot(
            activeSessionId,
            { run_id: activeRunId ?? undefined }
          );
          const state = sessionResp?.data?.session?.state;
          const sessionRecord = (sessionResp?.data?.session ?? {}) as Record<
            string,
            unknown
          >;
          const errorMessage =
            sessionRecord.error_message ?? sessionRecord.errorMessage;
          if (typeof errorMessage === "string" && errorMessage.trim()) {
            setSessionFailureMessage(errorMessage);
          }
          if (state === "AWAITING_OUTLINE_CONFIRM") {
            setPreviewBlockedReason(
              "当前会话仍在大纲确认阶段，请先确认后再预览。"
            );
          } else {
            setPreviewBlockedReason(error.message);
          }
        } catch {
          setPreviewBlockedReason(error.message);
        }
      } else {
        console.error("Failed to load slides preview:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    activeRunId,
    activeSessionId,
    hasPinnedPreviewAnchor,
    currentArtifactId,
    runIdFromQuery,
    setActiveRunId,
  ]);

  const loadEventsSnapshot = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const response = await generateApi.listEvents(activeSessionId, {
        cursor: eventsCursorRef.current,
        limit: 200,
      });
      const list = response?.data?.events ?? [];
      for (const event of list) {
        const key = resolveEventKey(event as never);
        if (processedEventKeysRef.current.has(key)) continue;
        processedEventKeysRef.current.add(key);
        if (event.cursor) {
          eventsCursorRef.current = event.cursor;
        }
      }
    } catch {
      // keep SSE-only mode when snapshot fetch fails
    } finally {
      eventsSnapshotReadyRef.current = true;
    }
  }, [activeSessionId]);

  const { events } = useGenerationEvents({
    sessionId: activeSessionId || null,
  });

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const snapshotSessionState =
    (generationSession as { session?: { state?: string } } | null)?.session
      ?.state ?? null;
  const sessionState = previewSessionState || snapshotSessionState;
  const hasSnapshotState =
    typeof sessionState === "string" && sessionState.length > 0;
  const isSessionGenerating = hasSnapshotState
    ? isGeneratingState(sessionState)
    : isGeneratingState(latestEvent?.state);

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
        description: "已尝试恢复会话并刷新预览。",
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

  useEffect(() => {
    if (sessionState !== "FAILED") return;
    const message =
      (generationSession as { session?: { error_message?: string } } | null)
        ?.session?.error_message ||
      (generationSession as { session?: { errorMessage?: string } } | null)
        ?.session?.errorMessage ||
      null;
    if (typeof message === "string" && message.trim()) {
      setSessionFailureMessage(message);
    }
  }, [generationSession, sessionState]);

  useEffect(() => {
    if (!activeSessionId || !isSessionGenerating) return;
    const timer = window.setInterval(() => {
      void loadSlides();
    }, 2500);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeSessionId, isSessionGenerating, loadSlides]);

  useEffect(() => {
    processedEventKeysRef.current.clear();
    eventsCursorRef.current = null;
    pendingModifyRetryRef.current = null;
    eventsSnapshotReadyRef.current = false;
    setSlidesContentMarkdown("");
    setSessionFailureMessage(null);
    setPreviewSessionState(null);
    void Promise.all([loadEventsSnapshot(), loadSessionRuns(), loadSlides()]);
  }, [loadEventsSnapshot, loadSessionRuns, loadSlides]);

  useEffect(() => {
    for (const event of events) {
      const key = resolveEventKey(event as never);
      if (processedEventKeysRef.current.has(key)) continue;
      processedEventKeysRef.current.add(key);
      if (event.cursor) {
        eventsCursorRef.current = event.cursor;
      }

      const eventType = event.event_type as string;
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const sectionPayload =
        payload.section_payload && typeof payload.section_payload === "object"
          ? (payload.section_payload as Record<string, unknown>)
          : null;
      const diegoEventType =
        typeof sectionPayload?.diego_event_type === "string"
          ? sectionPayload.diego_event_type
          : eventType;

      if (eventType === "ppt.started") {
        setPreviewBlockedReason(null);
        setPreviewSessionState("RENDERING");
        void loadSlides();
        continue;
      }
      if (
        eventType === "ppt.slide.generated" ||
        diegoEventType === "slide.generated"
      ) {
        void loadSlides();
        continue;
      }
      if (
        eventType === "ppt.completed" ||
        diegoEventType === "compile.completed"
      ) {
        void loadSlides();
        continue;
      }
      if (
        diegoEventType === "run.failed" ||
        diegoEventType === "slide.failed"
      ) {
        const failedMessage =
          readStringField(payload, "progress_message") ||
          readStringField(payload, "error_message") ||
          readStringField(payload, "state_reason") ||
          diegoEventType;
        setSessionFailureMessage(failedMessage);
      }
      if (
        eventType === "slide.modify.started" ||
        eventType === "slide.modify.processing"
      ) {
        const eventSlideId =
          typeof payload.slide_id === "string" ? payload.slide_id : null;
        if (eventSlideId) {
          setRegeneratingSlideId(eventSlideId);
        }
        continue;
      }
      if (eventType === "slide.modify.failed") {
        setRegeneratingSlideId(null);
        if (eventsSnapshotReadyRef.current) {
          const message =
            typeof payload.error_message === "string"
              ? payload.error_message
              : "单页修改失败";
          toast({
            title: "单页修改失败",
            description: message,
            variant: "destructive",
          });
        }
        continue;
      }
      if (
        (eventType === "task.completed" || eventType === "state.changed") &&
        readStringField(payload, "tool_type") === "slide_modify"
      ) {
        const eventSlideId =
          typeof payload.slide_id === "string" ? payload.slide_id : null;
        const previewReady = readBooleanField(payload, "preview_ready");
        if (event.state === "SUCCESS" || previewReady === true) {
          setRegeneratingSlideId((current) => {
            if (!current) return null;
            if (!eventSlideId) return null;
            return current === eventSlideId ? null : current;
          });
        }
      }
      if (eventType === "slide.updated" && payload.slide) {
        const updatedSlide = payload.slide as Slide;
        setSlides((prev) => {
          const idx = prev.findIndex(
            (s) =>
              (s.id && s.id === updatedSlide.id) ||
              s.index === updatedSlide.index
          );
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...updatedSlide };
            return next.sort((a, b) => a.index - b.index);
          }
          return [...prev, updatedSlide].sort((a, b) => a.index - b.index);
        });
        if (updatedSlide.id) {
          setRegeneratingSlideId((current) =>
            current === updatedSlide.id ? null : current
          );
        } else {
          setRegeneratingSlideId(null);
        }
        void loadSessionRuns();
        continue;
      }
      if (eventType === "task.failed") {
        const stage = readStringField(payload, "stage");
        const cardId = readStringField(payload, "card_id");
        const artifactId = readStringField(payload, "artifact_id");
        const runId = readRunIdFromTrace(payload);
        const failedMessage =
          readStringField(payload, "error_message") ||
          readStringField(payload, "error") ||
          readStringField(payload, "state_reason") ||
          readStringField(payload, "message");
        if (failedMessage) {
          setSessionFailureMessage(failedMessage);
        }

        if (stage === "studio_card_execute") {
          if (artifactId) setCurrentArtifactId(artifactId);
          if (runId) setActiveRunId(runId);

          const studioFailedMessage =
            failedMessage || "Studio execution task failed.";

          const runLabel = runId ? `run ${runId}` : "unknown run";
          const cardLabel = cardId ?? "unknown card";
          toast({
            title: "Studio task failed",
            description: `${cardLabel}, ${runLabel}: ${studioFailedMessage}`,
            variant: "destructive",
          });
          void Promise.all([loadSlides(), loadSessionRuns()]);
          continue;
        }

        const failedRunMatchesActive =
          !runId || !activeRunId || runId === activeRunId;
        if (artifactId) setCurrentArtifactId(artifactId);
        if (runId) setActiveRunId(runId);
        if (failedRunMatchesActive) {
          void Promise.all([loadSlides(), loadSessionRuns()]);
          continue;
        }
      }
      if (eventType === "task.completed") {
        const stage = readStringField(payload, "stage");
        const cardId = readStringField(payload, "card_id");
        const artifactId = readStringField(payload, "artifact_id");
        const runId = readRunIdFromTrace(payload);

        if (stage === "studio_card_execute") {
          if (artifactId) setCurrentArtifactId(artifactId);
          if (runId) setActiveRunId(runId);

          const runLabel = runId ? `run ${runId}` : "unknown run";
          const cardLabel = cardId ?? "unknown card";
          toast({
            title: "Studio task completed",
            description: `${cardLabel}, ${runLabel}. Preview is refreshing.`,
          });
          void Promise.all([loadSlides(), loadSessionRuns()]);
          continue;
        }
      }
      if (eventType === "task.completed" || event.state === "SUCCESS") {
        if (event.state === "SUCCESS") {
          setRegeneratingSlideId(null);
        }
        void Promise.all([loadSlides(), loadSessionRuns()]);
      }
    }
  }, [events, loadSessionRuns, loadSlides, setActiveRunId]);

  const handleExport = useCallback(async () => {
    if (!activeSessionId || isExporting) return;
    try {
      setIsExporting(true);

      if (projectId && currentArtifactId) {
        try {
          const [artifactResponse, artifactBlob] = await Promise.all([
            projectSpaceApi.getArtifact(projectId, currentArtifactId),
            projectSpaceApi.downloadArtifact(projectId, currentArtifactId),
          ]);
          const artifactType = artifactResponse.artifact?.type;
          const artifactTitle = resolveArtifactTitleFromMetadata(
            artifactResponse.artifact?.metadata
          );
          const url = URL.createObjectURL(artifactBlob);
          const link = document.createElement("a");
          link.href = url;
          link.download = buildArtifactDownloadFilename({
            title: artifactTitle,
            artifactId: currentArtifactId,
            artifactType: artifactType as ArtifactType | undefined,
            ext: inferArtifactDownloadExt(artifactType),
          });
          link.click();
          URL.revokeObjectURL(url);
          toast({
            title: "导出成功",
            description: "已通过 artifact 下载文件。",
          });
          return;
        } catch {
          // Fall back to preview export for artifacts not ready in project space.
        }
      }

      const response = await previewApi.exportSessionPreview(activeSessionId, {
        artifact_id: currentArtifactId ?? undefined,
        run_id: activeRunId ?? undefined,
        format: "html",
        include_sources: true,
      });
      const content = response?.data?.content ?? "";
      if (!content) return;

      const blob = new Blob([content], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `preview-${activeSessionId.slice(0, 8)}.html`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: "导出成功",
        description: "已回退为预览 HTML 导出。",
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast({
          title: "版本已变化",
          description: "版本已变化，请刷新后重试。",
          variant: "destructive",
        });
        return;
      }
      console.error("Failed to export preview:", error);
    } finally {
      setIsExporting(false);
    }
  }, [activeRunId, activeSessionId, currentArtifactId, isExporting, projectId]);

  const submitModifyRequest = useCallback(
    async (slide: ModifyTargetSlide, instruction: string) => {
      if (!activeSessionId) return;
      const slideId = slide.id || `slide-${slide.index}`;
      setRegeneratingSlideId(slideId);
      const requestBody: ModifySessionRequest = {
        artifact_id: currentArtifactId ?? undefined,
        run_id: activeRunId ?? undefined,
        slide_id: slide.id ?? undefined,
        slide_index: slide.index + 1,
        instruction,
        base_render_version: currentRenderVersion ?? undefined,
        scope: "current_slide_only",
        preserve_style: true,
        preserve_layout: true,
        preserve_deck_consistency: true,
        patch: {
          schema_version: 1,
          operations: [],
        },
      };
      await previewApi.modifySessionPreview(activeSessionId, requestBody);
    },
    [activeRunId, activeSessionId, currentArtifactId, currentRenderVersion]
  );

  const handleRegenerateSlide = useCallback(
    async (slide: ModifyTargetSlide) => {
      if (!activeSessionId || regeneratingSlideId) return;
      const instruction = window.prompt("请输入这一页的修改要求");
      const normalizedInstruction = instruction?.trim() ?? "";
      if (!normalizedInstruction) {
        toast({
          title: "未提交修改",
          description: "修改要求不能为空。",
          variant: "destructive",
        });
        return;
      }
      try {
        await submitModifyRequest(slide, normalizedInstruction);
        await loadSlides();
        toast({
          title: "单页修改已提交",
          description: `第 ${slide.index + 1} 页已进入修改队列。`,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          pendingModifyRetryRef.current = {
            slide,
            instruction: normalizedInstruction,
          };
          await loadSlides();
          const shouldRetry = window.confirm(
            "检测到版本冲突，已拉取最新 render version。是否立即重试？"
          );
          if (shouldRetry && pendingModifyRetryRef.current) {
            const pending = pendingModifyRetryRef.current;
            pendingModifyRetryRef.current = null;
            await submitModifyRequest(pending.slide, pending.instruction);
            await loadSlides();
            toast({
              title: "重试已提交",
              description: "已使用最新 render version 重新提交。",
            });
            return;
          }
          toast({
            title: "版本冲突",
            description: "已刷新到最新版本，可再次点击单页修改。",
            variant: "destructive",
          });
          return;
        }
        const message =
          error instanceof ApiError
            ? error.message
            : "单页修改失败，请稍后重试";
        toast({
          title: "单页修改失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        setRegeneratingSlideId(null);
      }
    },
    [activeSessionId, loadSlides, regeneratingSlideId, submitModifyRequest]
  );

  return {
    slides,
    sessionRuns,
    isLoading,
    isExporting,
    isResuming,
    regeneratingSlideId,
    previewBlockedReason,
    previewMode,
    isSessionGenerating,
    sessionState,
    sessionFailureMessage,
    slidesContentMarkdown,
    activeSessionId,
    activeRunId,
    currentArtifactId,
    handleExport,
    handleResume,
    handleRegenerateSlide,
    loadSlides,
    loadSessionRuns,
  };
}
