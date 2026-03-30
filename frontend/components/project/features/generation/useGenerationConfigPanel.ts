"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateApi, ragApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import {
  isSessionRunActive,
  parseActiveRunConflict,
} from "@/lib/project/generation-run-conflict";
import { useNotification } from "@/hooks/use-notification";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { OUTLINE_STYLES } from "./constants";

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
    payload?: { sessionId?: string | null; runId?: string | null }
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
    success: notifySuccess,
    error: notifyError,
    warning: notifyWarning,
    info: notifyInfo,
  } = useNotification();

  const {
    project,
    files,
    selectedFileIds,
    generationSession,
    activeSessionId,
    activeRunId,
    redraftOutline,
  } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      files: state.files,
      selectedFileIds: state.selectedFileIds,
      generationSession: state.generationSession,
      activeSessionId: state.activeSessionId,
      activeRunId: state.activeRunId,
      redraftOutline: state.redraftOutline,
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
  const hasInProgressRun =
    Boolean(
      activeRunId || extractRunIdFromSessionPayload(generationSession || null)
    ) && isSessionRunActive(generationSession?.session?.state || null);
  const suggestionRequestIdRef = useRef(0);
  const outlinePollRequestIdRef = useRef(0);
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
          runId: useProjectStore.getState().activeRunId ?? null,
        }
      );
      return;
    }
    workflowStageChangeRef.current?.("config", {
      sessionId: sessionId || null,
    });
  }, [isCreatingSession, sessionId, showOutlineEditor]);

  const styleMeta = useMemo(() => {
    const matched = OUTLINE_STYLES.find((item) => item.id === outlineStyle);
    return (
      matched ?? {
        id: outlineStyle,
        name: outlineStyle,
        desc: "结构清晰、课堂可落地",
        tone: "清晰、准确、可讲授",
      }
    );
  }, [outlineStyle]);

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
        `我需要一份 ${pageCount} 页的教学课件：先讲清核心概念，再用真实案例解释，最后加入课堂讨论与即时练习。`,
        `请输出逻辑清晰、节奏适中的课程 PPT（${pageCount} 页），每页都要有明确标题、核心内容和教师讲解提示。`,
        `做一份面向学生的教学演示（${pageCount} 页），要求视觉简洁、重点突出、知识点可复习，并包含课堂提问设计。`,
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
        `我要做一份 ${pageCount} 页课程 PPT，请按“背景-核心知识-应用-总结”组织内容。`,
        "请生成面向课堂教学的课件，每页都标注讲解重点与互动建议。",
        "请给出一套可直接授课的课件内容，兼顾逻辑性与学生理解难度。",
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

  const redraftOutlineFromConfig = useCallback(async () => {
    const latestState = useProjectStore.getState();
    const targetSessionId =
      latestState.activeSessionId ||
      latestState.generationSession?.session?.session_id ||
      null;
    if (!targetSessionId) return { ok: false as const, reason: "NO_SESSION" };

    const state = String(latestState.generationSession?.session?.state || "");
    const allowRedraft =
      state === "DRAFTING_OUTLINE" || state === "AWAITING_OUTLINE_CONFIRM";
    if (!allowRedraft) {
      return { ok: false as const, reason: "STATE_NOT_SUPPORTED", state };
    }

    const instruction = [
      "请忽略此前草案与旧配置，以本次配置为唯一依据重新生成整套大纲：",
      `- 最新用户需求（必须优先满足）：${prompt.trim()}`,
      `- 目标页数：${pageCount} 页`,
      `- 大纲风格：${styleMeta.name}（${styleMeta.id}）`,
      `- 风格说明：${styleMeta.desc}`,
      `- 表达语气：${styleMeta.tone}`,
      "- 质量要求：每页主题要和“最新用户需求”强相关，不得偏题；结构要完整，页间衔接自然。",
    ].join("\n");

    try {
      await redraftOutline(targetSessionId, instruction);
      const refreshed = useProjectStore.getState();
      const latestRunId =
        refreshed.activeRunId ||
        extractRunIdFromSessionPayload(refreshed.generationSession) ||
        null;

      setShowOutlineEditor(true);
      workflowStageChangeRef.current?.("generating_outline", {
        sessionId: targetSessionId,
        runId: latestRunId,
      });
      notifySuccess(
        "已按新配置重新生成大纲",
        "正在重新生成中，你可以在大纲页继续观察并编辑。"
      );
      return { ok: true as const };
    } catch {
      return { ok: false as const, reason: "REDRAFT_FAILED" };
    }
  }, [notifySuccess, pageCount, prompt, redraftOutline, styleMeta]);

  const resumeExistingRun = useCallback(
    async (input?: { sessionId?: string | null; runId?: string | null }) => {
      const latestState = useProjectStore.getState();
      const targetSessionId =
        input?.sessionId ||
        latestState.activeSessionId ||
        latestState.generationSession?.session?.session_id ||
        null;
      if (!targetSessionId) return false;

      const hintedRunId = input?.runId || null;
      const fallbackRunId =
        latestState.activeRunId ||
        extractRunIdFromSessionPayload(latestState.generationSession) ||
        null;
      const targetRunId = hintedRunId || fallbackRunId;

      try {
        const sessionResponse = await generateApi.getSessionSnapshot(
          targetSessionId,
          { run_id: targetRunId }
        );
        const latestSession = sessionResponse?.data ?? null;
        const latestRunId =
          extractRunIdFromSessionPayload(latestSession) || targetRunId;

        useProjectStore.setState({
          activeSessionId: targetSessionId,
          activeRunId: latestRunId,
          generationSession: latestSession,
        });
        setShowOutlineEditor(true);
        workflowStageChangeRef.current?.("outline", {
          sessionId: targetSessionId,
          runId: latestRunId,
        });
        notifyInfo(
          "已回到当前运行中的大纲",
          "当前会话已有进行中的大纲任务，需要改配置时可点击“按新配置重生成”。"
        );
        return true;
      } catch (syncError) {
        notifyError("同步运行状态失败", getErrorMessage(syncError));
        return false;
      }
    },
    [notifyError, notifyInfo]
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    if (hasInProgressRun) {
      setIsCreatingSession(true);
      try {
        const redraftResult = await redraftOutlineFromConfig();
        if (redraftResult.ok) return;

        const resumed = await resumeExistingRun();
        if (!resumed && redraftResult.reason === "STATE_NOT_SUPPORTED") {
          notifyWarning(
            "当前阶段暂不支持重开",
            "任务已进入内容生成或渲染阶段，后端暂不支持中断后按新配置重开，已为你保持当前任务。"
          );
        }
      } finally {
        setIsCreatingSession(false);
      }
      return;
    }

    const requestId = ++outlinePollRequestIdRef.current;
    setIsCreatingSession(true);

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
      const initialRunId =
        useProjectStore.getState().activeRunId ||
        extractRunIdFromSessionPayload(
          useProjectStore.getState().generationSession
        );

      setShowOutlineEditor(true);
      workflowStageChangeRef.current?.("outline", {
        sessionId: sessionIdFromStore,
        runId: initialRunId,
      });

      void (async () => {
        const maxAttempts = 60;
        const intervalMs = 2000;
        let outlineReady = false;
        let outlineIncomplete = false;
        let lastSessionState: string | undefined;

        try {
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            if (outlinePollRequestIdRef.current !== requestId) return;

            const targetRunId =
              initialRunId || useProjectStore.getState().activeRunId || null;
            const sessionResponse = await generateApi.getSessionSnapshot(
              sessionIdFromStore,
              { run_id: targetRunId }
            );
            const latestSession = sessionResponse?.data ?? null;
            const state = latestSession?.session?.state;
            const currentPages = latestSession?.outline?.nodes?.length || 0;
            const targetPages = Number(
              latestSession?.options?.pages || pageCount
            );
            const latestRunId =
              targetRunId || extractRunIdFromSessionPayload(latestSession);

            useProjectStore.setState({
              generationSession: latestSession,
              activeRunId: latestRunId,
            });
            lastSessionState = state;

            if (state === "AWAITING_OUTLINE_CONFIRM") {
              outlineReady = currentPages > 0;
              outlineIncomplete = targetPages > 0 && currentPages < targetPages;
              if (outlineReady) {
                break;
              }
            }

            if (
              state === "GENERATING_CONTENT" ||
              state === "RENDERING" ||
              state === "SUCCESS"
            ) {
              outlineReady = currentPages > 0;
              outlineIncomplete = targetPages > 0 && currentPages < targetPages;
              if (outlineReady) {
                break;
              }
            }

            if (state === "FAILED") {
              notifyError(
                "大纲生成失败",
                latestSession?.session?.state_reason || "请稍后重试。"
              );
              break;
            }

            await wait(intervalMs);
          }

          if (
            !outlineReady &&
            lastSessionState &&
            lastSessionState !== "FAILED"
          ) {
            notifyInfo(
              "大纲仍在生成中",
              `当前状态：${lastSessionState}，可继续在大纲编辑页等待。`
            );
          }

          if (outlineIncomplete) {
            notifyInfo(
              "大纲正在补齐页数",
              "可留在大纲页继续编辑，剩余页面会继续生成。"
            );
          }
        } catch (error) {
          if (outlinePollRequestIdRef.current !== requestId) return;
          const message =
            error instanceof Error
              ? error.message
              : "Failed to sync outline state.";
          notifyError("大纲状态同步失败", message);
        } finally {
          if (outlinePollRequestIdRef.current === requestId) {
            setIsCreatingSession(false);
          }
        }
      })();
    } catch (error) {
      const conflict = parseActiveRunConflict(error);
      if (conflict) {
        const redraftResult = await redraftOutlineFromConfig();
        if (!redraftResult.ok) {
          const resumed = await resumeExistingRun({
            sessionId: conflict.sessionId,
            runId: conflict.runId,
          });
          if (resumed) {
            setIsCreatingSession(false);
            return;
          }
        } else {
          setIsCreatingSession(false);
          return;
        }
      }
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create generation session.";
      notifyError("启动生成失败", message);
      setShowOutlineEditor(false);
      setIsCreatingSession(false);
    }
  }, [
    hasInProgressRun,
    notifyError,
    notifyInfo,
    notifyWarning,
    onGenerate,
    outlineStyle,
    pageCount,
    prompt,
    redraftOutlineFromConfig,
    resumeExistingRun,
  ]);

  const handleGoToPreview = useCallback(() => {
    if (!projectId || !sessionId) return;

    const latestState = useProjectStore.getState();
    const latestRunId =
      latestState.activeRunId ||
      extractRunIdFromSessionPayload(latestState.generationSession);

    workflowStageChangeRef.current?.("preview", {
      sessionId: sessionId || null,
      runId: latestRunId,
    });

    const query = latestRunId
      ? `session=${sessionId}&run=${latestRunId}`
      : `session=${sessionId}`;
    router.push(`/projects/${projectId}/generate?${query}`);
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
    hasInProgressRun,
    showOutlineEditor,
    setShowOutlineEditor,
    sessionId,
    pageLabel,
    generateSuggestionBatch,
    handleGenerate,
    handleGoToPreview,
  };
}

