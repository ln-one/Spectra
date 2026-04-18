"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateApi, ragApi } from "@/lib/sdk";
import { useNotification } from "@/hooks/use-notification";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { LAYOUT_MODES, TEMPLATE_CARDS } from "./constants";

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

function uniqueNonEmpty(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
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
  const focusA = refinedKeywords.slice(0, 2).join(", ") || "core concepts";
  const focusB = refinedKeywords.slice(2, 5).join(", ") || focusA;
  const evidenceSignals = uniqueNonEmpty(
    mergedText
      .split(/[.!?;\n]/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 10)
      .flatMap((line) => extractKeywords(line).slice(0, 2))
  ).slice(0, 4);
  const evidenceHint = evidenceSignals.join(", ") || focusA;

  const starters = [
    `Build an outline for "${seed}" with clear concept progression.`,
    `Design a lesson deck around "${seed}" for classroom delivery.`,
    `Create a teachable slide outline for "${seed}".`,
  ];
  const structures = [
    "Use this structure: concept intro -> worked example -> guided practice -> recap.",
    "Use this structure: question hook -> explanation -> activity -> quick check.",
    "Use this structure: foundations -> key difficulties -> transfer application -> summary.",
  ];
  const constraints = [
    `Prioritize: ${focusA}.`,
    `Also cover: ${focusB}.`,
    `Reference evidence from materials: ${evidenceHint}.`,
  ];

  const dynamic = Array.from({ length: 6 }, () => {
    const start = pickOne(starters, starters[0]);
    const structure = pickOne(structures, structures[0]);
    return `${start} ${structure} ${constraints.join(" ")}`;
  });

  const focused = [
    `Split "${seed}" into 4-6 modules, each with objective, key point, and check question.`,
    `Output slide-ready section titles and one-line teaching intent for each section.`,
    prompt.trim()
      ? `Incorporate this user request as first priority: ${prompt.trim()}.`
      : `Keep the outline practical, concise, and classroom-ready.`,
  ];

  return uniqueNonEmpty([...dynamic, ...focused]);
}

