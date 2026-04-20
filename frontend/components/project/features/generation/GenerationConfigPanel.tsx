"use client";

import * as React from "react";

import { motion } from "framer-motion";
import {
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  LayoutTemplate,
  Lightbulb,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { OutlineEditorPanel } from "@/components/project";
import { PptWorkflowRail } from "./components/PptWorkflowRail";
import { TOOL_COLORS } from "@/components/project/features/studio/constants";
import {
  containerVariants,
  itemVariants,
  LAYOUT_MODES,
  PAGE_PRESETS,
  VISUAL_POLICIES,
  VISUAL_STYLES,
  TEMPLATE_CARDS,
} from "./constants";
import { getStylePreviewSlides } from "./stylePreviewSlides";
import { SelectedSourceScopeBadge } from "@/components/project/features/sources/components/SelectedSourceScopeBadge";
import {
  type GenerationConfig,
  useGenerationConfigPanel,
} from "./useGenerationConfigPanel";

interface GenerationConfigPanelProps {
  variant?: "default" | "compact";
  onBack?: () => void;
  onGenerate?: (
    config: GenerationConfig
  ) =>
    | Promise<{ sessionId: string; runId: string } | void | null>
    | { sessionId: string; runId: string }
    | void
    | null;
  resumeStage?: "config" | "outline" | null;
  resumeSignal?: number;
  onWorkflowStageChange?: (
    stage: "config" | "generating_outline" | "outline" | "preview",
    payload?: { sessionId?: string | null; runId?: string | null }
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
    visualStyle,
    setVisualStyle,
    visualPolicy,
    setVisualPolicy,
    layoutMode,
    setLayoutMode,
    selectedTemplateId,
    setSelectedTemplateId,
    suggestions,
    suggestionStatus,
    loadingSuggestions,
    suggestionErrorMessage,
    isCreatingSession,
    showRegenerateHint,
    showOutlineEditor,
    handleBackToConfigFromOutline,
    handleGenerate,
    handleGoToPreview,
    generateSuggestionBatch,
  } = useGenerationConfigPanel({
    onGenerate,
    resumeStage,
    resumeSignal,
    onWorkflowStageChange,
  });
  const workflowStep = showOutlineEditor ? 2 : 1;
  const colors = TOOL_COLORS?.ppt || {
    primary: "#f97316",
    secondary: "#fb923c",
    gradient: "from-[#ff7e2e] via-[#f97316] to-[#ea580c]",
    glow: "rgba(249, 115, 22, 0.15)",
    soft: "rgba(249, 115, 22, 0.05)",
  };

  const activeVisualStyle = VISUAL_STYLES.find((s) => s.id === visualStyle);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewTitle, setPreviewTitle] = React.useState<string>("预览");
  const [previewImages, setPreviewImages] = React.useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = React.useState(0);

  const openPreview =
    (images: string[], title: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      setPreviewImages(images);
      setPreviewTitle(title);
      setPreviewIndex(0);
      setPreviewOpen(true);
    };
  const currentPreviewImage = previewImages[previewIndex] ?? null;
  const canPreviewPrev = previewIndex > 0;
  const canPreviewNext = previewIndex < previewImages.length - 1;

  const goPreviewPrev = React.useCallback(() => {
    setPreviewIndex((current) => (current > 0 ? current - 1 : current));
  }, []);

  const goPreviewNext = React.useCallback(() => {
    setPreviewIndex((current) =>
      current < previewImages.length - 1 ? current + 1 : current
    );
  }, [previewImages.length]);

  React.useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPreviewPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goPreviewNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [goPreviewNext, goPreviewPrev, previewOpen]);

  return (
    <div
      className="project-tool-workbench relative h-full flex flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-zinc-50/40 backdrop-blur-2xl shadow-2xl shadow-zinc-200/20 group/workbench"
      style={{
        ["--project-tool-accent" as any]: colors.primary,
        ["--project-tool-accent-soft" as any]: colors.glow,
        ["--project-tool-surface" as any]: colors.soft,
      }}
    >
      {/* ambient orbs */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-400/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-indigo-400/8 blur-[120px]" />

      <div
        className={cn("h-1 shrink-0 w-full bg-gradient-to-r", colors.gradient)}
      />

      <div
        className={cn(
          "relative z-10 grid flex-1 min-h-0 gap-4",
          compact
            ? "grid-cols-1 lg:grid-cols-[160px_minmax(0,1fr)] p-3 lg:p-4"
            : "grid-cols-1 lg:grid-cols-[160px_minmax(0,1fr)] p-3 lg:p-4"
        )}
      >
        <PptWorkflowRail
          currentStep={workflowStep}
          className="hidden h-full min-h-0 overflow-y-auto lg:block"
        />

        <div className="h-full min-h-0 rounded-[1.75rem] border border-zinc-100 bg-white/70 text-zinc-900 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur-xl overflow-hidden">
          {showOutlineEditor ? (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="h-full min-h-0"
            >
              <div className="h-full min-h-0">
                <OutlineEditorPanel
                  variant="default"
                  topic={prompt}
                  isBootstrapping={isCreatingSession}
                  onBack={handleBackToConfigFromOutline}
                  onConfirm={() => {}}
                  onPreview={handleGoToPreview}
                />
              </div>
            </motion.div>
          ) : (
            <ScrollArea className="h-full min-h-0 pr-2 lg:pr-4">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className={cn(
                  "space-y-8 px-3 pb-8 lg:px-6",
                  compact ? "pt-3" : "pt-5"
                )}
              >
                <motion.section variants={itemVariants} className="lg:hidden">
                  <PptWorkflowRail currentStep={1} />
                </motion.section>

                {/* Input Card */}
                <motion.section variants={itemVariants}>
                  <div className="group relative rounded-[2rem] bg-white p-1 shadow-[0_2px_24px_-6px_rgba(0,0,0,0.06)] ring-1 ring-zinc-100 transition-all hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.1)] hover:ring-zinc-200">
                    <div className="flex gap-3 p-4">
                      {/* Style Preview Thumbnail */}
                      <div className="hidden sm:block relative overflow-hidden rounded-2xl w-[160px] h-[100px] shrink-0 ring-1 ring-zinc-100 shadow-sm">
                        <img
                          src={activeVisualStyle?.coverImage}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                      </div>

                      {/* Textarea */}
                      <div className="flex-1">
                        <Textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder="输入你想创作的 PPT 主题"
                          className="min-h-[76px] resize-none border-0 bg-transparent text-xl font-medium placeholder:font-normal placeholder:text-zinc-300 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 shadow-none leading-7"
                        />
                      </div>
                    </div>

                    {/* Toolbar */}
                    <div className="flex items-center justify-between gap-3 rounded-[1.5rem] bg-zinc-50/80 px-3 py-2.5 mx-1 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-zinc-100">
                          {LAYOUT_MODES.map((mode) => (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() =>
                                setLayoutMode(mode.id as "smart" | "classic")
                              }
                              className={cn(
                                "h-8 px-4 rounded-full text-[13px] font-semibold tracking-tight transition-all",
                                layoutMode === mode.id
                                  ? "bg-zinc-900 text-white shadow"
                                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                              )}
                            >
                              {mode.name}
                            </button>
                          ))}
                        </div>

                        <Select
                          value={String(pageCount)}
                          onValueChange={(v) =>
                            setPageCount(v === "auto" ? 8 : Number(v))
                          }
                        >
                          <SelectTrigger className="h-9 w-auto min-w-[100px] rounded-full border-0 bg-white px-3.5 text-[13px] font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-100 hover:ring-zinc-200 focus:ring-2 focus:ring-zinc-200">
                            <SelectValue placeholder="自动页数" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-zinc-100 bg-white/95 backdrop-blur-xl">
                            <SelectItem value="auto" className="text-[13px]">
                              自动页数
                            </SelectItem>
                            {PAGE_PRESETS.map((p) => (
                              <SelectItem
                                key={p}
                                value={String(p)}
                                className="text-[13px]"
                              >
                                {p} 页
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={visualPolicy}
                          onValueChange={(value) =>
                            setVisualPolicy(
                              value as
                                | "auto"
                                | "media_required"
                                | "basic_graphics_only"
                            )
                          }
                        >
                          <SelectTrigger className="h-9 w-auto min-w-[128px] rounded-full border-0 bg-white px-3.5 text-[13px] font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-100 hover:ring-zinc-200 focus:ring-2 focus:ring-zinc-200">
                            <SelectValue placeholder="视觉策略" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-zinc-100 bg-white/95 backdrop-blur-xl">
                            {VISUAL_POLICIES.map((policy) => (
                              <SelectItem
                                key={policy.id}
                                value={policy.id}
                                className="text-[13px]"
                              >
                                {policy.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <SelectedSourceScopeBadge />
                      </div>

                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          onClick={() => void handleGenerate()}
                          disabled={!prompt.trim() || isCreatingSession}
                          className={cn(
                            "h-11 w-11 rounded-full p-0 transition-all shadow-lg",
                            prompt.trim() && !isCreatingSession
                              ? "bg-zinc-900 text-white hover:bg-zinc-800 shadow-zinc-900/25"
                              : "bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none"
                          )}
                        >
                          {isCreatingSession ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowUp className="h-5 w-5" />
                          )}
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                </motion.section>

                {/* Suggestions */}
                <motion.section variants={itemVariants}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-8 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-[12px] font-semibold text-amber-700 ring-1 ring-amber-100">
                      <Sparkles className="h-3.5 w-3.5" />
                      灵感
                    </div>
                    {suggestions.map((item, idx) => (
                      <motion.button
                        key={`${item}-${idx}`}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setPrompt(item)}
                        className="rounded-full border border-zinc-100 bg-white px-3.5 py-1.5 text-[12px] font-medium text-zinc-600 shadow-sm transition-all hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 hover:shadow"
                      >
                        {item}
                      </motion.button>
                    ))}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => void generateSuggestionBatch()}
                      disabled={loadingSuggestions}
                      className="rounded-full bg-zinc-100 px-3 py-1.5 text-[12px] font-medium text-zinc-500 transition-all hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-60"
                    >
                      <RefreshCw
                        className={cn(
                          "mr-1 inline h-3 w-3",
                          loadingSuggestions && "animate-spin"
                        )}
                      />
                      换一批
                    </motion.button>
                    {suggestionStatus === "generating" &&
                    suggestions.length === 0 ? (
                      <span className="text-xs text-zinc-400">
                        正在生成提示池...
                      </span>
                    ) : null}
                    {suggestionStatus === "empty" &&
                    suggestions.length === 0 &&
                    !loadingSuggestions ? (
                      <span className="text-xs text-zinc-400">
                        项目资料不足，暂无提示建议
                      </span>
                    ) : null}
                    {suggestionStatus === "stale" && suggestions.length > 0 ? (
                      <span className="text-xs text-zinc-400">
                        正在刷新提示池
                      </span>
                    ) : null}
                    {suggestionStatus === "failed" &&
                    suggestions.length === 0 &&
                    !loadingSuggestions ? (
                      <span className="text-xs text-amber-600">
                        提示池生成失败，点击“换一批”重试
                      </span>
                    ) : null}
                    {!loadingSuggestions &&
                    suggestions.length === 0 &&
                    suggestionErrorMessage ? (
                      <span className="text-xs text-amber-600">
                        {suggestionErrorMessage}
                      </span>
                    ) : null}
                  </div>
                </motion.section>

                {/* Style / Template Grid */}
                <motion.section variants={itemVariants}>
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-1 rounded-full bg-zinc-900" />
                      <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
                        {layoutMode === "smart" ? "选择风格" : "选择模版"}
                      </h3>
                      {layoutMode === "smart" && (
                        <span className="ml-auto text-xs font-medium text-zinc-400">
                          以下样例均为Spectra一键生成
                        </span>
                      )}
                      {layoutMode === "smart" && (
                        <span className="ml-auto text-xs font-medium text-zinc-400">
                          风格仅代表生成后的版式和配色倾向，具体配色由您或Spectra自行决定
                        </span>
                      )}
                    </div>

                    {layoutMode === "smart" ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {VISUAL_STYLES.map((style) => {
                          const selected = visualStyle === style.id;
                          return (
                            <div
                              key={style.id}
                              onClick={() => setVisualStyle(style.id)}
                              className={cn(
                                "group relative cursor-pointer overflow-hidden rounded-3xl bg-white transition-all duration-150 ease-out hover:-translate-y-1 hover:scale-[1.01] active:scale-[0.99]",
                                selected
                                  ? "shadow-[0_12px_40px_-16px_rgba(37,99,235,0.35)] ring-2 ring-blue-500"
                                  : "shadow-sm ring-1 ring-zinc-100 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.12)] hover:ring-zinc-200"
                              )}
                            >
                              <div className="relative aspect-[16/10] overflow-hidden">
                                <img
                                  src={style.coverImage}
                                  alt=""
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />

                                {/* hover overlay */}
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:bg-black/20 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onClick={openPreview(
                                      getStylePreviewSlides(
                                        style.id,
                                        style.coverImage
                                      ),
                                      style.name
                                    )}
                                    className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-lg shadow-black/10 backdrop-blur-md transition-transform duration-150 scale-95 group-hover:scale-100"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    预览
                                  </button>
                                </div>

                                {/* slide-up name */}
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/50 to-transparent px-3 pb-3 pt-8 text-white opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                                  <span className="text-[13px] font-semibold tracking-tight">
                                    {style.name}
                                  </span>
                                </div>

                                {selected && (
                                  <div className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-500/30">
                                    <Check className="h-3.5 w-3.5" />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {TEMPLATE_CARDS.map((tpl) => {
                          const selected = selectedTemplateId === tpl.id;
                          return (
                            <div
                              key={tpl.id}
                              onClick={() => setSelectedTemplateId(tpl.id)}
                              className={cn(
                                "group relative cursor-pointer overflow-hidden rounded-3xl bg-white transition-all duration-150 ease-out hover:-translate-y-1 hover:scale-[1.01] active:scale-[0.99]",
                                selected
                                  ? "shadow-[0_12px_40px_-16px_rgba(37,99,235,0.35)] ring-2 ring-blue-500"
                                  : "shadow-sm ring-1 ring-zinc-100 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.12)] hover:ring-zinc-200"
                              )}
                            >
                              <div className="relative aspect-[16/10] overflow-hidden">
                                <img
                                  src={tpl.coverImage}
                                  alt=""
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />

                                {/* hover overlay */}
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:bg-black/20 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onClick={openPreview(
                                      [tpl.coverImage],
                                      tpl.name
                                    )}
                                    className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-lg shadow-black/10 backdrop-blur-md transition-transform duration-150 scale-95 group-hover:scale-100"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    预览
                                  </button>
                                </div>

                                {selected && (
                                  <div className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-500/30">
                                    <Check className="h-3.5 w-3.5" />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* More templates placeholder */}
                        <div className="group relative cursor-pointer overflow-hidden rounded-3xl bg-zinc-50 shadow-sm ring-1 ring-zinc-100 transition-all duration-150 ease-out hover:-translate-y-1 hover:scale-[1.01] hover:bg-zinc-100 hover:ring-zinc-200 active:scale-[0.99]">
                          <div className="relative aspect-[16/10] flex flex-col items-center justify-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 transition-all group-hover:scale-110">
                              <LayoutTemplate className="h-5 w-5 text-zinc-400" />
                            </div>
                            <span className="text-[12px] font-medium text-zinc-400">
                              更多模版
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.section>

                {/* Footer hint */}
                {showRegenerateHint && (
                  <motion.section
                    variants={itemVariants}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-[13px] text-amber-800 backdrop-blur-sm">
                      <Lightbulb className="h-4 w-4 text-amber-600" />
                      当前会话已有进行中的 Run，点击发送会按新配置重新生成大纲。
                    </div>
                  </motion.section>
                )}
              </motion.div>
            </ScrollArea>
          )}
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="[&>button]:hidden max-w-4xl border-0 bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">预览</DialogTitle>
          {currentPreviewImage && (
            <div className="relative">
              <img
                src={currentPreviewImage}
                alt={previewTitle}
                className="max-h-[80vh] w-full rounded-3xl object-contain shadow-2xl"
              />
              <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white">
                {previewTitle}
                {previewImages.length > 1
                  ? ` · ${previewIndex + 1}/${previewImages.length}`
                  : ""}
              </div>
              {previewImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={goPreviewPrev}
                    disabled={!canPreviewPrev}
                    className={cn(
                      "absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full text-white backdrop-blur-md transition-all",
                      canPreviewPrev
                        ? "bg-black/35 hover:bg-black/55"
                        : "bg-black/20 opacity-50 cursor-not-allowed"
                    )}
                    aria-label="上一页"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goPreviewNext}
                    disabled={!canPreviewNext}
                    className={cn(
                      "absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full text-white backdrop-blur-md transition-all",
                      canPreviewNext
                        ? "bg-black/35 hover:bg-black/55"
                        : "bg-black/20 opacity-50 cursor-not-allowed"
                    )}
                    aria-label="下一页"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-md transition-all hover:bg-black/40"
              >
                <span className="sr-only">关闭</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
