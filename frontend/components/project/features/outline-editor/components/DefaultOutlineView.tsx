"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PptWorkflowRail } from "../../generation/components/PptWorkflowRail";
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
    <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(186,230,253,0.35),transparent_45%),radial-gradient(circle_at_85%_20%,rgba(196,181,253,0.25),transparent_35%),linear-gradient(180deg,#f8fafc,#f1f5f9)] font-sans">
      <DefaultOutlineNav
        topic={topic}
        slideCount={slides.length}
        onBack={onBack}
        onPreview={onGoToPreview}
        onHelp={onHelp}
      />

      <div className="flex h-[calc(100%-56px)] min-h-0 gap-3 p-3 lg:p-4">
        <PptWorkflowRail
          currentStep={2}
          className="hidden lg:block lg:w-[220px] lg:shrink-0"
        />

        <div className="flex-1 min-h-0 overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/80 shadow-[0_32px_90px_-55px_rgba(15,23,42,0.5)] backdrop-blur-sm">
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="order-2 flex-1 min-h-0 overflow-y-auto p-4 lg:order-1 lg:p-8"
            >
              <motion.section variants={itemVariants} className="mb-4 lg:hidden">
                <PptWorkflowRail currentStep={2} />
              </motion.section>

              <motion.section
                variants={itemVariants}
                className="mb-5 rounded-2xl border border-zinc-200 bg-white/90 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-zinc-900">大纲共创工作台</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      当前第 2 步：完善结构后即可进入内容生成。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRedraftOutline}
                      disabled={isGenerating || isRedrafting}
                      className="border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    >
                      <RefreshCw
                        className={cn("mr-1.5 h-4 w-4", isRedrafting && "animate-spin")}
                      />
                      {isRedrafting ? "重生成中" : "重生成"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSettings(!showSettings)}
                      className={cn(
                        "text-zinc-600 hover:bg-zinc-100",
                        showSettings && "bg-zinc-100 text-zinc-900"
                      )}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </motion.section>

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
                  className="mb-4 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600"
                >
                  <RefreshCw className="h-4 w-4 animate-spin" />
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
      </div>
    </div>
  );
}
