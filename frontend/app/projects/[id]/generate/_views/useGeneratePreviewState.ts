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

type Slide = components["schemas"]["Slide"];
type SessionStatePayload = components["schemas"]["SessionStatePayloadTarget"];
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

type ModifyRetryContext = {
  slide: Slide;
  instruction: string;
};

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
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [regeneratingSlideId, setRegeneratingSlideId] = useState<string | null>(
    null
  );
  const [previewBlockedReason, setPreviewBlockedReason] = useState<
    string | null
  >(null);
  const [isOutlineGenerating, setIsOutlineGenerating] = useState(false);
  const [outlineSections, setOutlineSections] = useState<string[]>([]);

  const processedEventKeysRef = useRef<Set<string>>(new Set());
  const eventsCursorRef = useRef<string | null>(null);
  const pendingModifyRetryRef = useRef<ModifyRetryContext | null>(null);

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
    ((generationSession as SessionStatePayloadWithRun | null)?.current_run
      ?.run_id ??
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
      // keep SSE-only mode when snapshot fetch fails
    }
  }, [activeSessionId]);

  const { events } = useGenerationEvents({
    sessionId: activeSessionId || null,
  });

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const isSessionGenerating =
    latestEvent?.state === "GENERATING_CONTENT" ||
    latestEvent?.state === "RENDERING";

  const handleResume = useCallback(async () => {
    if (!activeSessionId || isResuming) return;
    try {
      setIsResuming(true);
      await generateApi.resumeSession(activeSessionId);
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
    processedEventKeysRef.current.clear();
    eventsCursorRef.current = null;
    pendingModifyRetryRef.current = null;
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
          "未命名章节";
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
        const eventSlideId =
          typeof payload.slide_id === "string" ? payload.slide_id : null;
        if (eventSlideId) {
          setRegeneratingSlideId(eventSlideId);
        }
        continue;
      }
      if (eventType === "slide.modify.failed") {
        setRegeneratingSlideId(null);
        const message =
          typeof payload.error_message === "string"
            ? payload.error_message
            : "单页修改失败";
        toast({
          title: "单页修改失败",
          description: message,
          variant: "destructive",
        });
        continue;
      }
      if (eventType === "slide.updated" && payload.slide) {
        const updatedSlide = payload.slide as Slide;
        setSlides((prev) => {
          const idx = prev.findIndex(
            (s) =>
              (s.id && s.id === updatedSlide.id) || s.index === updatedSlide.index
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

        if (stage === "studio_card_execute") {
          if (artifactId) setCurrentArtifactId(artifactId);
          if (runId) setActiveRunId(runId);

          const failedMessage =
            readStringField(payload, "error_message") ||
            readStringField(payload, "error") ||
            readStringField(payload, "state_reason") ||
            readStringField(payload, "message") ||
            "Studio execution task failed.";

          const runLabel = runId ? `run ${runId}` : "unknown run";
          const cardLabel = cardId ?? "unknown card";
          toast({
            title: "Studio task failed",
            description: `${cardLabel}, ${runLabel}: ${failedMessage}`,
            variant: "destructive",
          });
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
          const artifactType = artifactResponse.data.artifact?.type;
          const downloadExt = inferDownloadExt(artifactType);
          const url = URL.createObjectURL(artifactBlob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `artifact-${currentArtifactId.slice(0, 8)}.${downloadExt}`;
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
  }, [
    activeRunId,
    activeSessionId,
    currentArtifactId,
    isExporting,
    projectId,
  ]);

  const submitModifyRequest = useCallback(
    async (slide: Slide, instruction: string) => {
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
    async (slide: Slide) => {
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
          error instanceof ApiError ? error.message : "单页修改失败，请稍后重试";
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
    isSessionGenerating,
    isOutlineGenerating,
    outlineSections,
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
