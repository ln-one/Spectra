import { useCallback, useEffect, useState } from "react";
import { previewApi } from "@/lib/sdk/preview";
import { generateApi } from "@/lib/sdk/generate";
import { ApiError } from "@/lib/sdk/client";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/hooks/use-toast";
import type { components } from "@/lib/sdk/types";

type Slide = components["schemas"]["Slide"];

export function useGeneratePreviewState({
  projectId,
  sessionIdFromQuery,
  artifactIdFromQuery,
}: {
  projectId: string;
  sessionIdFromQuery: string | null;
  artifactIdFromQuery: string | null;
}) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [previewBlockedReason, setPreviewBlockedReason] = useState<
    string | null
  >(null);

  const { generationSession, generationHistory, fetchGenerationHistory } =
    useProjectStore();

  const activeSessionId =
    sessionIdFromQuery ||
    generationSession?.session.session_id ||
    (generationHistory.length > 0 ? generationHistory[0].id : null);

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
      });

      if (response.success && response.data.slides) {
        setSlides(response.data.slides.sort((a, b) => a.index - b.index));
        setCurrentArtifactId(response.data.artifact_id ?? null);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast({
          title: "版本已变化",
          description: "版本变化，请刷新后重试。",
          variant: "destructive",
        });
        return;
      }

      if (error instanceof ApiError && error.message.includes("不支持预览")) {
        try {
          const sessionResp = await generateApi.getSession(activeSessionId);
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
  }, [activeSessionId, currentArtifactId]);

  useEffect(() => {
    loadSlides();
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
      loadSlides();
    }
  }, [latestEvent, loadSlides]);

  const handleExport = useCallback(async () => {
    if (!activeSessionId || isExporting) return;
    try {
      setIsExporting(true);
      const response = await previewApi.exportSessionPreview(activeSessionId, {
        artifact_id: currentArtifactId ?? undefined,
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
  }, [activeSessionId, currentArtifactId, isExporting]);

  return {
    slides,
    isLoading,
    isExporting,
    previewBlockedReason,
    isSessionGenerating,
    activeSessionId,
    handleExport,
    loadSlides,
  };
}
