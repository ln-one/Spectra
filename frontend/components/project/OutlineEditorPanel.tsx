"use client";

import { useState, useCallback } from "react";
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
import type { OutlineDocument } from "@/lib/types/api";

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
  { id: "tech-blue", name: "科技蓝", color: "#3b82f6" },
  { id: "academic", name: "学术极简", color: "#6b7280" },
  { id: "rainbow", name: "活泼彩虹", color: "#ec4899" },
  { id: "nature", name: "自然绿", color: "#10b981" },
];

const IMAGE_STYLES = [
  { value: "flat", label: "扁平插画" },
  { value: "3d", label: "3D 渲染" },
  { value: "realistic", label: "写实照片" },
  { value: "minimal", label: "极简线条" },
];

const PROGRESS_STAGES = [
  { progress: 15, text: "正在分析大纲结构..." },
  { progress: 30, text: "正在生成幻灯片框架..." },
  { progress: 45, text: "正在渲染幻灯片内容..." },
  { progress: 60, text: "正在优化视觉布局..." },
  { progress: 75, text: "正在生成配图建议..." },
  { progress: 90, text: "正在进行最终校验..." },
  { progress: 100, text: "课件生成完成！" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    },
  },
};

const slideCardVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring",
      stiffness: 280,
      damping: 24,
    },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.2 },
  },
};

interface OutlineEditorPanelProps {
  variant?: "default" | "compact";
  topic?: string;
  initialOutline?: OutlineDocument;
  onBack?: () => void;
  onConfirm?: (outline: OutlineDocument, config: OutlineEditorConfig) => void;
  onPreview?: () => void;
}

