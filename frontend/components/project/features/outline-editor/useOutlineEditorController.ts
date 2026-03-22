"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { ASPECT_RATIO_OPTIONS } from "./constants";
import type { OutlineEditorPanelProps, SlideCard } from "./types";

export function useOutlineEditorController({
  topic = "课程大纲",
  isBootstrapping = false,
  onPreview,
}: OutlineEditorPanelProps) {
  const { generationSession, updateOutline, redraftOutline, confirmOutline } =
    useProjectStore(
      useShallow((state) => ({
        generationSession: state.generationSession,
        updateOutline: state.updateOutline,
        redraftOutline: state.redraftOutline,
        confirmOutline: state.confirmOutline,
      }))
    );

  const sessionId = generationSession?.session?.session_id || "";
  const initialNodes = useMemo(
    () => generationSession?.outline?.nodes || [],
    [generationSession?.outline?.nodes]
  );
  const expectedPages = Number(generationSession?.options?.pages || 0);
  const sessionState = generationSession?.session?.state || "";

  const [slides, setSlides] = useState<SlideCard[]>([]);
  const [isOutlineHydrating, setIsOutlineHydrating] = useState(false);
  const [activeSlideId, setActiveSlideId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRedrafting, setIsRedrafting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [generationFailed, setGenerationFailed] = useState<string | null>(null);
  const [detailLevel, setDetailLevel] = useState<
    "brief" | "standard" | "detailed"
  >("standard");
  const [visualTheme, setVisualTheme] = useState("tech-blue");
  const [imageStyle, setImageStyle] = useState("flat");
  const [aspectRatio, setAspectRatio] =
    useState<(typeof ASPECT_RATIO_OPTIONS)[number]["value"]>("16:9");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>(["互动", "动画演示"]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }),
    []
  );

  useEffect(() => {
    let frame = 0;

    if (!sessionId) {
      frame = requestAnimationFrame(() => {
        setSlides([]);
        setIsOutlineHydrating(isBootstrapping);
        setActiveSlideId("");
      });
      return () => cancelAnimationFrame(frame);
    }

    const ready = expectedPages <= 0 || initialNodes.length >= expectedPages;
    if (initialNodes.length === 0) {
      frame = requestAnimationFrame(() => {
        setIsOutlineHydrating(!ready);
        setSlides([]);
        setActiveSlideId("");
      });
      return () => cancelAnimationFrame(frame);
    }

    const mappedSlides = initialNodes.map((node) => ({
      id: node.id,
      order: node.order,
      title: node.title,
      keyPoints: node.key_points || [],
      estimatedMinutes: node.estimated_minutes,
    }));

    frame = requestAnimationFrame(() => {
      setIsOutlineHydrating(!ready);
      setActiveSlideId((prev) =>
        prev && mappedSlides.some((slide) => slide.id === prev)
          ? prev
          : mappedSlides[0]?.id || ""
      );
      setSlides(mappedSlides);
    });

    return () => cancelAnimationFrame(frame);
  }, [expectedPages, initialNodes, isBootstrapping, sessionId]);

  const handleAddSlide = useCallback(() => {
    if (isGenerating || isOutlineHydrating || isBootstrapping || !sessionId)
      return;
    const newSlide: SlideCard = {
      id: `slide-${Date.now()}`,
      order: slides.length + 1,
      title: `第 ${slides.length + 1} 页幻灯片`,
      keyPoints: ["要点一", "要点二"],
      estimatedMinutes: 5,
    };
    const newSlides = [...slides, newSlide];
    setSlides(newSlides);
    setActiveSlideId(newSlide.id);

    setTimeout(() => {
      scrollAreaRef.current?.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 100);
  }, [isBootstrapping, isGenerating, isOutlineHydrating, sessionId, slides]);

  const handleDeleteSlide = useCallback(
    (id: string) => {
      if (isGenerating || isOutlineHydrating || isBootstrapping || !sessionId)
        return;
      const newSlides = slides
        .filter((s) => s.id !== id)
        .map((s, index) => ({ ...s, order: index + 1 }));
      setSlides(newSlides);

      setActiveSlideId((prev) => {
        if (prev === id && newSlides.length > 0) {
          const index = slides.findIndex((s) => s.id === id);
          const newIndex = Math.min(index, newSlides.length - 1);
          return newSlides[newIndex]?.id || "";
        }
        return prev;
      });
    },
    [isBootstrapping, isGenerating, isOutlineHydrating, sessionId, slides]
  );

  const handleDuplicateSlide = useCallback(
    (slide: SlideCard) => {
      if (isGenerating || isOutlineHydrating || isBootstrapping || !sessionId)
        return;
      const newSlide: SlideCard = {
        ...slide,
        id: `slide-${Date.now()}`,
        order: slides.length + 1,
        title: `${slide.title} (副本)`,
      };
      setSlides([...slides, newSlide]);
      setActiveSlideId(newSlide.id);
    },
    [isBootstrapping, isGenerating, isOutlineHydrating, sessionId, slides]
  );

  const handleUpdateSlide = useCallback(
    (id: string, updates: Partial<SlideCard>) => {
      if (isGenerating || isOutlineHydrating || isBootstrapping || !sessionId)
        return;
      setSlides(slides.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    },
    [isBootstrapping, isGenerating, isOutlineHydrating, sessionId, slides]
  );

  const handleAddKeyword = useCallback(() => {
    const nextKeyword = keywordInput.trim();
    if (nextKeyword && !keywords.includes(nextKeyword)) {
      setKeywords([...keywords, nextKeyword]);
      setKeywordInput("");
    }
  }, [keywordInput, keywords]);

  const handleRemoveKeyword = useCallback(
    (keyword: string) => setKeywords(keywords.filter((k) => k !== keyword)),
    [keywords]
  );

  const handleStartGeneration = async () => {
    if (!sessionId) return;

    if (["GENERATING_CONTENT", "RENDERING", "SUCCESS"].includes(sessionState)) {
      onPreview?.();
      return;
    }

    if (isBootstrapping || isOutlineHydrating || slides.length === 0) {
      setGenerationFailed("大纲仍在加载，请稍后再试");
      return;
    }

    if (expectedPages > 0 && slides.length < expectedPages) {
      setGenerationFailed(
        `大纲尚未生成完成：${slides.length}/${expectedPages} 页`
      );
      return;
    }

    setIsGenerating(true);
    setProgress(5);
    setProgressText("正在创建生成任务...");
    setGenerationFailed(null);

    try {
      await updateOutline(sessionId, {
        version: generationSession?.outline?.version || 1,
        nodes: slides.map((s) => ({
          id: s.id,
          order: s.order,
          title: s.title,
          key_points: s.keyPoints,
          estimated_minutes: s.estimatedMinutes,
        })),
        summary: `aspect_ratio=${aspectRatio}; detail_level=${detailLevel}; image_style=${imageStyle}`,
      });
      await confirmOutline(sessionId);
      setProgress(15);
      setProgressText("任务已启动，可进入生成页查看实时进度");
      setIsGenerating(false);
      onPreview?.();
    } catch (error) {
      console.error("Failed to confirm outline:", error);
      setIsGenerating(false);
      const message =
        error instanceof Error ? error.message : "启动生成失败，请稍后重试";
      const lower = message.toLowerCase();
      if (
        message.includes("执行中的任务") ||
        lower.includes("running task") ||
        lower.includes("already")
      ) {
        setGenerationFailed("当前会话已有进行中的生成任务，正在进入实时生成页");
        onPreview?.();
        return;
      }
      setGenerationFailed(message);
    }
  };

  const handleRedraftOutline = useCallback(async () => {
    if (!sessionId || isGenerating || isRedrafting || isBootstrapping) return;

    const previousVersion = Number(generationSession?.outline?.version || 0);
    const instruction = `请按当前主题“${topic}”重新生成大纲，保持结构完整，强调知识地图、关键例题、易错点澄清、课堂互动提问和板书逻辑。目标页数：${expectedPages || slides.length || 12} 页。`;

    setIsRedrafting(true);
    setGenerationFailed(null);
    try {
      await redraftOutline(sessionId, instruction);

      const maxAttempts = 40;
      const intervalMs = 1500;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const sessionResponse = await generateApi.getSession(sessionId);
        const latest = sessionResponse?.data ?? null;
        useProjectStore.setState({ generationSession: latest });
        const state = latest?.session?.state;
        const outlineVersion = Number(latest?.outline?.version || 0);
        const nodes = latest?.outline?.nodes || [];

        if (
          state === "AWAITING_OUTLINE_CONFIRM" &&
          outlineVersion > previousVersion &&
          nodes.length > 0
        ) {
          toast({
            title: "大纲已重新生成",
            description: `已更新到 v${outlineVersion}`,
          });
          return;
        }
        if (state === "FAILED") {
          throw new Error(latest?.session?.state_reason || "大纲重生成失败");
        }
        await wait(intervalMs);
      }
      throw new Error("大纲重生成超时，请稍后重试");
    } catch (error) {
      const message = getErrorMessage(error);
      setGenerationFailed(message);
      toast({
        title: "重新生成大纲失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRedrafting(false);
    }
  }, [
    expectedPages,
    generationSession?.outline?.version,
    isGenerating,
    isRedrafting,
    isBootstrapping,
    redraftOutline,
    sessionId,
    slides.length,
    topic,
    wait,
  ]);

  const handleHelp = useCallback(() => {
    toast({
      title: "大纲编辑提示",
      description:
        "每页建议包含知识地图、关键例题与易错点；确认后再进入实时生成页。",
    });
  }, []);

  const totalEstimatedMinutes = slides.reduce(
    (sum, slide) => sum + (slide.estimatedMinutes || 0),
    0
  );
  const estimatedTokens = slides.length * 150 + keywords.length * 20;
  const outlineIncomplete = expectedPages > 0 && slides.length < expectedPages;

  return {
    topic,
    isBootstrapping,
    slides,
    activeSlideId,
    setActiveSlideId,
    isOutlineHydrating,
    isGenerating,
    isRedrafting,
    progress,
    progressText,
    generationFailed,
    detailLevel,
    setDetailLevel,
    visualTheme,
    setVisualTheme,
    imageStyle,
    setImageStyle,
    aspectRatio,
    setAspectRatio,
    keywordInput,
    setKeywordInput,
    keywords,
    scrollAreaRef,
    handleAddSlide,
    handleDeleteSlide,
    handleDuplicateSlide,
    handleUpdateSlide,
    handleAddKeyword,
    handleRemoveKeyword,
    handleStartGeneration,
    handleRedraftOutline,
    handleHelp,
    handleGoToPreview: () => onPreview?.(),
    totalEstimatedMinutes,
    estimatedTokens,
    outlineIncomplete,
    expectedPages,
  };
}
