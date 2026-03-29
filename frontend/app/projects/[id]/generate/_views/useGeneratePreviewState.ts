import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewApi, type ModifySessionRequestV1 } from "@/lib/sdk/preview";
import { generateApi, type SessionRun } from "@/lib/sdk/generate";
import { projectSpaceApi } from "@/lib/sdk/project-space";
import { ApiError } from "@/lib/sdk/client";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/hooks/use-toast";
import type { components } from "@/lib/sdk/types";
import {
  patchLatestQueueItem,
  supportsImagePatchFromEnv,
  type EditQueueItem,
} from "@/lib/project/preview-workbench";
import { useShallow } from "zustand/react/shallow";

type Slide = components["schemas"]["Slide"];
type SessionStatePayload = components["schemas"]["SessionStatePayload"];
type ArtifactType = components["schemas"]["Artifact"]["type"];
type OutlineSectionPayload = {
  section_index?: number;
  index?: number;
  title?: string;
  heading?: string;
};

type SessionStatePayloadWithRun = SessionStatePayload & {
  current_run?: {
    run_id?: string;
  };
};

type RetryDraft = {
  slide: Slide;
  instruction: string;
};

const MAX_QUEUE_ITEMS = 24;

function trimQueue(queue: EditQueueItem[]): EditQueueItem[] {
  if (queue.length <= MAX_QUEUE_ITEMS) return queue;
  return queue.slice(queue.length - MAX_QUEUE_ITEMS);
}

function inferDownloadExt(artifactType: ArtifactType | undefined): string {
  if (!artifactType) return "bin";
  switch (artifactType) {
    case "pptx":
      return "pptx";
    case "docx":
      return "docx";
    case "html":
      return "html";
    case "mp4":
      return "mp4";
    case "gif":
      return "gif";
    case "mindmap":
      return "json";
    case "summary":
      return "md";
    case "exercise":
      return "json";
    default:
      return "bin";
  }
}

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

