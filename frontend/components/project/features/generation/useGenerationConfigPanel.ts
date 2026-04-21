"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateApi } from "@/lib/sdk";
import { useNotification } from "@/hooks/use-notification";
import { useRagPromptSuggestions } from "@/hooks/use-rag-prompt-suggestions";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { LAYOUT_MODES, TEMPLATE_CARDS } from "./constants";

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

  const { generationSession, activeSessionId, activeRunId } = useProjectStore(
    useShallow((state) => ({
      generationSession: state.generationSession,
      activeSessionId: state.activeSessionId,
      activeRunId: state.activeRunId,
    }))
  );

  const [prompt, setPrompt] = useState("");
  const [pageCount, setPageCount] = useState<number>(8);
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
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showOutlineEditor, setShowOutlineEditor] = useState(false);
  const [showRegenerateHint, setShowRegenerateHint] = useState(false);
  const {
    suggestions,
    status: suggestionStatus,
    isLoading: loadingSuggestions,
    errorMessage: suggestionErrorMessage,
    reload: generateSuggestionBatch,
  } = useRagPromptSuggestions({
    surface: "ppt_generation_config",
    limit: 4,
  });

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

          if (!outlineReady) {
            try {
              const finalSnapshotResponse = await generateApi.getSessionSnapshot(
                sessionIdFromStore,
                { run_id: runIdFromCallback }
              );
              const finalSnapshot = finalSnapshotResponse?.data ?? null;
              if (finalSnapshot) {
                useProjectStore.setState({
                  generationSession: finalSnapshot,
                  activeSessionId: sessionIdFromStore,
                  activeRunId: runIdFromCallback,
                });
                lastSessionState = finalSnapshot?.session?.state;
              }
            } catch {
              // Keep best-effort last state.
            }
          }

          if (!outlineReady && lastSessionState === "FAILED") {
            const failedSession = useProjectStore.getState().generationSession;
            notifyError(
              "Outline generation failed",
              failedSession?.session?.state_reason || "Please try again later."
            );
          } else if (
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
    suggestionStatus,
    loadingSuggestions,
    suggestionErrorMessage,
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