function resolveExpectedPages(options: unknown): number {
  if (!options || typeof options !== "object") return 0;
  const sessionOptions = options as {
    pages?: unknown;
    target_slide_count?: unknown;
    page_count?: unknown;
  };
  const raw =
    sessionOptions.pages ??
    sessionOptions.target_slide_count ??
    sessionOptions.page_count;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export interface GenerationConfig {
  prompt: string;
  pageCount: number;
  outlineStyle: "structured" | "story" | "problem" | "workshop";
  visualStyle: string;
  layoutMode: "smart" | "classic";
  templateId: string | null;
  visualPolicy: "auto" | "media_required" | "basic_graphics_only";
}

interface UseGenerationConfigPanelArgs {
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

export function useGenerationConfigPanel({
  onGenerate,
  resumeStage,
  resumeSignal,
  onWorkflowStageChange,
}: UseGenerationConfigPanelArgs) {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { error: notifyError, info: notifyInfo } = useNotification();

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
  const [visualStyle, setVisualStyle] = useState<string>("free");
  const [visualPolicy, setVisualPolicy] = useState<
    "auto" | "media_required" | "basic_graphics_only"
  >("auto");
  const [layoutMode, setLayoutMode] = useState<"smart" | "classic">("smart");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    TEMPLATE_CARDS[0].id
  );
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showOutlineEditor, setShowOutlineEditor] = useState(false);
  const [showRegenerateHint, setShowRegenerateHint] = useState(false);

  useEffect(() => {
    const mapping = LAYOUT_MODES.find((m) => m.id === layoutMode);
    if (mapping) {
      setOutlineStyle(mapping.outlineStyle as GenerationConfig["outlineStyle"]);
    }
  }, [layoutMode]);

  useEffect(() => {
    if (layoutMode === "classic") {
      const isTemplate = TEMPLATE_CARDS.some((t) => t.id === visualStyle);
      if (!isTemplate) {
        setVisualStyle(selectedTemplateId);
      }
    } else {
      const isStyle =
        visualStyle &&
        [
          "free",
          "academic",
          "minimal",
          "professional",
          "botanical",
          "wabi",
          "memphis",
          "constructivism",
          "brutalist",
          "8bit",
          "electro",
          "geometric",
          "morandi",
          "nordic",
          "fluid",
          "cinema",
          "coolblue",
          "warmvc",
          "modernacademic",
          "curatorial",
        ].includes(visualStyle);
      if (!isStyle) {
        setVisualStyle("free");
      }
    }
  }, [layoutMode, selectedTemplateId, visualStyle]);

  const sessionId =
    activeSessionId || generationSession?.session?.session_id || "";
  const suggestionRequestIdRef = useRef(0);
  const outlinePollRequestIdRef = useRef(0);
  const workflowStageChangeRef = useRef(onWorkflowStageChange);

  useEffect(() => {
    workflowStageChangeRef.current = onWorkflowStageChange;
  }, [onWorkflowStageChange]);

  useEffect(() => {
    if (!resumeStage) return;
    if (resumeStage === "outline") {
      setShowOutlineEditor(true);
      return;
    }
    setShowOutlineEditor(false);
    setShowRegenerateHint(false);
  }, [resumeSignal, resumeStage]);

  useEffect(() => {
    if (showOutlineEditor) {
      workflowStageChangeRef.current?.(
        isCreatingSession ? "generating_outline" : "outline",
        {
          sessionId: sessionId || null,
          runId: activeRunId ?? null,
        }
      );
      return;
    }
    workflowStageChangeRef.current?.("config", {
      sessionId: sessionId || null,
    });
  }, [activeRunId, isCreatingSession, sessionId, showOutlineEditor]);

  const pageLabel = useMemo(() => {
    if (pageCount <= 10) return "Concise";
    if (pageCount <= 16) return "Balanced";
    if (pageCount <= 20) return "Detailed";
    return "Full";
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

      const seed = prompt.trim() || project?.name || "classroom lesson";
      const ragResponse = await ragApi.search({
        project_id: projectId,
        query: `${seed} learning goals core concepts teaching activities classroom interaction`,
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
      const seed = prompt.trim() || project?.name || "lesson topic";
      const fallback = [
        `Clarify teaching direction for "${seed}", then split core knowledge modules and learning goals.`,
        `Organize "${seed}" as: foundation -> difficult points -> application -> recap.`,
        "Generate outline prompts that include modules, classroom activities, and quick checks.",
        "Plan progression as learn first, practice second, evaluate mastery last.",
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

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    const requestId = ++outlinePollRequestIdRef.current;
    setIsCreatingSession(true);

    try {
      const creationResult = await onGenerate?.({
        prompt: prompt.trim(),
        pageCount,
        outlineStyle,
        visualStyle,
        layoutMode,
        templateId: layoutMode === "classic" ? selectedTemplateId : null,
        visualPolicy,
      });

      const sessionIdFromCallback =
        creationResult &&
        typeof creationResult === "object" &&
        typeof creationResult.sessionId === "string"
          ? creationResult.sessionId.trim()
          : "";
      const runIdFromCallback =
        creationResult &&
        typeof creationResult === "object" &&
        typeof creationResult.runId === "string"
          ? creationResult.runId.trim()
          : "";
      if (!sessionIdFromCallback || !runIdFromCallback) {
        throw new Error("generation run was not created");
      }

      const sessionIdFromStore = sessionIdFromCallback;
      useProjectStore.setState({
        activeSessionId: sessionIdFromStore,
        activeRunId: runIdFromCallback,
      });

      // Enter outline panel immediately after run binding.
      setShowOutlineEditor(true);
      workflowStageChangeRef.current?.("generating_outline", {
        sessionId: sessionIdFromStore,
        runId: runIdFromCallback,
      });

      try {
        const sessionSnapshotResponse = await generateApi.getSessionSnapshot(
          sessionIdFromStore,
          { run_id: runIdFromCallback }
        );
        const runScopedSnapshot = sessionSnapshotResponse?.data ?? null;
        if (runScopedSnapshot) {
          useProjectStore.setState({
            generationSession: runScopedSnapshot,
            activeSessionId: sessionIdFromStore,
            activeRunId: runIdFromCallback,
          });
        }
      } catch {
        // Keep run binding and let run-scoped polling continue syncing snapshot.
      }

      void (async () => {
        const maxAttempts = 60;
        const intervalMs = 2000;
        let outlineReady = false;
        let outlineIncomplete = false;
        let lastSessionState: string | undefined;
        let transientPollErrorCount = 0;

        try {
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            if (outlinePollRequestIdRef.current !== requestId) return;

            let latestSession: any = null;
            try {
              const sessionResponse = await generateApi.getSessionSnapshot(
                sessionIdFromStore,
                { run_id: runIdFromCallback }
              );
              latestSession = sessionResponse?.data ?? null;
            } catch (snapshotError) {
              const snapshotMessage =
                snapshotError instanceof Error
                  ? snapshotError.message
                  : String(snapshotError || "");
              const lowerSnapshotMessage = snapshotMessage.toLowerCase();
              const isTransientSnapshotRace =
                lowerSnapshotMessage.includes("state_reason_event_mismatch") ||
                lowerSnapshotMessage.includes("state_event_mismatch") ||
                (lowerSnapshotMessage.includes("state_reason") &&
                  lowerSnapshotMessage.includes("latest") &&
                  lowerSnapshotMessage.includes("event"));
              if (isTransientSnapshotRace && transientPollErrorCount < 8) {
                transientPollErrorCount += 1;
                await wait(intervalMs);
                continue;
              }
              throw snapshotError;
            }
            transientPollErrorCount = 0;
            const state = latestSession?.session?.state;
            const currentPages = latestSession?.outline?.nodes?.length || 0;
            const targetPages =
              resolveExpectedPages(latestSession?.options) || pageCount;

            useProjectStore.setState({
              generationSession: latestSession,
              activeSessionId: sessionIdFromStore,
              activeRunId: runIdFromCallback,
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
                "Outline generation failed",
                latestSession?.session?.state_reason ||
                  "Please try again later."
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
              "Outline is still generating",
              `Current state: ${lastSessionState}. You can keep waiting on the outline editor.`
            );
          }

          if (outlineIncomplete) {
            notifyInfo(
              "Outline pages are still filling",
              "You can keep editing while remaining pages continue generating."
            );
          }
        } catch (error) {
          if (outlinePollRequestIdRef.current !== requestId) return;
          const message =
            error instanceof Error
              ? error.message
              : "Failed to sync outline state.";
          notifyError("Failed to sync outline state", message);
        } finally {
          if (outlinePollRequestIdRef.current === requestId) {
            setIsCreatingSession(false);
          }
        }
      })();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create generation session.";
      notifyError("Failed to start generation", message);
      setShowOutlineEditor(false);
      setIsCreatingSession(false);
    }
  }, [
    notifyError,
    notifyInfo,
    onGenerate,
    outlineStyle,
    pageCount,
    prompt,
    layoutMode,
    selectedTemplateId,
    visualStyle,
    visualPolicy,
  ]);

  const handleBackToConfigFromOutline = useCallback(() => {
    setShowOutlineEditor(false);
    setShowRegenerateHint(true);
  }, []);

  const handleGoToPreview = useCallback(() => {
    if (!projectId || !sessionId) return;

    const latestRunId = useProjectStore.getState().activeRunId;
    if (!latestRunId) return;

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
    visualStyle,
    setVisualStyle,
    visualPolicy,
    setVisualPolicy,
    layoutMode,
    setLayoutMode,
    selectedTemplateId,
    setSelectedTemplateId,
    suggestions,
    loadingSuggestions,
    isCreatingSession,
    showRegenerateHint,
    showOutlineEditor,
    setShowOutlineEditor,
    handleBackToConfigFromOutline,
    sessionId,
    pageLabel,
    generateSuggestionBatch,
    handleGenerate,
    handleGoToPreview,
  };
}
