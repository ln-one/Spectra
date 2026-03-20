"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
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
}

export { type GenerationConfig } from "./useGenerationConfigPanel";

export function GenerationConfigPanel({
  variant = "default",
  onGenerate,
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
    sessionId,
    pageLabel,
    generateSuggestionBatch,
    handleGenerate,
    handleGoToPreview,
  } = useGenerationConfigPanel({ onGenerate });

  return (
    <div className="relative h-full min-h-0">
      <ScrollArea className="h-full min-h-0 pr-2">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className={cn("space-y-4 pb-4", compact ? "pt-1" : "pt-3")}
        >
          <motion.section variants={itemVariants}>
            <Card className="border-zinc-200/70 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wand2 className="w-4 h-4 text-zinc-700" />
                  生成前配置
                  <Badge variant="secondary" className="ml-auto bg-zinc-100 text-zinc-700">
                    Step 1 / 2
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-600">提示词</label>
                    <span className="text-[11px] text-zinc-400">{prompt.length}/1200</span>
                  </div>
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="例如：生成一份《图形显示设备》教学PPT，面向大二学生，要求理论讲解+案例分析+课堂讨论。"
                    className="min-h-[110px] resize-none rounded-xl border-zinc-200 bg-white text-sm shadow-inner focus-visible:ring-zinc-400/40"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.section>

          <motion.section variants={itemVariants}>
            <Card className="border-zinc-200/70 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  大纲提示词推荐
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-xs text-zinc-500"
                    onClick={() => void generateSuggestionBatch()}
                    disabled={loadingSuggestions}
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5 mr-1", loadingSuggestions && "animate-spin")} />
                    换一批
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2">
                  {suggestions.map((item, idx) => (
                    <motion.button
                      key={`${item}-${idx}`}
                      whileHover={{ y: -2, scale: 1.003 }}
                      whileTap={{ scale: 0.997 }}
                      onClick={() => setPrompt(item)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-left text-xs text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
                    >
                      {item}
                    </motion.button>
                  ))}
                  {loadingSuggestions && suggestions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-500">
                      正在结合当前项目资料生成推荐提示词...
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </motion.section>

          <motion.section variants={itemVariants}>
            <Card className="border-zinc-200/70 bg-white shadow-sm">
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                    <FileText className="w-3.5 h-3.5 text-zinc-500" />
                    页数选择
                    <Badge variant="outline" className="ml-auto text-[11px]">
                      {pageCount} 页 路 {pageLabel}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {PAGE_PRESETS.map((value) => (
                      <button
                        key={value}
                        onClick={() => setPageCount(value)}
                        className={cn(
                          "rounded-lg border px-2 py-1.5 text-xs transition-all",
                          pageCount === value
                            ? "border-zinc-700 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300"
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                    <LayoutTemplate className="w-3.5 h-3.5 text-zinc-500" />
                    大纲风格
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {OUTLINE_STYLES.map((style) => (
                      <motion.button
                        key={style.id}
                        whileHover={{ y: -1 }}
                        onClick={() => setOutlineStyle(style.id)}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-left transition-all",
                          outlineStyle === style.id
                            ? "border-zinc-400 bg-zinc-100 shadow-sm"
                            : "border-zinc-200 bg-zinc-50/70 hover:border-zinc-300"
                        )}
                      >
                        <p className="text-xs font-medium text-zinc-800">{style.name}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{style.desc}</p>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          <motion.section variants={itemVariants} className="pb-1">
            <Button
              onClick={() => void handleGenerate()}
              disabled={!prompt.trim() || isCreatingSession}
              className={cn(
                "w-full h-11 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-50 shadow-sm transition-all hover:bg-zinc-800 hover:shadow-md",
                (!prompt.trim() || isCreatingSession) && "opacity-70"
              )}
            >
              {isCreatingSession ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  正在创建生成任务...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  生成大纲
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
            <p className="text-[11px] text-zinc-500 text-center mt-2">
              点击后将进入大纲编辑页，并实时等待大纲生成结果
            </p>
          </motion.section>
        </motion.div>
      </ScrollArea>

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
              isBootstrapping={isCreatingSession && !sessionId}
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
