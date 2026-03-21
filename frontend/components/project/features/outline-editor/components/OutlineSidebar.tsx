"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Clock,
  Layers,
  Monitor,
  Play,
  Settings2,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
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
      className="order-1 lg:order-2 w-full lg:w-[340px] max-h-[46vh] lg:max-h-none lg:h-full lg:min-h-0 overflow-y-auto border-b lg:border-b-0 lg:border-l border-zinc-200/70 bg-[linear-gradient(165deg,#0f172a,#111827)] p-4 lg:p-5 flex flex-col gap-4 shrink-0 text-zinc-100"
    >
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-sky-300" />
            生成配置
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-zinc-300">
            当前处于第 2 步，确认参数后可直接启动内容生成。
          </p>
        </div>

        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5" />
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
                    ? "border-sky-300 bg-sky-300/20 text-sky-100"
                    : "border-white/15 bg-white/[0.03] text-zinc-300 hover:border-white/30"
                )}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <label className="text-xs font-medium text-zinc-300">内容详细度</label>
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
                className="flex-1 h-8 text-xs border border-white/15 text-zinc-300 data-[state=on]:border-sky-300 data-[state=on]:bg-sky-300/20 data-[state=on]:text-sky-100"
              >
                {level.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <label className="text-xs font-medium text-zinc-300">视觉主题</label>
          <div className="grid grid-cols-2 gap-1.5">
            {VISUAL_THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => props.setVisualTheme(theme.id)}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-xs transition-all",
                  props.visualTheme === theme.id
                    ? `bg-gradient-to-r ${theme.gradient} border-transparent text-white`
                    : "border-white/15 bg-white/[0.02] text-zinc-300 hover:border-white/30"
                )}
              >
                {theme.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <label className="text-xs font-medium text-zinc-300">配图风格</label>
          <Select value={props.imageStyle} onValueChange={props.setImageStyle}>
            <SelectTrigger className="w-full h-9 border-white/20 bg-white/[0.06] text-zinc-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 text-zinc-100 border-zinc-700">
              {IMAGE_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value}>
                  <span className="mr-1.5 text-[11px] text-zinc-400">{style.icon}</span>
                  {style.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
          <Tag className="w-3 h-3" />
          关键词标签
        </label>
        <div className="flex flex-wrap gap-1.5">
          {props.keywords.map((keyword) => (
            <motion.span
              key={keyword}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-zinc-100"
            >
              {keyword}
              <button
                onClick={() => props.onRemoveKeyword(keyword)}
                className="rounded-full p-0.5 text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Input
            value={props.keywordInput}
            onChange={(e) => props.setKeywordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && props.onAddKeyword()}
            placeholder="添加关键词..."
            className="h-8 text-xs border-white/20 bg-white/[0.06] text-zinc-100 placeholder:text-zinc-400"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={props.onAddKeyword}
            className="h-8 px-3 text-xs border-white/20 bg-white/[0.06] text-zinc-100 hover:bg-white/15"
          >
            添加
          </Button>
        </div>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
      >
        {props.isOutlineHydrating ? (
          <p className="text-xs text-zinc-300">大纲加载中，请稍候...</p>
        ) : null}
        {props.generationFailed ? (
          <p className="text-xs text-rose-300">{props.generationFailed}</p>
        ) : null}
        {props.outlineIncomplete ? (
          <p className="text-xs text-zinc-300">
            大纲生成中：{props.slidesCount}/{props.expectedPages} 页
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2">
            <p className="text-[10px] text-zinc-400">时长</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-100">
              <Clock className="h-3 w-3 text-zinc-400" />
              {props.totalEstimatedMinutes}m
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2">
            <p className="text-[10px] text-zinc-400">页数</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-100">
              <Layers className="h-3 w-3 text-zinc-400" />
              {props.slidesCount}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2">
            <p className="text-[10px] text-zinc-400">比例</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-100">
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
                className="w-full h-11 rounded-xl border border-sky-400/50 bg-[linear-gradient(120deg,#0284c7,#2563eb)] text-white text-sm font-medium shadow-lg shadow-blue-950/30 transition-all hover:brightness-110"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                开始生成课件
              </Button>
              <p className="text-[10px] text-zinc-400 text-center">
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
              <div className="relative h-2.5 bg-white/10 rounded-full overflow-hidden">
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
              <p className="text-xs text-zinc-300 text-center">
                {props.progressText}
              </p>
              <Button
                onClick={props.onGoToPreview}
                className="w-full h-11 rounded-xl border border-sky-400/50 bg-[linear-gradient(120deg,#0284c7,#2563eb)] text-white text-sm font-medium shadow-lg shadow-blue-950/30 hover:brightness-110"
              >
                <Play className="w-4 h-4 mr-2" />
                进入实时生成页
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.aside>
  );
}