export function OutlineEditorPanel({
  variant = "default",
  topic = "高中物理：牛顿第一定律",
  initialOutline,
  onBack,
  onConfirm,
  onPreview,
}: OutlineEditorPanelProps) {
  const [slides, setSlides] = useState<SlideCard[]>(
    initialOutline?.nodes?.map((node) => ({
      id: node.id,
      order: node.order,
      title: node.title,
      keyPoints: node.key_points || [],
      estimatedMinutes: node.estimated_minutes,
    })) || [
      {
        id: "slide-1",
        order: 1,
        title: "课程导入：运动的物体为什么会停止？",
        keyPoints: ["生活实例引入", "提出思考问题", "激发学习兴趣"],
        estimatedMinutes: 5,
      },
      {
        id: "slide-2",
        order: 2,
        title: "牛顿第一定律的历史背景",
        keyPoints: ["亚里士多德的观点", "伽利略的理想实验", "牛顿的总结与推广"],
        estimatedMinutes: 8,
      },
      {
        id: "slide-3",
        order: 3,
        title: "惯性概念的建立",
        keyPoints: ["惯性的定义", "质量与惯性的关系", "生活中的惯性现象"],
        estimatedMinutes: 10,
      },
      {
        id: "slide-4",
        order: 4,
        title: "实验探究：验证牛顿第一定律",
        keyPoints: ["实验设计思路", "控制变量法", "数据分析与结论"],
        estimatedMinutes: 12,
      },
      {
        id: "slide-5",
        order: 5,
        title: "课堂小结与练习",
        keyPoints: ["知识要点回顾", "典型例题讲解", "课后思考题"],
        estimatedMinutes: 5,
      },
    ]
  );

  const [activeSlideId, setActiveSlideId] = useState<string>(slides[0]?.id || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [detailLevel, setDetailLevel] = useState<"brief" | "standard" | "detailed">("standard");
  const [visualTheme, setVisualTheme] = useState("tech-blue");
  const [imageStyle, setImageStyle] = useState("flat");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>(["互动", "动画演示"]);

  const handleAddSlide = () => {
    const newSlide: SlideCard = {
      id: `slide-${Date.now()}`,
      order: slides.length + 1,
      title: `第 ${slides.length + 1} 页幻灯片`,
      keyPoints: ["要点一", "要点二"],
      estimatedMinutes: 5,
    };
    setSlides([...slides, newSlide]);
    setActiveSlideId(newSlide.id);
  };

  const handleDeleteSlide = (id: string) => {
    const newSlides = slides
      .filter((s) => s.id !== id)
      .map((s, index) => ({ ...s, order: index + 1 }));
    setSlides(newSlides);
    if (activeSlideId === id && newSlides.length > 0) {
      setActiveSlideId(newSlides[0].id);
    }
  };

  const handleUpdateSlide = (id: string, updates: Partial<SlideCard>) => {
    setSlides(
      slides.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleStartGeneration = useCallback(() => {
    setIsGenerating(true);
    setProgress(0);
    setProgressText(PROGRESS_STAGES[0].text);

    let currentStage = 0;
    const interval = setInterval(() => {
      if (currentStage < PROGRESS_STAGES.length - 1) {
        currentStage++;
        setProgress(PROGRESS_STAGES[currentStage].progress);
        setProgressText(PROGRESS_STAGES[currentStage].text);
      } else {
        clearInterval(interval);
      }
    }, 1500);

    const outline: OutlineDocument = {
      version: 1,
      nodes: slides.map((slide) => ({
        id: slide.id,
        order: slide.order,
        title: slide.title,
        key_points: slide.keyPoints,
        estimated_minutes: slide.estimatedMinutes,
      })),
    };

    const config: OutlineEditorConfig = {
      detailLevel,
      visualTheme,
      imageStyle,
      keywords,
    };

    onConfirm?.(outline, config);
  }, [slides, detailLevel, visualTheme, imageStyle, keywords, onConfirm]);

  const handleGoToPreview = () => {
    onPreview?.();
  };

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
              className="h-7 text-zinc-500 hover:text-zinc-700"
            >
              <ArrowLeft className="w-3 h-3 mr-1" />
              返回
            </Button>
            <span className="text-[10px] font-medium text-zinc-500 truncate max-w-[120px]">
              {topic}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] text-zinc-500 hover:text-zinc-700"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            重新生成
          </Button>
        </motion.div>

        <motion.div variants={itemVariants} className="flex-1 min-h-0">
          <ScrollArea className="h-full pr-2">
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
                      "p-2.5 rounded-lg border transition-all cursor-pointer",
                      "bg-white/80 border-zinc-200/60",
                      "hover:shadow-sm hover:-translate-y-0.5",
                      activeSlideId === slide.id && "border-l-2 border-l-purple-500 bg-purple-50/50"
                    )}
                    onClick={() => setActiveSlideId(slide.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[9px] font-medium text-zinc-400 shrink-0 mt-0.5">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium text-zinc-700 truncate">
                          {slide.title}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {slide.keyPoints.slice(0, 2).map((point, i) => (
                            <span
                              key={i}
                              className="text-[8px] text-zinc-400 bg-zinc-100 px-1 rounded"
                            >
                              {point}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              <button
                onClick={handleAddSlide}
                className="w-full p-2 rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" />
                添加幻灯片
              </button>
            </div>
          </ScrollArea>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-2 pt-2 border-t border-zinc-200/60">
          <div className="flex gap-1.5">
            <ToggleGroup
              type="single"
              value={detailLevel}
              onValueChange={(v) => v && setDetailLevel(v as "brief" | "standard" | "detailed")}
              className="flex gap-1"
            >
              <ToggleGroupItem
                value="brief"
                className="h-6 px-2 text-[9px] data-[state=on]:bg-purple-100 data-[state=on]:text-purple-700"
              >
                简略
              </ToggleGroupItem>
              <ToggleGroupItem
                value="standard"
                className="h-6 px-2 text-[9px] data-[state=on]:bg-purple-100 data-[state=on]:text-purple-700"
              >
                标准
              </ToggleGroupItem>
              <ToggleGroupItem
                value="detailed"
                className="h-6 px-2 text-[9px] data-[state=on]:bg-purple-100 data-[state=on]:text-purple-700"
              >
                详细
              </ToggleGroupItem>
            </ToggleGroup>

            <Select value={imageStyle} onValueChange={setImageStyle}>
              <SelectTrigger className="flex-1 h-6 text-[9px] bg-white/80 border-zinc-200/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {IMAGE_STYLES.map((style) => (
                  <SelectItem key={style.value} value={style.value} className="text-[9px]">
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
                  className="w-full h-8 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 text-white text-[10px]"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  开始折射
                </Button>
                <p className="text-[8px] text-zinc-400 text-center mt-1">
                  预计消耗约 {estimatedTokens} tokens
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
                      background: "linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #6366f1)",
                      backgroundSize: "200% 100%",
                    }}
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${progress}%`,
                      backgroundPosition: ["0% 0%", "100% 0%"],
                    }}
                    transition={{
                      width: { duration: 0.5, ease: "easeOut" },
                      backgroundPosition: { duration: 2, repeat: Infinity, ease: "linear" },
                    }}
                  />
                </div>
                <p className="text-[9px] text-zinc-500 text-center">{progressText}</p>
                <Button
                  onClick={handleGoToPreview}
                  className="w-full h-8 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 text-white text-[10px] animate-pulse"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  进入动态预览
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col font-sans">
      <nav className="h-14 px-6 flex items-center justify-between w-full border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回项目
          </Button>
          <div className="h-4 w-px bg-border" />
          <span className="text-sm font-medium text-foreground">{topic}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="w-4 h-4 mr-2" />
          帮助与反馈
        </Button>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex-1 p-6 lg:p-8 overflow-y-auto"
        >
          <motion.div variants={itemVariants} className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">大纲共创</h2>
              <p className="text-sm text-muted-foreground mt-1">
                编辑并确认您的课件结构
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              重新生成大纲
            </Button>
          </motion.div>

          <div className="space-y-4">
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
                    "bg-card border rounded-xl p-5 shadow-sm transition-all duration-200",
                    "hover:shadow-md hover:-translate-y-0.5",
                    activeSlideId === slide.id && "border-l-4 border-l-purple-500",
                    isGenerating && "opacity-60 pointer-events-none"
                  )}
                  onClick={() => !isGenerating && setActiveSlideId(slide.id)}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <button className="cursor-grab text-muted-foreground hover:text-foreground">
                        <GripVertical className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex-1 space-y-3">
                      <Input
                        value={slide.title}
                        onChange={(e) =>
                          handleUpdateSlide(slide.id, { title: e.target.value })
                        }
                        placeholder="输入幻灯片标题..."
                        className="text-base font-medium border-0 bg-transparent p-0 focus-visible:ring-0"
                        disabled={isGenerating}
                      />

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
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
                          className="min-h-[80px] text-sm"
                          disabled={isGenerating}
                        />
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>预计时长：{slide.estimatedMinutes} 分钟</span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSlide(slide.id);
                      }}
                      disabled={isGenerating || slides.length <= 1}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {!isGenerating && (
              <motion.button
                variants={itemVariants}
                onClick={handleAddSlide}
                className="w-full p-4 rounded-xl border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                添加幻灯片页面
              </motion.button>
            )}
          </div>
        </motion.div>

        <motion.aside
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className={cn(
            "w-[360px] lg:w-[400px] bg-card border-l h-full p-6 flex flex-col sticky top-14 shadow-xl",
            isGenerating && "opacity-90"
          )}
        >
          <motion.div variants={itemVariants} className="space-y-6 flex-1">
            <div className={cn(isGenerating && "opacity-50 pointer-events-none")}>
              <label className="text-sm font-medium text-foreground mb-3 block flex items-center gap-2">
                <span className="w-1 h-4 bg-purple-500 rounded-full" />
                文本详略度
              </label>
              <ToggleGroup
                type="single"
                value={detailLevel}
                onValueChange={(v) =>
                  v && setDetailLevel(v as "brief" | "standard" | "detailed")
                }
                className="justify-start gap-2"
              >
                <ToggleGroupItem
                  value="brief"
                  className="px-4 data-[state=on]:bg-purple-100 data-[state=on]:text-purple-700"
                >
                  简略
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="standard"
                  className="px-4 data-[state=on]:bg-purple-100 data-[state=on]:text-purple-700"
                >
                  标准
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="detailed"
                  className="px-4 data-[state=on]:bg-purple-100 data-[state=on]:text-purple-700"
                >
                  详细
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className={cn(isGenerating && "opacity-50 pointer-events-none")}>
              <label className="text-sm font-medium text-foreground mb-3 block flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-500" />
                视觉主题
              </label>
              <div className="grid grid-cols-4 gap-2">
                {VISUAL_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setVisualTheme(theme.id)}
                    className={cn(
                      "p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2",
                      visualTheme === theme.id
                        ? "border-purple-500 bg-purple-50"
                        : "border-transparent bg-muted hover:border-muted-foreground/30"
                    )}
                  >
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: theme.color }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {theme.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className={cn(isGenerating && "opacity-50 pointer-events-none")}>
              <label className="text-sm font-medium text-foreground mb-3 block flex items-center gap-2">
                <Image className="w-4 h-4 text-purple-500" />
                AI 图像风格
              </label>
              <Select value={imageStyle} onValueChange={setImageStyle}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_STYLES.map((style) => (
                    <SelectItem key={style.value} value={style.value}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={cn(isGenerating && "opacity-50 pointer-events-none")}>
              <label className="text-sm font-medium text-foreground mb-3 block flex items-center gap-2">
                <Tag className="w-4 h-4 text-purple-500" />
                额外关键词
              </label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                  placeholder="输入关键词后回车..."
                  className="flex-1"
                />
                <Button onClick={handleAddKeyword} variant="outline" size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-xs"
                  >
                    {keyword}
                    <button
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="hover:text-purple-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="pt-6 border-t mt-6 space-y-4"
          >
            <AnimatePresence mode="wait">
              {!isGenerating ? (
                <motion.div
                  key="start-section"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>预计字数</span>
                    <span>{slides.length * 200} 字</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>预计 Token 消耗</span>
                    <span>{estimatedTokens}</span>
                  </div>
                  <Button
                    onClick={handleStartGeneration}
                    className="w-full h-11 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 text-white font-medium transition-transform hover:scale-[1.02]"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    开始折射
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="progress-section"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">生成进度</span>
                      <span className="font-medium text-foreground">{progress}%</span>
                    </div>
                    <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          background: "linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #6366f1)",
                          backgroundSize: "200% 100%",
                        }}
                        initial={{ width: 0 }}
                        animate={{
                          width: `${progress}%`,
                          backgroundPosition: ["0% 0%", "100% 0%"],
                        }}
                        transition={{
                          width: { duration: 0.5, ease: "easeOut" },
                          backgroundPosition: { duration: 2, repeat: Infinity, ease: "linear" },
                        }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                      {progressText}
                    </p>
                  </div>

                  <Button
                    onClick={handleGoToPreview}
                    className="w-full h-11 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 text-white font-medium ring-4 ring-purple-500/50 animate-pulse"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
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
