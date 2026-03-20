"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { containerVariants, itemVariants } from "../constants";
import { DefaultOutlineNav } from "./DefaultOutlineNav";
import { OutlineInlineSettings } from "./OutlineInlineSettings";
import { OutlineSidebar } from "./OutlineSidebar";
import { OutlineSlidesEditor } from "./OutlineSlidesEditor";
import type { SlideCard } from "../types";

interface DefaultOutlineViewProps {
  topic: string;
  onBack?: () => void;
  isBootstrapping: boolean;
  slides: SlideCard[];
  activeSlideId: string;
  isGenerating: boolean;
  isRedrafting: boolean;
  isOutlineHydrating: boolean;
  showSettings: boolean;
  setShowSettings: (value: boolean) => void;
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
  onHelp: () => void;
  onGoToPreview: () => void;
}

export function DefaultOutlineView({
  topic,
  onBack,
  isBootstrapping,
  slides,
  activeSlideId,
  isGenerating,
  isRedrafting,
  isOutlineHydrating,
  showSettings,
  setShowSettings,
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
  onHelp,
  onGoToPreview,
}: DefaultOutlineViewProps) {
  return (
    <div className="h-full bg-gradient-to-br from-zinc-50 via-white to-zinc-100 flex flex-col font-sans overflow-hidden">
      <DefaultOutlineNav
        topic={topic}
        slideCount={slides.length}
        onBack={onBack}
        onPreview={onGoToPreview}
        onHelp={onHelp}
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="order-2 lg:order-1 flex-1 p-4 lg:p-8 h-full overflow-y-auto min-h-0"
        >
          <motion.div
            variants={itemVariants}
            className="flex items-center justify-between mb-6"
          >
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
                onClick={onRedraftOutline}
                disabled={isGenerating || isRedrafting}
                className="text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 border-zinc-200"
              >
                <RefreshCw
                  className={cn(
                    "w-4 h-4 mr-1.5",
                    isRedrafting && "animate-spin"
                  )}
                />
                {isRedrafting ? "重新生成中..." : "重新生成"}
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
            {showSettings ? (
              <OutlineInlineSettings
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
              />
            ) : null}
          </AnimatePresence>

          {isBootstrapping && slides.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-zinc-200 bg-white/90 p-4 text-sm text-zinc-600 flex items-center gap-2 mb-3"
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              正在生成大纲，马上进入可编辑状态...
            </motion.div>
          ) : null}

          <OutlineSlidesEditor
            slides={slides}
            activeSlideId={activeSlideId}
            isGenerating={isGenerating}
            isOutlineHydrating={isOutlineHydrating}
            onSetActiveSlide={onSetActiveSlide}
            onUpdateSlide={onUpdateSlide}
            onDeleteSlide={onDeleteSlide}
            onDuplicateSlide={onDuplicateSlide}
            onAddSlide={onAddSlide}
          />
        </motion.div>

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
  );
}
