"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Compass,
  FileStack,
  FileText,
  LayoutTemplate,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { OutlineEditorPanel } from "@/components/project";
import { PptWorkflowRail } from "./components/PptWorkflowRail";
import {
  containerVariants,
  itemVariants,
  OUTLINE_STYLES,
  PAGE_PRESETS,
} from "./constants";
import {
  type GenerationConfig,
  useGenerationConfigPanel,
} from "./useGenerationConfigPanel";

interface GenerationConfigPanelProps {
  variant?: "default" | "compact";
  onBack?: () => void;
  onGenerate?: (
    config: GenerationConfig
  ) => Promise<string | void | null> | string | void | null;
  resumeStage?: "config" | "outline" | null;
  resumeSignal?: number;
  onWorkflowStageChange?: (
    stage: "config" | "generating_outline" | "outline",
    payload?: { sessionId?: string | null }
  ) => void;
}

export { type GenerationConfig } from "./useGenerationConfigPanel";

export function GenerationConfigPanel({
  variant = "default",
  onGenerate,
  resumeStage,
  resumeSignal,
  onWorkflowStageChange,
}: GenerationConfigPanelProps) {
  const compact = variant === "compact";
  const {
    prompt,
    setPrompt,
    pageCount,
    setPageCount,
    outlineStyle,
    setOutlineStyle,
    suggestions,
    loadingSuggestions,
    isCreatingSession,
    showOutlineEditor,
    setShowOutlineEditor,
    pageLabel,
    generateSuggestionBatch,
    handleGenerate,
    handleGoToPreview,
  } = useGenerationConfigPanel({
    onGenerate,
    resumeStage,
    resumeSignal,
    onWorkflowStageChange,
  });

  return (
    <div className="relative h-full min-h-0 overflow-hidden p-2 lg:p-3">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-20 top-8 h-44 w-44 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute right-4 top-24 h-36 w-36 rounded-full bg-cyan-200/25 blur-3xl" />
      </div>

      <div
        className={cn(
          "relative z-10 grid h-full min-h-0 gap-3",
          compact
            ? "grid-cols-1 lg:grid-cols-[130px_minmax(0,1fr)]"
            : "grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)]"
        )}
      >
        <PptWorkflowRail
          currentStep={1}
          className="hidden h-full min-h-0 overflow-y-auto lg:block"
        />

        <Card className="h-full min-h-0 border-zinc-200/80 bg-white/85 text-zinc-900 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)] backdrop-blur-sm">
          <ScrollArea className="h-full min-h-0 pr-2 lg:pr-3">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className={cn(
                "space-y-4 px-3 pb-5 lg:px-4",
                compact ? "pt-3" : "pt-4"
              )}
            >
              <motion.section variants={itemVariants} className="lg:hidden">
                <PptWorkflowRail currentStep={1} />
              </motion.section>

              <motion.section variants={itemVariants}>
                <Card className="overflow-hidden rounded-2xl border-zinc-200 bg-[linear-gradient(155deg,#ffffff,#f8fafc)] text-zinc-900 shadow-sm">
                  <CardHeader className="px-4 pb-4 pt-4 sm:px-5">
                    <CardTitle className="flex items-center gap-2 text-sm text-zinc-900">
                      <Wand2 className="h-4 w-4 text-blue-600" />
                      先把课件方向说清楚
                      <Badge className="ml-auto border-blue-200 bg-blue-50 text-blue-700">
                        第 1 步
                      </Badge>
                    </CardTitle>
                    <p className="text-xs leading-5 text-zinc-600">
                      不用专业术语，像和同事沟通一样写出你的需求就行。
                    </p>
                  </CardHeader>
                  <CardContent className="grid gap-2 px-4 pb-4 pt-0 sm:grid-cols-3 sm:px-5">
                    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
                      <p className="text-[11px] font-medium text-zinc-500">讲什么</p>
                      <p className="mt-1 text-xs font-medium text-zinc-900">课程主题</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
                      <p className="text-[11px] font-medium text-zinc-500">给谁讲</p>
                      <p className="mt-1 text-xs font-medium text-zinc-900">年级或对象</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
                      <p className="text-[11px] font-medium text-zinc-500">怎么讲</p>
                      <p className="mt-1 text-xs font-medium text-zinc-900">课堂形式</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.section>

              <motion.section
                variants={itemVariants}
                className="grid gap-4 lg:grid-cols-5"
              >
                <Card className="rounded-2xl border-zinc-200 bg-white/95 text-zinc-900 shadow-sm lg:col-span-3">
                  <CardHeader className="px-4 pb-3 pt-4 sm:px-5">
                    <CardTitle className="flex items-center gap-2 text-sm text-zinc-900">
                      <Compass className="h-4 w-4 text-blue-600" />
                      课件需求说明
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 pb-4 pt-0 sm:px-5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="ppt-prompt-input"
                          className="text-xs font-medium text-zinc-600"
                        >
                          你的想法
                        </label>
                        <span className="text-[11px] text-zinc-500">
                          {prompt.length}/1200
                        </span>
                      </div>
                      <Textarea
                        id="ppt-prompt-input"
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="例如：我要做一份《图形显示设备》课件，面向大二学生，包含讲解、案例和课堂讨论。"
                        className="min-h-[160px] resize-none rounded-2xl border-zinc-200 bg-zinc-50/70 text-sm leading-6 shadow-inner focus-visible:ring-blue-300"
                      />
                    </div>
                    <p className="text-[11px] leading-5 text-zinc-500">
                      小建议：写清楚主题、对象、课堂活动，生成质量会更稳。
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-zinc-200 bg-white/95 text-zinc-900 shadow-sm lg:col-span-2">
                  <CardHeader className="px-4 pb-3 pt-4 sm:px-5">
                    <CardTitle className="flex items-center gap-2 text-sm text-zinc-900">
                      <FileStack className="h-4 w-4 text-blue-600" />
                      页面设置
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 px-4 pb-4 pt-0 sm:px-5">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                        <FileText className="h-3.5 w-3.5 text-zinc-500" />
                        页数
                        <Badge
                          variant="outline"
                          className="ml-auto border-zinc-200 bg-zinc-50 text-[11px] text-zinc-700"
                        >
                          {pageCount} 页 · {pageLabel}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {PAGE_PRESETS.map((value) => (
                          <button
                            key={value}
                            onClick={() => setPageCount(value)}
                            className={cn(
                              "rounded-xl border px-2 py-1.5 text-xs font-medium transition-all",
                              pageCount === value
                                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white"
                            )}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Separator className="bg-zinc-200" />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                        <LayoutTemplate className="h-3.5 w-3.5 text-zinc-500" />
                        风格偏好
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {OUTLINE_STYLES.map((style) => (
                          <motion.button
                            key={style.id}
                            whileHover={{ y: -1 }}
                            onClick={() => setOutlineStyle(style.id)}
                            className={cn(
                              "rounded-xl border px-3 py-2.5 text-left transition-all",
                              outlineStyle === style.id
                                ? "border-blue-600 bg-blue-50/70 shadow-sm"
                                : "border-zinc-200 bg-zinc-50/70 hover:border-zinc-300 hover:bg-white"
                            )}
                          >
                            <p className="text-xs font-medium text-zinc-900">
                              {style.name}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-5 text-zinc-500">
                              {style.desc}
                            </p>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.section>

              <motion.section variants={itemVariants}>
                <Card className="rounded-2xl border-zinc-200 bg-white/95 text-zinc-900 shadow-sm">
                  <CardHeader className="px-4 pb-2 pt-4 sm:px-5">
                    <CardTitle className="flex items-center gap-2 text-sm text-zinc-900">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      不会写也没关系
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-8 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-600 hover:bg-zinc-100"
                        onClick={() => void generateSuggestionBatch()}
                        disabled={loadingSuggestions}
                      >
                        <RefreshCw
                          className={cn(
                            "mr-1.5 h-3.5 w-3.5",
                            loadingSuggestions && "animate-spin"
                          )}
                        />
                        换几个示例
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0 sm:px-5">
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                      {suggestions.map((item, idx) => (
                        <motion.button
                          key={`${item}-${idx}`}
                          whileHover={{ y: -2, scale: 1.002 }}
                          whileTap={{ scale: 0.996 }}
                          onClick={() => setPrompt(item)}
                          className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-xs leading-5 text-zinc-700 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
                        >
                          {item}
                        </motion.button>
                      ))}
                      {loadingSuggestions && suggestions.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-500 lg:col-span-2">
                          正在准备示例内容...
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </motion.section>

              <motion.section variants={itemVariants} className="pb-1">
                <Card className="rounded-2xl border-zinc-200 bg-white/95 text-zinc-900 shadow-sm">
                  <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        开始生成大纲
                      </p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        下一步会进入大纲编辑页，你可以继续微调每一页。
                      </p>
                    </div>
                    <Button
                      onClick={() => void handleGenerate()}
                      disabled={!prompt.trim() || isCreatingSession}
                      className={cn(
                        "h-11 min-w-[180px] rounded-xl border border-blue-700 bg-blue-700 px-4 text-white shadow-sm transition-all hover:bg-blue-600",
                        (!prompt.trim() || isCreatingSession) && "opacity-70"
                      )}
                    >
                      {isCreatingSession ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          正在创建...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          进入大纲编辑
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.section>
            </motion.div>
          </ScrollArea>
        </Card>
      </div>

      <AnimatePresence mode="wait">
        {showOutlineEditor ? (
          <motion.div
            key="outline-editor"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute inset-0 z-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
          >
            <OutlineEditorPanel
              variant="default"
              topic={prompt}
              isBootstrapping={isCreatingSession}
              onBack={() => setShowOutlineEditor(false)}
              onConfirm={() => {}}
              onPreview={handleGoToPreview}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
