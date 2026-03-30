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

function uniqueNonEmpty(items: string[]): string[] {
  return Array.from(
    new Set(items.map((item) => item.trim()).filter(Boolean))
  );
}

function pickOne<T>(items: T[], fallback: T): T {
  if (!items.length) return fallback;
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function buildRagGuidedSuggestions(args: {
  seed: string;
  prompt: string;
  keywords: string[];
  mergedText: string;
}): string[] {
  const { seed, prompt, keywords, mergedText } = args;
  const refinedKeywords = uniqueNonEmpty(keywords).slice(0, 8);
  const focusA = refinedKeywords.slice(0, 2).join("、") || "核心概念";
  const focusB = refinedKeywords.slice(2, 5).join("、") || focusA;
  const moduleA = refinedKeywords.slice(0, 2).join(" / ") || "基础认知";
  const moduleB = refinedKeywords.slice(2, 4).join(" / ") || "重点突破";
  const moduleC = refinedKeywords.slice(4, 6).join(" / ") || "应用迁移";

  const evidenceSignals = uniqueNonEmpty(
    mergedText
      .split(/[。！？；\n]/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 10)
      .flatMap((line) => extractKeywords(line).slice(0, 2))
  ).slice(0, 4);
  const evidenceHint =
    evidenceSignals.join("、") || refinedKeywords.slice(0, 3).join("、") || "关键知识点";

  const leadIns = [
    `我准备讲“${seed}”`,
    `围绕“${seed}”这节课`,
    `请基于“${seed}”`,
    `我想把“${seed}”讲清楚`,
  ];
  const goals = [
    "先定义教学主线，再拆分知识板块",
    "先明确学生应掌握的能力，再安排教学内容",
    "先梳理概念层级，再设计课堂推进节奏",
    "先聚焦理解难点，再规划巩固路径",
  ];
  const structures = [
    "按“概念建模-典型误区-应用练习-课堂总结”组织",
    "按“问题导入-知识讲授-案例拆解-迁移训练”组织",
    "按“基础认知-重点突破-综合应用-反思复盘”组织",
    "按“学情预热-核心讲解-当堂演练-形成性评价”组织",
  ];
  const deliverables = [
    "并为每个板块写出教学目标、关键问题和课堂活动。",
    "并给出每个板块的讲解重点、提问设计与当堂检验方式。",
    "并标注每个板块学生常见卡点及教师应对策略。",
    "并输出每个板块可直接放入大纲的标题和一句话说明。",
  ];

  const dynamic = Array.from({ length: 8 }, () => {
    const lineA = pickOne(leadIns, leadIns[0]);
    const lineB = pickOne(goals, goals[0]);
    const lineC = pickOne(structures, structures[0]);
    const lineD = pickOne(deliverables, deliverables[0]);
    const focus = Math.random() > 0.5 ? focusA : `${focusA}、${focusB}`;
    return `${lineA}，请重点围绕${focus}，${lineB}，${lineC}，${lineD}`;
  });

  const focused = [
    `请把“${seed}”按知识板块拆成 4-6 个教学单元，优先覆盖 ${moduleA}、${moduleB}、${moduleC}，并说明每个单元学生要学会什么。`,
    `请结合资料里高频出现的内容（${evidenceHint}），规划“${seed}”的大纲走向：每个板块都要有“讲解重点 + 课堂任务 + 快速反馈”。`,
    `我需要“${seed}”的大纲配置提示，请按“先学什么、为何先学、如何练习、如何检查掌握”给出可直接使用的结构建议。`,
    `请把“${seed}”设计成可授课的知识路径：从基础概念到综合应用逐步推进，并为每个板块补充一个可执行课堂活动。`,
    prompt.trim()
      ? `基于我的需求“${prompt.trim()}”，请抽取最关键的知识主题并重组为可教学的大纲骨架，强调板块衔接与学习目标。`
      : `请围绕“${seed}”提炼关键知识主题，生成可直接用于大纲配置的教学骨架，突出板块衔接与学习目标。`,
  ];

  return uniqueNonEmpty([...dynamic, ...focused]);
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
      const mergedText = chunks.map((item) => item.content).join(" ");
      const keywords = extractKeywords(mergedText);
      const candidates = buildRagGuidedSuggestions({
        seed,
        prompt,
        keywords,
        mergedText,
      });

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
        `请围绕“${seed}”先明确教学方向，再拆分核心知识板块，并写出每个板块学生应达到的学习目标。`,
        `我想讲“${seed}”，请按“基础概念-重点难点-应用训练-课堂总结”给出可直接用于大纲配置的提示。`,
        "请给我一组帮助教师生成大纲的智能提示，要求每条都包含知识模块、课堂活动和当堂检验建议。",
        "请从学生理解路径出发，为这节课规划“先学什么、再练什么、最后如何评估掌握”的大纲方向。",
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
  }, [files, project?.name, projectId, prompt, selectedFileIds]);

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
