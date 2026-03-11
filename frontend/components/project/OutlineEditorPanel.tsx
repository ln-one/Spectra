"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GripVertical,
  Trash2,
  Plus,
  RefreshCw,
  Sparkles,
  ArrowLeft,
  HelpCircle,
  Palette,
  Image,
  Tag,
  X,
  Clock,
  Layers,
  Settings2,
  Play,
  MoreHorizontal,
  Copy,
  Eye,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { components } from "@/lib/types/api";
import { useProjectStore } from "@/stores/projectStore";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";

type OutlineDocument = components["schemas"]["OutlineDocument"];

export interface OutlineEditorConfig {
  detailLevel: "brief" | "standard" | "detailed";
  visualTheme: string;
  imageStyle: string;
  keywords: string[];
}

interface SlideCard {
  id: string;
  order: number;
  title: string;
  keyPoints: string[];
  estimatedMinutes?: number;
}

const VISUAL_THEMES = [
  { id: "tech-blue", name: "科技蓝", color: "#3b82f6", gradient: "from-blue-500 to-cyan-500" },
  { id: "academic", name: "学术极简", color: "#6b7280", gradient: "from-gray-500 to-slate-600" },
  { id: "rainbow", name: "活泼彩虹", color: "#ec4899", gradient: "from-pink-500 to-purple-500" },
  { id: "nature", name: "自然绿", color: "#10b981", gradient: "from-emerald-500 to-teal-500" },
  { id: "sunset", name: "日落橙", color: "#f97316", gradient: "from-orange-500 to-amber-500" },
  { id: "ocean", name: "深海蓝", color: "#0ea5e9", gradient: "from-sky-500 to-blue-600" },
];

const IMAGE_STYLES = [
  { value: "flat", label: "扁平插画", icon: "🎨" },
  { value: "3d", label: "3D 渲染", icon: "🎮" },
  { value: "realistic", label: "写实照片", icon: "📷" },
  { value: "minimal", label: "极简线条", icon: "✏️" },
  { value: "watercolor", label: "水彩风格", icon: "🖼️" },
];

const DETAIL_LEVELS = [
  { value: "brief", label: "简略", desc: "核心要点", icon: "⚡" },
  { value: "standard", label: "标准", desc: "适中展开", icon: "📊" },
  { value: "detailed", label: "详细", desc: "深度讲解", icon: "📚" },
];

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9", description: "??" },
  { value: "4:3", label: "4:3", description: "??" },
  { value: "1:1", label: "1:1", description: "??" },
] as const;

const PROGRESS_STAGES = [
  { progress: 10, text: "正在分析大纲结构...", icon: "🔍" },
  { progress: 25, text: "正在生成幻灯片框架...", icon: "📐" },
  { progress: 40, text: "正在渲染幻灯片内容...", icon: "🎨" },
  { progress: 55, text: "正在优化视觉布局...", icon: "✨" },
  { progress: 70, text: "正在生成配图建议...", icon: "🖼️" },
  { progress: 85, text: "正在进行最终校验...", icon: "✅" },
  { progress: 100, text: "课件生成完成！", icon: "🎉" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as any,
      stiffness: 350,
      damping: 28,
    },
  },
};

const slideCardVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as any, stiffness: 300, damping: 30 },
  },
  exit: {
    opacity: 0,
    x: 16,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

interface OutlineEditorPanelProps {
  variant?: "default" | "compact";
  topic?: string;
  isBootstrapping?: boolean;
  initialOutline?: OutlineDocument;
  onBack?: () => void;
  onConfirm?: (outline: OutlineDocument, config: OutlineEditorConfig) => void;
  onPreview?: () => void;
}

export function OutlineEditorPanel({
  variant = "default",
  topic = "课程大纲",
  isBootstrapping = false,
  onBack,
  onConfirm,
  onPreview,
}: OutlineEditorPanelProps) {
  const { 
    generationSession, 
    updateOutline, 
    confirmOutline 
  } = useProjectStore();
  
  const sessionId = generationSession?.session?.session_id || "";
  const initialNodes = generationSession?.outline?.nodes || [];

  const [slides, setSlides] = useState<SlideCard[]>([]);

  // Initialize slides from generationSession once it's available.
  // Render progressively to provide a "drafting appears one by one" experience.
  useEffect(() => {
    if (initialNodes.length === 0) return;

    const mappedSlides = initialNodes.map((node) => ({
      id: node.id,
      order: node.order,
      title: node.title,
      keyPoints: node.key_points || [],
      estimatedMinutes: node.estimated_minutes,
    }));

    setActiveSlideId(mappedSlides[0].id);
    setSlides([]);

    let cursor = 0;
    const timer = setInterval(() => {
      setSlides((prev) => {
        if (cursor >= mappedSlides.length) return prev;
        const next = [...prev, mappedSlides[cursor]];
        cursor += 1;
        return next;
      });
      if (cursor >= mappedSlides.length) {
        clearInterval(timer);
      }
    }, 180);

    return () => clearInterval(timer);
  }, [initialNodes]);

  const [activeSlideId, setActiveSlideId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [detailLevel, setDetailLevel] = useState<"brief" | "standard" | "detailed">("standard");
  const [visualTheme, setVisualTheme] = useState("tech-blue");
  const [imageStyle, setImageStyle] = useState("flat");
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIO_OPTIONS)[number]["value"]>("16:9");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>(["互动", "动画演示"]);
  const [showSettings, setShowSettings] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // SSE for generation progress
  const { events } = useGenerationEvents({ 
    sessionId: isGenerating ? sessionId : null 
  });
  const latestEvent = events[events.length - 1];

  useEffect(() => {
    if (latestEvent?.event_type === "progress.updated" && latestEvent.progress !== undefined) {
      setProgress(latestEvent.progress * 100);
      setProgressText(latestEvent.state_reason || "正在生成...");
    } else if (latestEvent?.event_type === "task.completed" || latestEvent?.state === "SUCCESS") {
      setProgress(100);
      setProgressText("生成完成！");
    }
  }, [latestEvent]);

  const handleSyncOutline = useCallback(async (currentSlides: SlideCard[]) => {
    if (!sessionId) return;
    const outline: OutlineDocument = {
      version: generationSession?.outline?.version || 1,
      nodes: currentSlides.map((s) => ({
        id: s.id,
        order: s.order,
        title: s.title,
        key_points: s.keyPoints,
        estimated_minutes: s.estimatedMinutes,
      })),
    };
    await updateOutline(sessionId, outline);
  }, [sessionId, generationSession?.outline?.version, updateOutline]);

  const handleAddSlide = useCallback(() => {
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
    handleSyncOutline(newSlides);
    
    setTimeout(() => {
      scrollAreaRef.current?.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 100);
  }, [slides, handleSyncOutline]);

  const handleDeleteSlide = useCallback((id: string) => {
    const newSlides = slides
      .filter((s) => s.id !== id)
      .map((s, index) => ({ ...s, order: index + 1 }));
    setSlides(newSlides);
    handleSyncOutline(newSlides);

    setActiveSlideId((prev) => {
      if (prev === id && newSlides.length > 0) {
        const index = slides.findIndex((s) => s.id === id);
        const newIndex = Math.min(index, newSlides.length - 1);
        return newSlides[newIndex]?.id || "";
      }
      return prev;
    });
  }, [slides, handleSyncOutline]);

  const handleDuplicateSlide = useCallback((slide: SlideCard) => {
    const newSlide: SlideCard = {
      ...slide,
      id: `slide-${Date.now()}`,
      order: slides.length + 1,
      title: `${slide.title} (副本)`,
    };
    const newSlides = [...slides, newSlide];
    setSlides(newSlides);
    setActiveSlideId(newSlide.id);
    handleSyncOutline(newSlides);
  }, [slides, handleSyncOutline]);

  const handleUpdateSlide = useCallback((id: string, updates: Partial<SlideCard>) => {
    const newSlides = slides.map((s) => (s.id === id ? { ...s, ...updates } : s));
    setSlides(newSlides);
    handleSyncOutline(newSlides);
  }, [slides, handleSyncOutline]);

  const handleAddKeyword = useCallback(() => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  }, [keywordInput, keywords]);

  const handleRemoveKeyword = useCallback((keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  }, [keywords]);

  const handleStartGeneration = useCallback(async () => {
    if (!sessionId) return;
    setIsGenerating(true);
    setProgress(5);
    setProgressText("Aspect RatioAspect Ratio??..");

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
    } catch (error) {
      console.error("Failed to confirm outline:", error);
      setIsGenerating(false);
    }
  }, [sessionId, confirmOutline, updateOutline, generationSession?.outline?.version, slides, aspectRatio, detailLevel, imageStyle]);

  const handleGoToPreview = useCallback(() => {
    onPreview?.();
  }, [onPreview]);

  const totalEstimatedMinutes = slides.reduce((sum, s) => sum + (s.estimatedMinutes || 0), 0);
  const estimatedTokens = slides.length * 150 + keywords.length * 20;

  if (variant === "compact") {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-3 h-full"
      >
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-8 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              返回
            </Button>
            <span className="text-xs font-medium text-zinc-500 truncate max-w-[120px]">
              {topic}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            重新生成
          </Button>
        </motion.div>

        <motion.div variants={itemVariants} className="flex-1 min-h-0">
          <ScrollArea className="h-full pr-2" ref={scrollAreaRef}>
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {slides.map((slide, index) => (
                  <motion.div
                    key={slide.id}
                    variants={slideCardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    className={cn(
                      "p-2.5 rounded-xl border transition-all cursor-pointer group",
                      "bg-white/80 border-zinc-200/60 backdrop-blur-sm",
                      "hover:shadow-md hover:-translate-y-0.5 hover:border-zinc-300",
                      activeSlideId === slide.id && "border-l-2 border-l-zinc-700 bg-zinc-100 shadow-sm"
                    )}
                    onClick={() => setActiveSlideId(slide.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-bold text-zinc-400 shrink-0 mt-0.5 w-4">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-700 truncate">
                          {slide.title}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {slide.keyPoints.slice(0, 2).map((point, i) => (
                            <span
                              key={i}
                              className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded"
                            >
                              {point}
                            </span>
                          ))}
                          {slide.keyPoints.length > 2 && (
                            <span className="text-[10px] text-zinc-400">
                              +{slide.keyPoints.length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSlide(slide.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              <button
                onClick={handleAddSlide}
                className="w-full p-2.5 rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 transition-all flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                添加幻灯片
              </button>
            </div>
          </ScrollArea>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-2 pt-2 border-t border-zinc-200/60">
          <div className="flex gap-2">
            <ToggleGroup
              type="single"
              value={detailLevel}
              onValueChange={(v) => v && setDetailLevel(v as "brief" | "standard" | "detailed")}
              className="flex gap-1"
            >
              {DETAIL_LEVELS.map((level) => (
                <ToggleGroupItem
                  key={level.value}
                  value={level.value}
                  className="h-7 px-2.5 text-xs data-[state=on]:bg-zinc-900 data-[state=on]:text-zinc-50 data-[state=on]:border-zinc-800 border border-transparent hover:bg-zinc-100"
                >
                  <span className="mr-1">{level.icon}</span>
                  {level.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <Select value={imageStyle} onValueChange={setImageStyle}>
              <SelectTrigger className="flex-1 h-7 text-xs bg-white/80 border-zinc-200/60 hover:bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white shadow-lg">
                {IMAGE_STYLES.map((style) => (
                  <SelectItem key={style.value} value={style.value} className="text-xs">
                    <span className="mr-1">{style.icon}</span>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AnimatePresence mode="wait">
            {!isGenerating ? (
              <motion.div
                key="start-button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Button
                  onClick={handleStartGeneration}
                  className="w-full h-9 border border-zinc-800 bg-zinc-900 text-zinc-50 text-xs font-medium shadow-sm transition-all hover:bg-zinc-800"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  开始生成
                </Button>
                <p className="text-[10px] text-zinc-400 text-center mt-1.5">
                  预计 {totalEstimatedMinutes} 分钟 · 约 {estimatedTokens} tokens
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="progress-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <div className="relative h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      background: "linear-gradient(90deg, #18181b, #3f3f46, #71717a, #18181b)",
                      backgroundSize: "200% 100%",
                    }}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${progress}%`,
                      backgroundPosition: ["0% 0%", "100% 0%"],
                    }}
                    transition={{
                      width: { duration: 0.4, ease: "easeOut" },
                      backgroundPosition: { duration: 1.5, repeat: Infinity, ease: "linear" },
                    }}
                  />
                </div>
                <p className="text-xs text-zinc-500 text-center">{progressText}</p>
                <Button
                  onClick={handleGoToPreview}
                  className="w-full h-9 border border-zinc-800 bg-zinc-900 text-zinc-50 text-xs font-medium shadow-sm hover:bg-zinc-800"
                >
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  进入预览
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="h-full bg-gradient-to-br from-zinc-50 via-white to-zinc-100 flex flex-col font-sans overflow-hidden">
      <motion.nav
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="h-14 px-4 lg:px-6 flex items-center justify-between w-full border-b border-zinc-200/70 bg-white/90 backdrop-blur-md shrink-0"
      >
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回项目
          </Button>
          <div className="h-4 w-px bg-zinc-200" />
          <span className="text-sm font-medium text-zinc-700">{topic}</span>
          <Badge variant="secondary" className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]">
            {slides.length} 页
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 border-zinc-200"
          >
            <Eye className="w-4 h-4 mr-1.5" />
            预览
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
          >
            <HelpCircle className="w-4 h-4 mr-1.5" />
            帮助
          </Button>
        </div>
      </motion.nav>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="order-2 lg:order-1 flex-1 p-4 lg:p-8 h-full overflow-y-auto min-h-0"
        >
          <motion.div variants={itemVariants} className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-zinc-800">大纲共创</h2>
              <p className="text-sm text-zinc-500 mt-1">
                编辑并确认您的课件结构，AI 将根据此大纲生成内容
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 border-zinc-200"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                重新生成
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100",
                  showSettings && "bg-zinc-100 text-zinc-700"
                )}
              >
                <Settings2 className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>

          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 bg-zinc-50 rounded-2xl border border-zinc-200"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-600 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      内容详细程度
                    </label>
                    <ToggleGroup
                      type="single"
                      value={detailLevel}
                      onValueChange={(v) => v && setDetailLevel(v as "brief" | "standard" | "detailed")}
                      className="flex gap-1"
                    >
                      {DETAIL_LEVELS.map((level) => (
                        <ToggleGroupItem
                          key={level.value}
                          value={level.value}
                          className="flex-1 h-9 text-xs data-[state=on]:bg-zinc-900 data-[state=on]:text-zinc-50 border border-zinc-200 hover:bg-zinc-100"
                        >
                          {level.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-600 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5" />
                      视觉主题
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {VISUAL_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => setVisualTheme(theme.id)}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                            visualTheme === theme.id
                              ? `bg-gradient-to-r ${theme.gradient} text-white border-transparent shadow-md`
                              : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                          )}
                        >
                          {theme.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-600 flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5" />
                      配图风格
                    </label>
                    <Select value={imageStyle} onValueChange={setImageStyle}>
                      <SelectTrigger className="w-full h-9 bg-white border-zinc-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white shadow-lg">
                        {IMAGE_STYLES.map((style) => (
                          <SelectItem key={style.value} value={style.value}>
                            <span className="mr-1.5">{style.icon}</span>
                            {style.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="text-xs font-medium text-zinc-600 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    关键词标签
                  </label>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {keywords.map((keyword) => (
                      <motion.span
                        key={keyword}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-zinc-100 text-zinc-700"
                      >
                        {keyword}
                        <button
                          onClick={() => handleRemoveKeyword(keyword)}
                          className="hover:text-zinc-900"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.span>
                    ))}
                    <div className="flex items-center gap-1">
                      <Input
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                        placeholder="添加关键词..."
                        className="h-7 w-24 text-xs bg-white border-zinc-200"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAddKeyword}
                        className="h-7 px-2 text-xs text-zinc-500 hover:text-zinc-700"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-3">
            {isBootstrapping && slides.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-zinc-200 bg-white/90 p-4 text-sm text-zinc-600 flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4 animate-spin" />
                正在生成大纲，马上进入可编辑状态...
              </motion.div>
            )}
            <AnimatePresence mode="popLayout">
              {slides.map((slide, index) => (
                <motion.div
                  key={slide.id}
                  variants={slideCardVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                  className={cn(
                    "bg-white border rounded-2xl p-5 shadow-sm transition-all duration-200 group",
                    "hover:shadow-lg hover:-translate-y-0.5",
                    activeSlideId === slide.id && "border-l-4 border-l-zinc-700 shadow-md",
                    isGenerating && "opacity-60 pointer-events-none"
                  )}
                  onClick={() => !isGenerating && setActiveSlideId(slide.id)}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <motion.span
                        className="text-xs font-bold text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-lg"
                        whileHover={{ scale: 1.05 }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </motion.span>
                      <button className="cursor-grab text-zinc-300 hover:text-zinc-500 transition-colors">
                        <GripVertical className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex-1 space-y-3 min-w-0">
                      <Input
                        value={slide.title}
                        onChange={(e) => handleUpdateSlide(slide.id, { title: e.target.value })}
                        placeholder="输入幻灯片标题..."
                        className="text-base font-medium border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none"
                        disabled={isGenerating}
                      />

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
                          <Layers className="w-3 h-3" />
                          核心知识点
                        </label>
                        <Textarea
                          value={slide.keyPoints.join("\n")}
                          onChange={(e) =>
                            handleUpdateSlide(slide.id, {
                              keyPoints: e.target.value.split("\n").filter(Boolean),
                            })
                          }
                          placeholder="每行一个知识点..."
                          className="min-h-[80px] text-sm bg-zinc-50/50 border-zinc-200 focus:border-zinc-400 focus:ring-zinc-200"
                          disabled={isGenerating}
                        />
                      </div>

                      <div className="flex items-center gap-4 text-xs text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          预计时长：{slide.estimatedMinutes} 分钟
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {slide.keyPoints.length} 个知识点
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => handleDuplicateSlide(slide)}>
                            <Copy className="w-4 h-4 mr-2" />
                            复制幻灯片
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSlide(slide.id);
                            }}
                            className="text-red-600 focus:text-red-600"
                            disabled={slides.length <= 1}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleAddSlide}
              disabled={isGenerating}
              className="w-full p-4 rounded-2xl border-2 border-dashed border-zinc-200 text-sm text-zinc-400 hover:text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              添加新幻灯片
            </motion.button>
          </div>
        </motion.div>

        <motion.aside
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="order-1 lg:order-2 w-full lg:w-80 max-h-[42vh] lg:max-h-none lg:h-full lg:min-h-0 overflow-y-auto border-b lg:border-b-0 lg:border-l border-zinc-200/70 bg-white/75 backdrop-blur-sm p-4 lg:p-6 flex flex-col gap-4 shrink-0"
        >
          <motion.div variants={itemVariants} className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              生成配置
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5" />
                Aspect Ratio
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {ASPECT_RATIO_OPTIONS.map((ratio) => (
                  <button
                    key={ratio.value}
                    onClick={() => setAspectRatio(ratio.value)}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-xs transition-all",
                      aspectRatio === ratio.value
                        ? "border-zinc-700 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                    )}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500">内容详细程度</label>
              <ToggleGroup
                type="single"
                value={detailLevel}
                onValueChange={(v) => v && setDetailLevel(v as "brief" | "standard" | "detailed")}
                className="flex gap-1"
              >
                {DETAIL_LEVELS.map((level) => (
                  <ToggleGroupItem
                    key={level.value}
                    value={level.value}
                    className="flex-1 h-8 text-xs data-[state=on]:bg-zinc-900 data-[state=on]:text-zinc-50 border border-zinc-200"
                  >
                    {level.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500">视觉主题</label>
              <div className="grid grid-cols-2 gap-1.5">
                {VISUAL_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setVisualTheme(theme.id)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-xs font-medium transition-all border",
                      visualTheme === theme.id
                        ? `bg-gradient-to-r ${theme.gradient} text-white border-transparent shadow-md`
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                    )}
                  >
                    {theme.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500">配图风格</label>
              <Select value={imageStyle} onValueChange={setImageStyle}>
                <SelectTrigger className="w-full h-9 bg-white border-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-lg">
                  {IMAGE_STYLES.map((style) => (
                    <SelectItem key={style.value} value={style.value}>
                      <span className="mr-1.5">{style.icon}</span>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
              <Tag className="w-3 h-3" />
              关键词标签
            </label>
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((keyword) => (
                <motion.span
                  key={keyword}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-zinc-100 text-zinc-700"
                >
                  {keyword}
                  <button
                    onClick={() => handleRemoveKeyword(keyword)}
                    className="hover:text-zinc-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                placeholder="添加关键词..."
                className="h-8 text-xs bg-white border-zinc-200"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddKeyword}
                className="h-8 px-3 text-xs"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="space-y-3 pt-4 border-t border-zinc-200/60">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                预计时长
              </span>
              <span className="font-medium text-zinc-700">{totalEstimatedMinutes} 分钟</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                幻灯片数量
              </span>
              <span className="font-medium text-zinc-700">{slides.length} 页</span>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Monitor className="w-3 h-3" />
                Aspect Ratio
              </span>
              <span className="font-medium text-zinc-700">{aspectRatio}</span>
            </div>

            <AnimatePresence mode="wait">
              {!isGenerating ? (
                <motion.div
                  key="start-button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-2"
                >
                  <Button
                    onClick={handleStartGeneration}
                    className="w-full h-11 border border-zinc-800 bg-zinc-900 text-zinc-50 text-sm font-medium shadow-sm transition-all hover:bg-zinc-800"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    开始生成课件
                  </Button>
                  <p className="text-[10px] text-zinc-400 text-center">
                    预计消耗约 {estimatedTokens} tokens
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="progress-section"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  <div className="relative h-3 bg-zinc-100 rounded-full overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        background: "linear-gradient(90deg, #18181b, #3f3f46, #71717a, #18181b)",
                        backgroundSize: "200% 100%",
                      }}
                      initial={{ width: 0 }}
                      animate={{
                        width: `${progress}%`,
                        backgroundPosition: ["0% 0%", "100% 0%"],
                      }}
                      transition={{
                        width: { duration: 0.4, ease: "easeOut" },
                        backgroundPosition: { duration: 1.5, repeat: Infinity, ease: "linear" },
                      }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 text-center">{progressText}</p>
                  <Button
                    onClick={handleGoToPreview}
                    className="w-full h-11 border border-zinc-800 bg-zinc-900 text-zinc-50 text-sm font-medium shadow-sm hover:bg-zinc-800"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    进入动态预览
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.aside>
      </div>
    </div>
  );
}
