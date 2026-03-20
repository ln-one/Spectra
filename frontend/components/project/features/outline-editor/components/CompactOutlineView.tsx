"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DETAIL_LEVELS,
  IMAGE_STYLES,
  containerVariants,
  itemVariants,
  slideCardVariants,
} from "../constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SlideCard } from "../types";

interface CompactOutlineViewProps {
  topic: string;
  slides: SlideCard[];
  activeSlideId: string;
  setActiveSlideId: (id: string) => void;
  isGenerating: boolean;
  isRedrafting: boolean;
  isOutlineHydrating: boolean;
  progress: number;
  progressText: string;
  generationFailed: string | null;
  expectedPages: number;
  outlineIncomplete: boolean;
  detailLevel: "brief" | "standard" | "detailed";
  setDetailLevel: (value: "brief" | "standard" | "detailed") => void;
  imageStyle: string;
  setImageStyle: (value: string) => void;
  totalEstimatedMinutes: number;
  estimatedTokens: number;
  onBack?: () => void;
  onAddSlide: () => void;
  onDeleteSlide: (id: string) => void;
  onStartGeneration: () => void;
  onRedraftOutline: () => void;
  onGoToPreview: () => void;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
}

export function CompactOutlineView({
  topic,
  slides,
  activeSlideId,
  setActiveSlideId,
  isGenerating,
  isRedrafting,
  isOutlineHydrating,
  progress,
  progressText,
  generationFailed,
  expectedPages,
  outlineIncomplete,
  detailLevel,
  setDetailLevel,
  imageStyle,
  setImageStyle,
  totalEstimatedMinutes,
  estimatedTokens,
  onBack,
  onAddSlide,
  onDeleteSlide,
  onStartGeneration,
  onRedraftOutline,
  onGoToPreview,
  scrollAreaRef,
}: CompactOutlineViewProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-3 h-full"
    >
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
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
          onClick={onRedraftOutline}
          disabled={isGenerating || isRedrafting}
          className="h-8 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5 mr-1", isRedrafting && "animate-spin")}
          />
          {isRedrafting ? "生成中..." : "重新生成"}
        </Button>
      </motion.div>

      <motion.div variants={itemVariants} className="flex-1 min-h-0">
        <ScrollArea
          className="h-full pr-2"
          ref={scrollAreaRef as React.RefObject<HTMLDivElement>}
        >
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
                    activeSlideId === slide.id &&
                      "border-l-2 border-l-zinc-700 bg-zinc-100 shadow-sm"
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
                        {slide.keyPoints.length > 2 ? (
                          <span className="text-[10px] text-zinc-400">
                            +{slide.keyPoints.length - 2}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteSlide(slide.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <button
              onClick={onAddSlide}
              disabled={isGenerating || isOutlineHydrating}
              className="w-full p-2.5 rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 transition-all flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              添加幻灯片
            </button>
          </div>
        </ScrollArea>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="space-y-2 pt-2 border-t border-zinc-200/60"
      >
        {isOutlineHydrating ? (
          <p className="text-[11px] text-zinc-500 text-center">
            大纲加载中，请稍候...
          </p>
        ) : null}
        {generationFailed ? (
          <p className="text-[11px] text-red-500 text-center">
            {generationFailed}
          </p>
        ) : null}
        {outlineIncomplete ? (
          <p className="text-[11px] text-zinc-500 text-center">
            大纲生成中：{slides.length}/{expectedPages} 页
          </p>
        ) : null}

        <div className="flex gap-2">
          <ToggleGroup
            type="single"
            value={detailLevel}
            onValueChange={(value) =>
              value &&
              setDetailLevel(value as "brief" | "standard" | "detailed")
            }
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
                <SelectItem
                  key={style.value}
                  value={style.value}
                  className="text-xs"
                >
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
                onClick={onStartGeneration}
                disabled={
                  isOutlineHydrating || outlineIncomplete || isRedrafting
                }
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
                    background:
                      "linear-gradient(90deg, #18181b, #3f3f46, #71717a, #18181b)",
                    backgroundSize: "200% 100%",
                  }}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${progress}%`,
                    backgroundPosition: ["0% 0%", "100% 0%"],
                  }}
                  transition={{
                    width: { duration: 0.4, ease: "easeOut" },
                    backgroundPosition: {
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear",
                    },
                  }}
                />
              </div>
              <p className="text-xs text-zinc-500 text-center">
                {progressText}
              </p>
              <Button
                onClick={onGoToPreview}
                className="w-full h-9 border border-zinc-800 bg-zinc-900 text-zinc-50 text-xs font-medium shadow-sm hover:bg-zinc-800"
              >
                <Play className="w-3.5 h-3.5 mr-1.5" />
                进入实时生成页
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