function makeQueueItem(slide: Slide, instruction: string): EditQueueItem {
  const now = new Date().toISOString();
  return {
    id: `edit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    slideId: slide.id || null,
    slideIndex: slide.index,
    instruction,
    status: "submitted",
    message: "Submitting request...",
    createdAt: now,
    updatedAt: now,
  };
}

function patchQueueItemById(
  queue: EditQueueItem[],
  itemId: string,
  patch: Partial<EditQueueItem>
): EditQueueItem[] {
  return queue.map((item) =>
    item.id === itemId
      ? {
          ...item,
          ...patch,
          updatedAt: patch.updatedAt ?? new Date().toISOString(),
        }
      : item
  );
}

function patchLatestPendingQueueItem(
  queue: EditQueueItem[],
  patch: Partial<EditQueueItem>
): EditQueueItem[] {
  const next = [...queue];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const item = next[index];
    if (item.status === "success" || item.status === "failed") continue;
    next[index] = {
      ...item,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    return next;
  }
  return queue;
}

function extractSlideTarget(payload: Record<string, unknown>): {
  slideId?: string | null;
  slideIndex?: number;
} {
  const slideId = typeof payload.slide_id === "string" ? payload.slide_id : null;
  const zeroBasedIndex =
    typeof payload.slide_index === "number"
      ? Math.max(0, payload.slide_index - 1)
      : undefined;
  return { slideId, slideIndex: zeroBasedIndex };
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
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [currentRenderVersion, setCurrentRenderVersion] = useState<number | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [previewBlockedReason, setPreviewBlockedReason] = useState<string | null>(
    null
  );
  const [isOutlineGenerating, setIsOutlineGenerating] = useState(false);
  const [outlineSections, setOutlineSections] = useState<string[]>([]);
  const [editQueue, setEditQueue] = useState<EditQueueItem[]>([]);

  const processedEventKeysRef = useRef<Set<string>>(new Set());
  const eventsCursorRef = useRef<string | null>(null);
  const retryDraftsRef = useRef<Map<string, RetryDraft>>(new Map());

  const supportsImageEditing = useMemo(() => supportsImagePatchFromEnv(), []);

  const {
    generationSession,
    generationHistory,
    activeRunId: activeRunIdInStore,
    fetchGenerationHistory,
    setActiveSessionId,
    setActiveRunId,
  } = useProjectStore(
    useShallow((state) => ({
      generationSession: state.generationSession,
      generationHistory: state.generationHistory,
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

  const activeRunId =
    runIdFromQuery ||
    activeRunIdInStore ||
    ((generationSession as SessionStatePayloadWithRun | null)?.current_run?.run_id ??
      null);

  useEffect(() => {
    if (!sessionIdFromQuery) return;
    setActiveSessionId(sessionIdFromQuery);
  }, [sessionIdFromQuery, setActiveSessionId]);

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
      const response = await generateApi.listRuns(activeSessionId, { limit: 30 });
      setSessionRuns(response?.data?.runs ?? []);
    } catch {
      setSessionRuns([]);
    }
  }, [activeSessionId]);

  const loadSlides = useCallback(async () => {
    if (!activeSessionId) {
      setIsLoading(false);
      return;
    }

    try {
      setPreviewBlockedReason(null);
      const response = await previewApi.getSessionPreview(activeSessionId, {
        artifact_id: currentArtifactId ?? undefined,
        run_id: activeRunId ?? undefined,
      });

      if (response.success && response.data?.slides) {
        setSlides(response.data.slides.sort((a, b) => a.index - b.index));
        setCurrentArtifactId(response.data.artifact_id ?? null);
        setCurrentRenderVersion(response.data.render_version ?? null);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const reason =
          typeof error.details?.reason === "string" ? error.details.reason : null;
        if (reason === "run_not_ready") {
          setPreviewBlockedReason(
            "The selected run is not preview-ready yet. Wait for generation to finish."
          );
          return;
        }
        toast({
          title: "Render version changed",
          description: "Refresh completed. Please retry your operation.",
          variant: "destructive",
        });
        return;
      }

      if (error instanceof ApiError) {
        setPreviewBlockedReason(error.message);
      } else {
        console.error("Failed to load slides preview:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeRunId, activeSessionId, currentArtifactId]);

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
      // Keep SSE-only mode when snapshot fetch fails.
    }
  }, [activeSessionId]);

  const { events } = useGenerationEvents({
    sessionId: activeSessionId || null,
  });

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const isSessionGenerating =
    latestEvent?.state === "GENERATING_CONTENT" || latestEvent?.state === "RENDERING";

  const handleResume = useCallback(async () => {
    if (!activeSessionId || isResuming) return;
    try {
      setIsResuming(true);
      await generateApi.resumeSession(activeSessionId);
      await fetchGenerationHistory(projectId);
      await Promise.all([loadSessionRuns(), loadSlides()]);
      toast({
        title: "Session resumed",
        description: "Runtime state refreshed.",
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Failed to resume the session. Please retry.";
      toast({
        title: "Resume failed",
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
    processedEventKeysRef.current.clear();
    eventsCursorRef.current = null;
    setOutlineSections([]);
    setIsOutlineGenerating(false);
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

      if (eventType === "outline.started") {
        setIsOutlineGenerating(true);
        continue;
      }
      if (eventType === "outline.section.generated") {
        const section = payload as OutlineSectionPayload;
        const index =
          typeof section.section_index === "number"
            ? section.section_index
            : typeof section.index === "number"
              ? section.index
              : null;
        const title =
          (typeof section.title === "string" && section.title) ||
          (typeof section.heading === "string" && section.heading) ||
          "Untitled section";
        if (typeof index === "number") {
          setOutlineSections((prev) => {
            const next = [...prev];
            next[index] = title;
            return next;
          });
        }
        continue;
      }
      if (eventType === "outline.completed") {
        setIsOutlineGenerating(false);
        continue;
      }

      if (
        eventType === "slide.modify.started" ||
        eventType === "slide.modify.processing"
      ) {
        const target = extractSlideTarget(payload);
        setEditQueue((prev) =>
          patchLatestQueueItem(prev, target, {
            status: "processing",
            message: "Backend is processing this edit request.",
          })
        );
        continue;
      }

      if (eventType === "slide.modify.failed") {
        const target = extractSlideTarget(payload);
        const message =
          typeof payload.error_message === "string"
            ? payload.error_message
            : "Slide modify request failed.";
        setEditQueue((prev) => {
          const patched = patchLatestQueueItem(prev, target, {
            status: "failed",
            message,
          });
          if (patched === prev) {
            return patchLatestPendingQueueItem(prev, {
              status: "failed",
              message,
            });
          }
          return patched;
        });
        continue;
      }

      if (eventType === "slide.updated" && payload.slide) {
        const updatedSlide = payload.slide as Slide;
        setSlides((prev) => {
          const index = prev.findIndex(
            (slide) =>
              (slide.id && slide.id === updatedSlide.id) ||
              slide.index === updatedSlide.index
          );
          if (index !== -1) {
            const next = [...prev];
            next[index] = { ...next[index], ...updatedSlide };
            return next.sort((a, b) => a.index - b.index);
          }
          return [...prev, updatedSlide].sort((a, b) => a.index - b.index);
        });
        setEditQueue((prev) =>
          patchLatestQueueItem(
            prev,
            { slideId: updatedSlide.id, slideIndex: updatedSlide.index },
            {
              status: "success",
              message: "Slide updated event received.",
            }
          )
        );
        void loadSessionRuns();
        continue;
      }

      if (eventType === "task.completed" || event.state === "SUCCESS") {
        void Promise.all([loadSlides(), loadSessionRuns()]);
      }
    }
  }, [events, loadSessionRuns, loadSlides]);

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
          const artifactType = artifactResponse.data.artifact?.type;
          const downloadExt = inferDownloadExt(artifactType);
          const url = URL.createObjectURL(artifactBlob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `artifact-${currentArtifactId.slice(0, 8)}.${downloadExt}`;
          link.click();
          URL.revokeObjectURL(url);
          toast({
            title: "Download started",
            description: "File is being downloaded from artifact storage.",
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
        title: "Fallback export started",
        description: "Using preview HTML export as fallback.",
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast({
          title: "Render version changed",
          description: "Please refresh and retry export.",
          variant: "destructive",
        });
        return;
      }
      console.error("Failed to export preview:", error);
    } finally {
      setIsExporting(false);
    }
  }, [
    activeRunId,
    activeSessionId,
    currentArtifactId,
    isExporting,
    projectId,
  ]);

  const submitSlideEdit = useCallback(
    async (
      slide: Slide,
      instruction: string,
      existingQueueItemId?: string
    ): Promise<string | null> => {
      if (!activeSessionId) return null;
      const normalizedInstruction = instruction.trim();
      if (!normalizedInstruction) return null;

      const itemId = existingQueueItemId ?? makeQueueItem(slide, normalizedInstruction).id;
      const isRetry = Boolean(existingQueueItemId);

      if (!isRetry) {
        const newItem: EditQueueItem = {
          id: itemId,
          slideId: slide.id || null,
          slideIndex: slide.index,
          instruction: normalizedInstruction,
          status: "submitted",
          message: "Submitting request...",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setEditQueue((prev) => trimQueue([...prev, newItem]));
      } else {
        setEditQueue((prev) =>
          patchQueueItemById(prev, itemId, {
            status: "submitted",
            message: "Retrying with latest render version...",
          })
        );
      }

      retryDraftsRef.current.set(itemId, {
        slide,
        instruction: normalizedInstruction,
      });

      setIsSubmittingEdit(true);
      try {
        const requestBody: ModifySessionRequestV1 = {
          artifact_id: currentArtifactId ?? undefined,
          run_id: activeRunId ?? undefined,
          slide_id: slide.id ?? undefined,
          slide_index: slide.index + 1,
          instruction: normalizedInstruction,
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
        setEditQueue((prev) =>
          patchQueueItemById(prev, itemId, {
            status: "submitted",
            message: "Accepted by backend. Waiting for processing event.",
          })
        );
        toast({
          title: "Redo request submitted",
          description: `Slide ${slide.index + 1} was queued for backend processing.`,
        });
        return itemId;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          await loadSlides();
          setEditQueue((prev) =>
            patchQueueItemById(prev, itemId, {
              status: "conflict",
              message:
                "Render version conflict detected. Refresh done. Use Retry button.",
            })
          );
          toast({
            title: "Render conflict",
            description: "Version refreshed. Click retry in the queue item.",
            variant: "destructive",
          });
          return itemId;
        }

        const message =
          error instanceof ApiError
            ? error.message
            : "Slide modify request failed. Please retry.";
        setEditQueue((prev) =>
          patchQueueItemById(prev, itemId, {
            status: "failed",
            message,
          })
        );
        toast({
          title: "Redo request failed",
          description: message,
          variant: "destructive",
        });
        return itemId;
      } finally {
        setIsSubmittingEdit(false);
      }
    },
    [
      activeRunId,
      activeSessionId,
      currentArtifactId,
      currentRenderVersion,
      loadSlides,
    ]
  );

  const retryEditQueueItem = useCallback(
    async (itemId: string) => {
      const draft = retryDraftsRef.current.get(itemId);
      if (!draft) {
        toast({
          title: "Retry unavailable",
          description: "No retry payload cached for this queue item.",
          variant: "destructive",
        });
        return;
      }
      await submitSlideEdit(draft.slide, draft.instruction, itemId);
    },
    [submitSlideEdit]
  );

  return {
    slides,
    sessionRuns,
    isLoading,
    isExporting,
    isResuming,
    isSubmittingEdit,
    previewBlockedReason,
    isSessionGenerating,
    isOutlineGenerating,
    outlineSections,
    activeSessionId,
    activeRunId,
    currentArtifactId,
    editQueue,
    supportsImageEditing,
    handleExport,
    handleResume,
    submitSlideEdit,
    retryEditQueueItem,
    loadSlides,
    loadSessionRuns,
  };
}
