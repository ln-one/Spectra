import { useCallback, useEffect, useState } from "react";
import { previewApi } from "@/lib/sdk/preview";
import { generateApi } from "@/lib/sdk/generate";
import { projectSpaceApi } from "@/lib/sdk/project-space";
import { ApiError } from "@/lib/sdk/client";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/hooks/use-toast";
import type { components } from "@/lib/sdk/types";
import { useShallow } from "zustand/react/shallow";

type Slide = components["schemas"]["Slide"];
type SessionStatePayload = components["schemas"]["SessionStatePayload"];
type ArtifactType = components["schemas"]["Artifact"]["type"];

type SessionStatePayloadWithRun = SessionStatePayload & {
  current_run?: {
    run_id?: string;
  };
};

function inferDownloadExt(artifactType: ArtifactType | undefined): string {
  if (!artifactType) return "bin";
  switch (artifactType) {
    case "pptx":
      return "pptx";
    case "docx":
      return "docx";
    case "pdf":
      return "pdf";
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
        setCurrentRenderVersion(response.data.render_version ?? null);
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
          description: "版本变化，请刷新后重试。",
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

  const handleRegenerateSlide = useCallback(
    async (slide: Slide) => {
      if (!activeSessionId || regeneratingSlideId) return;
      const slideId = slide.id || `slide-${slide.index}`;
      const instruction = window.prompt("请输入该页的修改要求");
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
        setRegeneratingSlideId(slideId);
        const requestBody = {
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
        } as unknown as components["schemas"]["ModifySessionRequest"];
        await previewApi.modifySessionPreview(activeSessionId, requestBody);
        await loadSlides();
        toast({
          title: "单页修改已提交",
          description: `第 ${slide.index + 1} 页已进入修改队列。`,
        });
      } catch (error) {
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
    [
      activeRunId,
      activeSessionId,
      currentArtifactId,
      currentRenderVersion,
      loadSlides,
      regeneratingSlideId,
    ]
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
