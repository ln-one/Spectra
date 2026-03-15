"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Lightbulb,
  RefreshCw,
  Sparkles,
  LayoutTemplate,
  FileText,
  Wand2,
  ArrowRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ragApi } from "@/lib/sdk/rag";
import { generateApi } from "@/lib/sdk/generate";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { OutlineEditorPanel } from "./OutlineEditorPanel";

const PAGE_PRESETS = [8, 12, 16, 20, 24];

const OUTLINE_STYLES = [
  {
    id: "structured",
    name: "结构清晰型",
    desc: "总-分-总，强调逻辑层次",
    tone: "严谨、清晰、循序渐进",
  },
  {
    id: "story",
    name: "叙事引导型",
    desc: "用情境和故事引入知识点",
    tone: "生动、有代入感、循序揭秘",
  },
  {
    id: "problem",
    name: "问题驱动型",
    desc: "以问题链推动学习",
    tone: "启发式、探究式、重思考",
  },
  {
    id: "workshop",
    name: "实操工作坊型",
    desc: "案例 + 练习 + 复盘",
    tone: "实战导向、步骤明确、可落地",
  },
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 28 },
  },
};

interface GenerationConfigPanelProps {
  variant?: "default" | "compact";
  onBack?: () => void;
  onGenerate?: (config: GenerationConfig) => Promise<void> | void;
}

export interface GenerationConfig {
  prompt: string;
  pageCount: number;
  outlineStyle: "structured" | "story" | "problem" | "workshop";
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  copy.sort(() => Math.random() - 0.5);
  return copy.slice(0, count);
}

