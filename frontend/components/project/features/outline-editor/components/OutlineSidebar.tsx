"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Clock,
  Layers,
  Monitor,
  Play,
  Settings2,
  Tag,
  X,
} from "lucide-react";
import { ThinkingMark } from "@/components/icons/status/ThinkingMark";
import { cn } from "@/lib/utils";
import {
  ASPECT_RATIO_OPTIONS,
  DETAIL_LEVELS,
  IMAGE_STYLES,
  itemVariants,
  VISUAL_THEMES,
} from "../constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface OutlineSidebarProps {
  slidesCount: number;
  expectedPages: number;
  outlineIncomplete: boolean;
  isOutlineHydrating: boolean;
  generationFailed: string | null;
  totalEstimatedMinutes: number;
  estimatedTokens: number;
  isGenerating: boolean;
  isRedrafting: boolean;
  progress: number;
  progressText: string;
  aspectRatio: (typeof ASPECT_RATIO_OPTIONS)[number]["value"];
  setAspectRatio: (
    value: (typeof ASPECT_RATIO_OPTIONS)[number]["value"]
  ) => void;
  detailLevel: "brief" | "standard" | "detailed";
  setDetailLevel: (value: "brief" | "standard" | "detailed") => void;
  visualTheme: string;
  setVisualTheme: (value: string) => void;
  imageStyle: string;
  setImageStyle: (value: string) => void;
  keywords: string[];
  keywordInput: string;
  setKeywordInput: (value: string) => void;
  onAddKeyword: () => void;
  onRemoveKeyword: (value: string) => void;
  onStartGeneration: () => void;
  onGoToPreview: () => void;
}

export function OutlineSidebar(props: OutlineSidebarProps) {
  return (
    <motion.aside
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      className="order-1 w-full shrink-0 border-b border-zinc-200 bg-[linear-gradient(155deg,#ffffff,#f8fafc)] p-4 lg:order-2 lg:h-full lg:min-h-0 lg:w-[320px] lg:max-h-none lg:overflow-y-auto lg:border-b-0 lg:border-l"
    >
      <motion.div
        variants={itemVariants}
        className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3"
      >
        {props.isOutlineHydrating ? (
          <p className="text-xs text-zinc-500">大纲仍在加载，请稍后再试。</p>
        ) : null}
        {props.generationFailed ? (
          <p className="text-xs text-rose-500">{props.generationFailed}</p>
        ) : null}
        {props.outlineIncomplete ? (
          <p className="text-xs text-zinc-500">
            大纲尚未完整：{props.slidesCount}/{props.expectedPages} 页。
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2">
            <p className="text-[10px] text-zinc-400">时长</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-700">
              <Clock className="h-3 w-3 text-zinc-400" />
              {props.totalEstimatedMinutes}m
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2">
            <p className="text-[10px] text-zinc-400">页数</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-700">
              <Layers className="h-3 w-3 text-zinc-400" />
              {props.slidesCount}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2">
            <p className="text-[10px] text-zinc-400">比例</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-700">
              <Monitor className="h-3 w-3 text-zinc-400" />
              {props.aspectRatio}
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!props.isGenerating ? (
            <motion.div
              key="start-button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-2"
            >
              <Button
                onClick={props.onStartGeneration}
                disabled={
                  props.isOutlineHydrating ||
                  props.outlineIncomplete ||
                  props.isRedrafting
                }
                className="h-11 w-full rounded-xl border border-blue-600 bg-blue-600 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-500"
              >
                <ThinkingMark className="mr-2 h-4 w-4" />
                开始生成课件
              </Button>
              <p className="text-center text-[10px] text-zinc-400">
                预计消耗约 {props.estimatedTokens} tokens
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
              <div className="relative h-2.5 overflow-hidden rounded-full bg-zinc-100">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, #38bdf8, #60a5fa, #818cf8, #38bdf8)",
                    backgroundSize: "200% 100%",
                  }}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${props.progress}%`,
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
              <p className="text-center text-xs text-zinc-500">
                {props.progressText}
              </p>
              <Button
                onClick={props.onGoToPreview}
                className="h-11 w-full rounded-xl border border-blue-600 bg-blue-600 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-500"
              >
                <Play className="mr-2 h-4 w-4" />
                去看实时生成
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div variants={itemVariants} className="mt-3 space-y-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Settings2 className="h-4 w-4 text-blue-600" />
            生成设置
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-zinc-500">
            在开始生成前，微调比例、详略与视觉风格。
          </p>
        </div>

        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600">
            <Monitor className="h-3.5 w-3.5" />
            页面比例
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {ASPECT_RATIO_OPTIONS.map((ratio) => (
              <button
                key={ratio.value}
                onClick={() => props.setAspectRatio(ratio.value)}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-xs transition-all",
                  props.aspectRatio === ratio.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white"
                )}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-3">
          <label className="text-xs font-medium text-zinc-600">内容详略</label>
          <ToggleGroup
            type="single"
            value={props.detailLevel}
            onValueChange={(value) =>
              value &&
              props.setDetailLevel(value as "brief" | "standard" | "detailed")
            }
            className="flex gap-1"
          >
            {DETAIL_LEVELS.map((level) => (
              <ToggleGroupItem
                key={level.value}
                value={level.value}
                className="flex-1 h-8 border border-zinc-200 text-xs text-zinc-600 data-[state=on]:border-blue-500 data-[state=on]:bg-blue-50 data-[state=on]:text-blue-700"
              >
                {level.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-3">
          <label className="text-xs font-medium text-zinc-600">视觉主题</label>
          <div className="grid grid-cols-2 gap-1.5">
            {VISUAL_THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => props.setVisualTheme(theme.id)}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-xs transition-all",
                  props.visualTheme === theme.id
                    ? `bg-gradient-to-r ${theme.gradient} border-transparent text-white`
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white"
                )}
              >
                {theme.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-3">
          <label className="text-xs font-medium text-zinc-600">配图风格</label>
          <Select value={props.imageStyle} onValueChange={props.setImageStyle}>
            <SelectTrigger className="h-9 border-zinc-200 bg-white text-zinc-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-200 bg-white">
              {IMAGE_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value}>
                  <span className="mr-1.5 text-[11px] text-zinc-400">
                    {style.icon}
                  </span>
                  {style.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="mt-3 space-y-2 rounded-2xl border border-zinc-200 bg-white p-3"
      >
        <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600">
          <Tag className="h-3 w-3" />
          关键词
        </label>
        <div className="flex flex-wrap gap-1.5">
          {props.keywords.map((keyword) => (
            <motion.span
              key={keyword}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
            >
              {keyword}
              <button
                onClick={() => props.onRemoveKeyword(keyword)}
                className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Input
            value={props.keywordInput}
            onChange={(e) => props.setKeywordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && props.onAddKeyword()}
            placeholder="加一个关键词..."
            className="h-8 border-zinc-200 bg-white text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={props.onAddKeyword}
            className="h-8 border-zinc-200 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-100"
          >
            添加
          </Button>
        </div>
      </motion.div>
    </motion.aside>
  );
}
