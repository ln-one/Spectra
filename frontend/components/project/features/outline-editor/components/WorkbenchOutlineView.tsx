"use client";

import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { itemVariants } from "../constants";
import { OutlineSidebar } from "./OutlineSidebar";
import { OutlineSlidesEditor } from "./OutlineSlidesEditor";
import type { SlideCard } from "../types";

interface WorkbenchOutlineViewProps {
  topic: string;
  onBack?: () => void;
  isBootstrapping: boolean;
  slides: SlideCard[];
  activeSlideId: string;
  isGenerating: boolean;
  isRedrafting: boolean;
  isOutlineHydrating: boolean;
  onSetActiveSlide: (id: string) => void;
  onUpdateSlide: (id: string, updates: Partial<SlideCard>) => void;
  onDeleteSlide: (id: string) => void;
  onDuplicateSlide: (slide: SlideCard) => void;
  onAddSlide: () => void;
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
  expectedPages: number;
  outlineIncomplete: boolean;
  generationFailed: string | null;
  totalEstimatedMinutes: number;
  estimatedTokens: number;
  progress: number;
  progressText: string;
  aspectRatio: "16:9" | "4:3" | "1:1";
  setAspectRatio: (value: "16:9" | "4:3" | "1:1") => void;
  onStartGeneration: () => void;
  onRedraftOutline: () => void;
  onGoToPreview: () => void;
}

export function WorkbenchOutlineView({
  topic,
  onBack,
  isBootstrapping,
  slides,
  activeSlideId,
  isGenerating,
  isRedrafting,
  isOutlineHydrating,
  onSetActiveSlide,
  onUpdateSlide,
  onDeleteSlide,
  onDuplicateSlide,
  onAddSlide,
  detailLevel,
  setDetailLevel,
  visualTheme,
  setVisualTheme,
  imageStyle,
  setImageStyle,
  keywords,
  keywordInput,
  setKeywordInput,
  onAddKeyword,
  onRemoveKeyword,
  expectedPages,
  outlineIncomplete,
  generationFailed,
  totalEstimatedMinutes,
  estimatedTokens,
  progress,
  progressText,
  aspectRatio,
  setAspectRatio,
  onStartGeneration,
  onRedraftOutline,
  onGoToPreview,
}: WorkbenchOutlineViewProps) {
  const isOutlineLocked = isBootstrapping || isOutlineHydrating;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="border-b border-zinc-200 px-4 pb-3 pt-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">大纲编辑</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              现在是第 2 步：编辑每一页大纲，PPT 会据此生成对应内容。
            </p>
            <p className="mt-1 truncate text-[11px] text-zinc-400">{topic}</p>
          </div>
          <div className="flex items-center gap-2">
            {onBack ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="h-8 text-xs text-zinc-600 hover:bg-zinc-100"
              >
                返回配置
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={onRedraftOutline}
              disabled={isGenerating || isRedrafting || isOutlineLocked}
              className="h-8 border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${isRedrafting ? "animate-spin" : ""}`}
              />
              {isRedrafting ? "重新生成中" : "重新生成"}
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col lg:flex-row">
          <div className="order-2 min-h-0 flex-1 overflow-y-auto p-4 lg:order-1 lg:p-5">
            {isBootstrapping && slides.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600"
              >
                <RefreshCw className="h-4 w-4 animate-spin" />
                正在准备大纲，马上就可以开始编辑...
              </motion.div>
            ) : null}
            {isOutlineHydrating ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700"
              >
                <RefreshCw className="h-4 w-4 animate-spin" />
                大纲正在生成中，当前为只读状态，生成完成后可编辑。
              </motion.div>
            ) : null}

            <OutlineSlidesEditor
              slides={slides}
              activeSlideId={activeSlideId}
              isBootstrapping={isBootstrapping}
              isGenerating={isGenerating}
              isOutlineHydrating={isOutlineHydrating}
              onSetActiveSlide={onSetActiveSlide}
              onUpdateSlide={onUpdateSlide}
              onDeleteSlide={onDeleteSlide}
              onDuplicateSlide={onDuplicateSlide}
              onAddSlide={onAddSlide}
            />
          </div>

          <OutlineSidebar
            slidesCount={slides.length}
            expectedPages={expectedPages}
            outlineIncomplete={outlineIncomplete}
            isOutlineHydrating={isOutlineHydrating}
            generationFailed={generationFailed}
            totalEstimatedMinutes={totalEstimatedMinutes}
            estimatedTokens={estimatedTokens}
            isGenerating={isGenerating}
            isRedrafting={isRedrafting}
            progress={progress}
            progressText={progressText}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            detailLevel={detailLevel}
            setDetailLevel={setDetailLevel}
            visualTheme={visualTheme}
            setVisualTheme={setVisualTheme}
            imageStyle={imageStyle}
            setImageStyle={setImageStyle}
            keywords={keywords}
            keywordInput={keywordInput}
            setKeywordInput={setKeywordInput}
            onAddKeyword={onAddKeyword}
            onRemoveKeyword={onRemoveKeyword}
            onStartGeneration={onStartGeneration}
            onGoToPreview={onGoToPreview}
          />
        </div>
      </div>
    </div>
  );
}
