"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateApi, ragApi } from "@/lib/sdk";
import { toast } from "@/hooks/use-toast";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";

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

export interface GenerationConfig {
  prompt: string;
  pageCount: number;
  outlineStyle: "structured" | "story" | "problem" | "workshop";
}

interface UseGenerationConfigPanelArgs {
  onGenerate?: (
    config: GenerationConfig
  ) => Promise<string | void | null> | string | void | null;
}

export function useGenerationConfigPanel({
  onGenerate,
}: UseGenerationConfigPanelArgs) {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { project, files, selectedFileIds, generationSession } =
    useProjectStore(
      useShallow((state) => ({
        project: state.project,
        files: state.files,
        selectedFileIds: state.selectedFileIds,
        generationSession: state.generationSession,
      }))
    );

  const [prompt, setPrompt] = useState("");
  const [pageCount, setPageCount] = useState<number>(12);
  const [outlineStyle, setOutlineStyle] =
    useState<GenerationConfig["outlineStyle"]>("structured");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showOutlineEditor, setShowOutlineEditor] = useState(false);
  const sessionId = generationSession?.session?.session_id || "";
  const suggestionRequestIdRef = useRef(0);

  const pageLabel = useMemo(() => {
    if (pageCount <= 10) return "简洁版";
    if (pageCount <= 16) return "标准版";
    if (pageCount <= 20) return "深入版";
    return "完整讲授版";
  }, [pageCount]);

  const generateSuggestionBatch = useCallback(async () => {
    if (!projectId) return;
    setLoadingSuggestions(true);
    try {
      const readyFiles = files
        .filter((file) => file.status === "ready")
        .map((file) => file.id);
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
        top_k: 5,
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
        `围绕“${seed}”，生成 ${pageCount} 页 16:9 比例 PPT 大纲，采用“先问题后结论”的讲解节奏，重点覆盖：${topic}。`,
        `请基于项目资料${sourceHints ? `（参考：${sourceHints}）` : ""}设计一套 ${pageCount} 页课堂讲授 PPT，包含导入、概念讲解、案例练习、课堂总结四段结构。`,
        `生成“知识地图 + 关键例题 + 易错点澄清”风格大纲，页数 ${pageCount} 页，强调课堂互动提问与板书逻辑。`,
        `请根据当前 RAG 资料提炼主线，输出 ${pageCount} 页可直接授课的大纲，要求每页有标题、讲解目标、教师提示语。`,
        `以“课堂可落地”为目标生成 PPT 大纲：每一章节包含知识点、学生任务、评价方式，优先引用项目资料中的核心术语。`,
      ];
      setSuggestions((prev) => {
        const next = pickRandom(candidates, 4);
        if (
          prev.length === next.length &&
          prev.every((item, idx) => item === next[idx])
        ) {
          return prev;
        }
        return next;
      });
    } catch {
      const seed = prompt.trim() || project?.name || "课程主题";
      setSuggestions((prev) => {
        const next = [
          `请围绕“${seed}”生成一版完整授课 PPT 大纲（导入-讲解-练习-总结）。`,
          "请生成一版问题驱动型大纲，突出核心概念、易错点和课堂提问。",
          "请生成一版案例导向型大纲，每章附一个教学案例与讨论任务。",
          "请生成一版可直接授课的大纲，每页包含标题和讲解要点。",
        ];
        if (
          prev.length === next.length &&
          prev.every((item, idx) => item === next[idx])
        ) {
          return prev;
        }
        return next;
      });
    } finally {
      setLoadingSuggestions(false);
    }
  }, [files, pageCount, project?.name, projectId, prompt, selectedFileIds]);

  useEffect(() => {
    const requestId = ++suggestionRequestIdRef.current;
    const timer = window.setTimeout(async () => {
      if (requestId !== suggestionRequestIdRef.current) return;
      await generateSuggestionBatch();
    }, 450);
    return () => {
      window.clearTimeout(timer);
    };
  }, [generateSuggestionBatch]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setShowOutlineEditor(false);
    setIsCreatingSession(true);
    try {
      const creationResult = await onGenerate?.({
        prompt: prompt.trim(),
        pageCount,
        outlineStyle,
      });

      const sessionIdFromCallback =
        typeof creationResult === "string" ? creationResult : null;
      const sessionIdFromStore =
        sessionIdFromCallback ||
        useProjectStore.getState().generationSession?.session?.session_id;
      if (!sessionIdFromStore) {
        throw new Error("generation session was not created");
      }

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
          description: "已进入编辑页，可手动补充或稍后重试生成。",
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
  }, [onGenerate, outlineStyle, pageCount, projectId, prompt, router]);

  const handleGoToPreview = useCallback(() => {
    if (!projectId || !sessionId) return;
    router.push(`/projects/${projectId}/generate?session=${sessionId}`);
  }, [projectId, router, sessionId]);

  return {
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
  };
}
