"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock, Layers, Monitor, Play, Settings2, Sparkles, Tag, X } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  progress: number;
  progressText: string;
  aspectRatio: (typeof ASPECT_RATIO_OPTIONS)[number]["value"];
  setAspectRatio: (value: (typeof ASPECT_RATIO_OPTIONS)[number]["value"]) => void;
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
                onClick={() => props.setAspectRatio(ratio.value)}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-xs transition-all",
                  props.aspectRatio === ratio.value
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
            value={props.detailLevel}
            onValueChange={(value) => value && props.setDetailLevel(value as "brief" | "standard" | "detailed")}
            className="flex gap-1"
          >
            {DETAIL_LEVELS.map((level) => (
              <ToggleGroupItem key={level.value} value={level.value} className="flex-1 h-8 text-xs data-[state=on]:bg-zinc-900 data-[state=on]:text-zinc-50 border border-zinc-200">
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
                onClick={() => props.setVisualTheme(theme.id)}
                className={cn(
                  "px-3 py-2 rounded-xl text-xs font-medium transition-all border",
                  props.visualTheme === theme.id
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
          <Select value={props.imageStyle} onValueChange={props.setImageStyle}>
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
          {props.keywords.map((keyword) => (
            <motion.span
              key={keyword}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-zinc-100 text-zinc-700"
            >
              {keyword}
              <button onClick={() => props.onRemoveKeyword(keyword)} className="hover:text-zinc-900">
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
            className="h-8 text-xs bg-white border-zinc-200"
          />
          <Button variant="outline" size="sm" onClick={props.onAddKeyword} className="h-8 px-3 text-xs">
            +
          </Button>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="space-y-3 pt-4 border-t border-zinc-200/60">
        {props.isOutlineHydrating ? <p className="text-xs text-zinc-500">大纲加载中，请稍候...</p> : null}
        {props.generationFailed ? <p className="text-xs text-red-500">{props.generationFailed}</p> : null}
        {props.outlineIncomplete ? (
          <p className="text-xs text-zinc-500">大纲生成中：{props.slidesCount}/{props.expectedPages} 页</p>
        ) : null}

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />预计时长</span>
          <span className="font-medium text-zinc-700">{props.totalEstimatedMinutes} 分钟</span>
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1"><Layers className="w-3 h-3" />幻灯片数量</span>
          <span className="font-medium text-zinc-700">{props.slidesCount} 页</span>
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />Aspect Ratio</span>
          <span className="font-medium text-zinc-700">{props.aspectRatio}</span>
        </div>

        <AnimatePresence mode="wait">
          {!props.isGenerating ? (
            <motion.div key="start-button" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-2">
              <Button
                onClick={props.onStartGeneration}
                disabled={props.isOutlineHydrating || props.outlineIncomplete}
                className="w-full h-11 border border-zinc-800 bg-zinc-900 text-zinc-50 text-sm font-medium shadow-sm transition-all hover:bg-zinc-800"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                开始生成课件
              </Button>
              <p className="text-[10px] text-zinc-400 text-center">预计消耗约 {props.estimatedTokens} tokens</p>
            </motion.div>
          ) : (
            <motion.div key="progress-section" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3">
              <div className="relative h-3 bg-zinc-100 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: "linear-gradient(90deg, #18181b, #3f3f46, #71717a, #18181b)", backgroundSize: "200% 100%" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${props.progress}%`, backgroundPosition: ["0% 0%", "100% 0%"] }}
                  transition={{ width: { duration: 0.4, ease: "easeOut" }, backgroundPosition: { duration: 1.5, repeat: Infinity, ease: "linear" } }}
                />
              </div>
              <p className="text-xs text-zinc-500 text-center">{props.progressText}</p>
              <Button onClick={props.onGoToPreview} className="w-full h-11 border border-zinc-800 bg-zinc-900 text-zinc-50 text-sm font-medium shadow-sm hover:bg-zinc-800">
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
