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

function extractRunIdFromSessionPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const currentRun = (payload as { current_run?: { run_id?: unknown } })
    .current_run;
  const runId = currentRun?.run_id;
  return typeof runId === "string" && runId.trim() ? runId : null;
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
  resumeStage?: "config" | "outline" | null;
  resumeSignal?: number;
  onWorkflowStageChange?: (
    stage: "config" | "generating_outline" | "outline" | "preview",
    payload?: { sessionId?: string | null }
  ) => void;
}

export function useGenerationConfigPanel({
  onGenerate,
  resumeStage,
  resumeSignal,
  onWorkflowStageChange,
}: UseGenerationConfigPanelArgs) {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const {
    project,
    files,
    selectedFileIds,
    generationSession,
    activeSessionId,
    activeRunId,
  } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      files: state.files,
      selectedFileIds: state.selectedFileIds,
      generationSession: state.generationSession,
      activeSessionId: state.activeSessionId,
      activeRunId: state.activeRunId,
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

  const sessionId =
    activeSessionId || generationSession?.session?.session_id || "";
  const currentRunId =
    activeRunId || extractRunIdFromSessionPayload(generationSession);

  const suggestionRequestIdRef = useRef(0);
  const workflowStageChangeRef = useRef(onWorkflowStageChange);

  useEffect(() => {
    workflowStageChangeRef.current = onWorkflowStageChange;
  }, [onWorkflowStageChange]);

  useEffect(() => {
    if (!resumeStage) return;
    setShowOutlineEditor(resumeStage === "outline");
  }, [resumeSignal, resumeStage]);

  useEffect(() => {
    if (showOutlineEditor) {
      workflowStageChangeRef.current?.(
        isCreatingSession ? "generating_outline" : "outline",
        {
          sessionId: sessionId || null,
        }
      );
      return;
    }
    workflowStageChangeRef.current?.("config", {
      sessionId: sessionId || null,
    });
  }, [isCreatingSession, sessionId, showOutlineEditor]);

  const pageLabel = useMemo(() => {
    if (pageCount <= 10) return "精简";
    if (pageCount <= 16) return "均衡";
    if (pageCount <= 20) return "深入";
    return "完整";
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

      const seed = prompt.trim() || project?.name || "课堂教学";
      const ragResponse = await ragApi.search({
        project_id: projectId,
        query: `${seed} 课程目标 核心知识点 教学活动 课堂互动`,
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
        (prompt.trim() ? prompt.trim().slice(0, 20) : "课程主题");

      const candidates = [
        `围绕“${seed}”生成 ${pageCount} 页 16:9 课堂 PPT，突出教学目标、关键概念、案例演示与课堂互动，重点覆盖：${topic}。`,
        `请基于资料${sourceHints ? `（参考：${sourceHints}）` : ""}设计 ${pageCount} 页课件，结构包含导入、讲授、练习和总结，并给出每页讲解要点。`,
        `我需要一份${pageCount}页的教学课件：先讲清核心概念，再用真实案例解释，最后加入课堂讨论与即时练习。`,
        `请输出逻辑清晰、节奏适中的课程 PPT（${pageCount}页），每页都要有明确标题、核心内容和教师讲解提示。`,
        `做一份面向学生的教学演示（${pageCount}页），要求视觉简洁、重点突出、知识点可复习，并包含课堂提问设计。`,
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
      const fallback = [
        `请围绕“${seed}”生成一份结构化教学课件，包含导入、知识讲解、案例和课堂练习。`,
        `我要做一份${pageCount}页课程 PPT，请按“背景-核心知识-应用-总结”组织内容。`,
        `请生成面向课堂教学的课件，每页都标注讲解重点与互动建议。`,
        `请给出一套可直接授课的课件内容，兼顾逻辑性与学生理解难度。`,
      ];
      setSuggestions((prev) => {
        if (
          prev.length === fallback.length &&
          prev.every((item, idx) => item === fallback[idx])
        ) {
          return prev;
        }
        return fallback;
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

    setIsCreatingSession(true);
    workflowStageChangeRef.current?.("generating_outline", {
      sessionId: sessionId || null,
    });

    try {
      const creationResult = await onGenerate?.({
        prompt: prompt.trim(),
        pageCount,
        outlineStyle,
      });

      const sessionIdFromCallback =
        typeof creationResult === "string" ? creationResult : null;
      if (!sessionIdFromCallback) {
        throw new Error("generation session was not created");
      }

      const sessionIdFromStore = sessionIdFromCallback;
      setShowOutlineEditor(true);
      workflowStageChangeRef.current?.("generating_outline", {
        sessionId: sessionIdFromStore,
      });

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
        const latestRunId = extractRunIdFromSessionPayload(latestSession);

        useProjectStore.setState({
          generationSession: latestSession,
          activeRunId: latestRunId,
        });
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
          workflowStageChangeRef.current?.("preview", {
            sessionId: sessionIdFromStore,
          });
          const previewQuery = latestRunId
            ? `session=${sessionIdFromStore}&run=${latestRunId}`
            : `session=${sessionIdFromStore}`;
          router.push(`/projects/${projectId}/generate?${previewQuery}`);
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
          title: "等待大纲超时",
          description: lastSessionState
            ? `当前状态为 ${lastSessionState}，请稍后重试。`
            : "暂未拿到大纲内容，请稍后重试。",
          variant: "destructive",
        });
        return;
      }

      if (outlineIncomplete) {
        toast({
          title: "大纲页数偏少",
          description: "已进入编辑页，你可以继续补全每一页内容。",
        });
      }

      workflowStageChangeRef.current?.("outline", {
        sessionId: sessionIdFromStore,
      });
      setShowOutlineEditor(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "创建生成会话失败，请稍后重试";
      toast({
        title: "创建课件任务失败",
        description: message,
        variant: "destructive",
      });
      setShowOutlineEditor(false);
    } finally {
      setIsCreatingSession(false);
    }
  }, [
    onGenerate,
    outlineStyle,
    pageCount,
    projectId,
    prompt,
    router,
    sessionId,
  ]);

  const handleGoToPreview = useCallback(() => {
    if (!projectId || !sessionId) return;

    workflowStageChangeRef.current?.("preview", {
      sessionId: sessionId || null,
    });

    const query = currentRunId
      ? `session=${sessionId}&run=${currentRunId}`
      : `session=${sessionId}`;
    router.push(`/projects/${projectId}/generate?${query}`);
  }, [currentRunId, projectId, router, sessionId]);

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
