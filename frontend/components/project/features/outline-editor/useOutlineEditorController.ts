"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { ASPECT_RATIO_OPTIONS } from "./constants";
import type { OutlineEditorPanelProps, SlideCard } from "./types";

export function useOutlineEditorController({
  topic = "课程大纲",
  isBootstrapping = false,
  onPreview,
}: OutlineEditorPanelProps) {
  const { generationSession, updateOutline, confirmOutline } =
    useProjectStore();

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
  const [showSettings, setShowSettings] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;

    if (!sessionId) {
      frame = requestAnimationFrame(() => {
        setSlides([]);
        setIsOutlineHydrating(false);
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
  }, [expectedPages, initialNodes, sessionId]);

  const handleAddSlide = useCallback(() => {
    if (isGenerating || isOutlineHydrating) return;
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
  }, [isGenerating, isOutlineHydrating, slides]);

  const handleDeleteSlide = useCallback(
    (id: string) => {
      if (isGenerating || isOutlineHydrating) return;
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
    [isGenerating, isOutlineHydrating, slides]
  );

  const handleDuplicateSlide = useCallback(
    (slide: SlideCard) => {
      if (isGenerating || isOutlineHydrating) return;
      const newSlide: SlideCard = {
        ...slide,
        id: `slide-${Date.now()}`,
        order: slides.length + 1,
        title: `${slide.title} (副本)`,
      };
      setSlides([...slides, newSlide]);
      setActiveSlideId(newSlide.id);
    },
    [isGenerating, isOutlineHydrating, slides]
  );

  const handleUpdateSlide = useCallback(
    (id: string, updates: Partial<SlideCard>) => {
      if (isGenerating || isOutlineHydrating) return;
      setSlides(slides.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    },
    [isGenerating, isOutlineHydrating, slides]
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

    if (isOutlineHydrating || slides.length === 0) {
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
    showSettings,
    setShowSettings,
    scrollAreaRef,
    handleAddSlide,
    handleDeleteSlide,
    handleDuplicateSlide,
    handleUpdateSlide,
    handleAddKeyword,
    handleRemoveKeyword,
    handleStartGeneration,
    handleGoToPreview: () => onPreview?.(),
    totalEstimatedMinutes,
    estimatedTokens,
    outlineIncomplete,
    expectedPages,
  };
}