function extractKeywords(input: string): string[] {
  return input
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 12)
    .slice(0, 8);
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function GenerationConfigPanel({
  variant = "default",
  onGenerate,
}: GenerationConfigPanelProps) {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const { project, files, selectedFileIds, generationSession } =
    useProjectStore();

  const [prompt, setPrompt] = useState("");
  const [pageCount, setPageCount] = useState<number>(12);
  const [outlineStyle, setOutlineStyle] =
    useState<GenerationConfig["outlineStyle"]>("structured");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showOutlineEditor, setShowOutlineEditor] = useState(false);

  const compact = variant === "compact";
  const defaultAspectRatio = "16:9";
  const pageLabel = useMemo(() => {
    if (pageCount <= 10) return "简洁版";
    if (pageCount <= 16) return "标准版";
    if (pageCount <= 20) return "深入版";
    return "完整讲授版";
  }, [pageCount]);

  const sessionId = generationSession?.session?.session_id || "";

  const generateSuggestionBatch = useCallback(async () => {
    if (!projectId) return;
    setLoadingSuggestions(true);
    try {
      const readyFiles = files
        .filter((f) => f.status === "ready")
        .map((f) => f.id);
      const filters =
        selectedFileIds.length > 0
          ? { file_ids: selectedFileIds }
          : readyFiles.length > 0
            ? { file_ids: readyFiles }
            : undefined;

      const seed = prompt.trim() || project?.name || "本课程主题";
      const ragResponse = await ragApi.search({
        project_id: projectId,
        query: `${seed} 教学目标 核心概念 课堂应用`,
        top_k: 8,
        filters,
      });

      const chunks = ragResponse?.data?.results || [];
      const sourceHints = chunks
        .map((item) => item.source?.filename)
        .filter(Boolean)
        .slice(0, 3)
        .join("、");

      const mergedText = chunks.map((item) => item.content).join(" ");
      const keywords = extractKeywords(mergedText);
      const topic =
        keywords.slice(0, 3).join(" / ") ||
        (prompt.trim() ? prompt.trim().slice(0, 20) : "核心知识");

      const candidates = [
        `围绕「${seed}」，生成 ${pageCount} 页 ${defaultAspectRatio} 比例PPT大纲，采用“先问题后结论”的讲解节奏，重点覆盖：${topic}。`,
        `请基于项目资料${sourceHints ? `（参考：${sourceHints}）` : ""}，设计一套${pageCount}页的课堂讲授PPT，包含导入、概念讲解、案例练习、课堂总结四段结构。`,
        `生成一个“知识地图 + 关键例题 + 易错点澄清”风格的大纲，页数 ${pageCount} 页，强调课堂互动提问与板书逻辑。`,
        `请根据当前RAG资料提炼主线，输出 ${pageCount} 页可直接讲授的大纲，要求每页有标题、讲解目标、教师提示语，画幅比例 ${defaultAspectRatio}。`,
        `为「${seed}」生成一版探究式教学大纲：从真实场景提出问题，再引导概念建构与应用迁移，页数 ${pageCount}。`,
        `以“课堂可落地”为目标生成PPT大纲：每个章节包含知识点、学生任务、评价方式，优先引用当前项目资料中的核心术语。`,
      ];

      setSuggestions(pickRandom(candidates, 4));
    } catch {
      const seed = prompt.trim() || project?.name || "课程主题";
      setSuggestions([
        `请围绕「${seed}」生成一版完整授课PPT大纲（导入-讲解-练习-总结）。`,
        `请生成一版问题驱动型大纲，突出核心概念、易错点和课堂提问。`,
        `请生成一版案例导向型大纲，每章附一个教学案例与讨论任务。`,
        `请生成一版可直接授课的大纲，每页包含标题和讲解要点。`,
      ]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [
    projectId,
    files,
    selectedFileIds,
    prompt,
    project?.name,
    pageCount,
    defaultAspectRatio,
  ]);

  useEffect(() => {
    void generateSuggestionBatch();
  }, [generateSuggestionBatch]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setShowOutlineEditor(false);
    setIsCreatingSession(true);
    try {
      await onGenerate?.({
        prompt: prompt.trim(),
        pageCount,
        outlineStyle,
      });

      const sessionIdFromStore =
        useProjectStore.getState().generationSession?.session?.session_id;
      if (!sessionIdFromStore) {
        throw new Error("generation session was not created");
      }

      // 暂不支持大纲流式返回：等待后端进入待确认状态后再进入编辑器
      const maxAttempts = 60;
      const intervalMs = 2000;
      let outlineReady = false;
      let outlineIncomplete = false;
      let lastSessionState: string | undefined;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const sessionResponse =
          await generateApi.getSession(sessionIdFromStore);
        const latestSession = sessionResponse?.data ?? null;
        const state = latestSession?.session?.state;
        const currentPages = latestSession?.outline?.nodes?.length || 0;
        const targetPages = Number(latestSession?.options?.pages || pageCount);
        useProjectStore.setState({ generationSession: latestSession });
        lastSessionState = state;

        if (state === "AWAITING_OUTLINE_CONFIRM") {
          outlineReady = true;
          outlineIncomplete = targetPages > 0 && currentPages < targetPages;
          break;
        }
        if (
          state === "GENERATING_CONTENT" ||
          state === "RENDERING" ||
          state === "SUCCESS"
        ) {
          router.push(
            `/projects/${projectId}/generate?session=${sessionIdFromStore}`
          );
          return;
        }
        if (state === "FAILED") {
          toast({
            title: "大纲生成失败",
            description: latestSession?.session?.state_reason || "请稍后重试",
            variant: "destructive",
          });
          break;
        }

        await wait(intervalMs);
      }

      if (!outlineReady) {
        toast({
          title: "大纲尚未完整生成",
          description: lastSessionState
            ? `当前状态：${lastSessionState}，请稍后重试`
            : "当前会话还未达到目标页数，请稍后重试",
          variant: "destructive",
        });
        return;
      }
      if (outlineIncomplete) {
        toast({
          title: "大纲页数未达标",
          description: "已进入编辑页，可手动补充或稍后重试生成",
        });
      }
      setShowOutlineEditor(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "创建会话失败，请稍后重试";
      toast({
        title: "生成流程启动失败",
        description: message,
        variant: "destructive",
      });
      setShowOutlineEditor(false);
    } finally {
      setIsCreatingSession(false);
    }
  }, [onGenerate, prompt, pageCount, outlineStyle, router, projectId]);

  const handleGoToPreview = useCallback(() => {
    if (!projectId || !sessionId) return;
    router.push(`/projects/${projectId}/generate?session=${sessionId}`);
  }, [projectId, router, sessionId]);

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
                  <Badge
                    variant="secondary"
                    className="ml-auto bg-zinc-100 text-zinc-700"
                  >
                    Step 1 / 2
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-600">
                      提示词
                    </label>
                    <span className="text-[11px] text-zinc-400">
                      {prompt.length}/1200
                    </span>
                  </div>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
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
                    <RefreshCw
                      className={cn(
                        "w-3.5 h-3.5 mr-1",
                        loadingSuggestions && "animate-spin"
                      )}
                    />
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
                  {loadingSuggestions && suggestions.length === 0 && (
                    <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-500">
                      正在结合当前项目资料生成推荐提示词...
                    </div>
                  )}
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
                      {pageCount} 页 · {pageLabel}
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
                        <p className="text-xs font-medium text-zinc-800">
                          {style.name}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {style.desc}
                        </p>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          <motion.section variants={itemVariants} className="pb-1">
            <Button
              onClick={handleGenerate}
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
        {showOutlineEditor && (
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
        )}
      </AnimatePresence>
    </div>
  );
}
