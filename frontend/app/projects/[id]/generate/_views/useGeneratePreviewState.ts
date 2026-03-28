import { useCallback, useEffect, useState } from "react";
import { previewApi } from "@/lib/sdk/preview";
import { generateApi } from "@/lib/sdk/generate";
import { ApiError } from "@/lib/sdk/client";
import {
  downloadArtifact,
  getArtifacts,
} from "@/lib/sdk/project-space/artifacts";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/hooks/use-toast";
import type { components } from "@/lib/sdk/types";
import { useShallow } from "zustand/react/shallow";

type Slide = components["schemas"]["Slide"];
type SessionStatePayload = components["schemas"]["SessionStatePayload"];

type SessionStatePayloadWithRun = SessionStatePayload & {
  current_run?: {
    run_id?: string;
  };
};

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
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(
    null
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

  const { events } = useGenerationEvents({
    sessionId: activeSessionId || null,
  });

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const isSessionGenerating =
    latestEvent?.state === "GENERATING_CONTENT" ||
    latestEvent?.state === "RENDERING";

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
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const reason =
          typeof error.details?.reason === "string"
            ? error.details.reason
            : null;
        if (reason === "run_not_ready") {
          setPreviewBlockedReason("当前运行尚未产生可预览内容，请稍候。");
          return;
        }
        toast({
          title: "版本已变化",
          description: "版本变化，请刷新后重试。",
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

  const handleResume = useCallback(async () => {
    if (!activeSessionId || isResuming) return;
    try {
      setIsResuming(true);
      await generateApi.resumeSession(activeSessionId);
      await fetchGenerationHistory(projectId);
      await loadSlides();
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
    loadSlides,
    projectId,
  ]);

  useEffect(() => {
    void loadSlides();
  }, [loadSlides]);

  useEffect(() => {
    if (
      latestEvent?.event_type === "slide.updated" &&
      latestEvent.payload?.slide
    ) {
      const updatedSlide = latestEvent.payload.slide as Slide;
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
    } else if (
      latestEvent?.event_type === "task.completed" ||
      latestEvent?.state === "SUCCESS"
    ) {
      void loadSlides();
    }
  }, [latestEvent, loadSlides]);

  const handleExport = useCallback(async () => {
    if (!activeSessionId || isExporting) return;
    try {
      setIsExporting(true);
      let targetArtifactId = currentArtifactId;
      let targetArtifactType: string | undefined;
      let artifacts: Array<{ id: string; type?: string | null }> = [];

      const ensureArtifacts = async () => {
        if (artifacts.length > 0) return artifacts;
        const artifactsResp = await getArtifacts(projectId, {
          session_id: activeSessionId,
        });
        artifacts = (artifactsResp?.data?.artifacts ?? []).map((item) => ({
          id: item.id,
          type: item.type,
        }));
        return artifacts;
      };

      if (!targetArtifactId) {
        const sessionArtifacts = await ensureArtifacts();
        const pptArtifact =
          sessionArtifacts.find((item) => item.type === "pptx") ??
          sessionArtifacts[0];
        targetArtifactId = pptArtifact?.id ?? null;
        targetArtifactType = pptArtifact?.type ?? undefined;
      } else {
        const sessionArtifacts = await ensureArtifacts();
        const exact = sessionArtifacts.find(
          (item) => item.id === targetArtifactId
        );
        targetArtifactType = exact?.type ?? undefined;
      }

      if (targetArtifactId) {
        const artifactBlob = await downloadArtifact(
          projectId,
          targetArtifactId
        );
        const extension = targetArtifactType === "docx" ? "docx" : "pptx";
        const artifactUrl = URL.createObjectURL(artifactBlob);
        const link = document.createElement("a");
        link.href = artifactUrl;
        link.download = `artifact-${targetArtifactId.slice(0, 8)}.${extension}`;
        link.click();
        URL.revokeObjectURL(artifactUrl);
        return;
      }

      const previewResponse = await previewApi.exportSessionPreview(
        activeSessionId,
        {
          artifact_id: currentArtifactId ?? undefined,
          run_id: activeRunId ?? undefined,
          format: "html",
          include_sources: true,
        }
      );
      const previewContent = previewResponse?.data?.content ?? "";
      if (!previewContent) return;

      const previewBlob = new Blob([previewContent], {
        type: "text/html;charset=utf-8",
      });
      const previewUrl = URL.createObjectURL(previewBlob);
      const link = document.createElement("a");
      link.href = previewUrl;
      link.download = `preview-${activeSessionId.slice(0, 8)}.html`;
      link.click();
      URL.revokeObjectURL(previewUrl);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast({
          title: "版本已变化",
          description: "版本变化，请刷新后重试。",
          variant: "destructive",
        });
        return;
      }
      console.error("Failed to export preview:", error);
    } finally {
      setIsExporting(false);
    }
  }, [activeRunId, activeSessionId, currentArtifactId, isExporting, projectId]);

  const handleRegenerateSlide = useCallback(
    async (slide: Slide) => {
      if (!activeSessionId || regeneratingSlideId) return;
      const slideId = slide.id || `slide-${slide.index}`;
      try {
        setRegeneratingSlideId(slideId);
        await generateApi.regenerateSlide(activeSessionId, slideId, {
          slide_index: slide.index,
          patch: {
            schema_version: 1,
            operations: [],
          },
        });
        await loadSlides();
        toast({
          title: "局部重绘已提交",
          description: `第 ${slide.index} 页已进入重绘队列。`,
        });
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : "局部重绘失败，请稍后重试";
        toast({
          title: "局部重绘失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        setRegeneratingSlideId(null);
      }
    },
    [activeSessionId, loadSlides, regeneratingSlideId]
  );

  return {
    slides,
    isLoading,
    isExporting,
    isResuming,
    regeneratingSlideId,
    previewBlockedReason,
    isSessionGenerating,
    activeSessionId,
    activeRunId,
    handleExport,
    handleResume,
    handleRegenerateSlide,
    loadSlides,
  };
}
