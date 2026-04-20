"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ragApi, type PromptSuggestionSurface } from "@/lib/sdk";
import { useProjectStore } from "@/stores/projectStore";

type PromptSuggestionPoolStatus =
  | "ready"
  | "generating"
  | "stale"
  | "failed"
  | "empty";

interface UseRagPromptSuggestionsArgs {
  surface: PromptSuggestionSurface;
  limit?: number;
  debounceMs?: number;
}

interface RagPromptSuggestionsState {
  suggestions: string[];
  summary: string;
  status: PromptSuggestionPoolStatus;
  poolSize: number;
  generatedAt: string | null;
  isLoading: boolean;
  errorMessage: string | null;
  reload: () => Promise<void>;
}

export function useRagPromptSuggestions({
  surface,
  limit = 4,
  debounceMs = 450,
}: UseRagPromptSuggestionsArgs): RagPromptSuggestionsState {
  const project = useProjectStore((state) => state.project);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<PromptSuggestionPoolStatus>("empty");
  const [poolSize, setPoolSize] = useState(0);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const cursorRef = useRef(0);

  const loadBatch = useCallback(
    async (cursor: number, refresh = false) => {
      if (!project?.id) {
        setSuggestions([]);
        setSummary("");
        setStatus("empty");
        setPoolSize(0);
        setGeneratedAt(null);
        setNextCursor(null);
        setErrorMessage(null);
        return;
      }

      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await ragApi.getPromptSuggestions({
          project_id: project.id,
          surface,
          cursor,
          limit,
          refresh,
        });
        if (requestId !== requestIdRef.current) return;
        setSuggestions(response.data.suggestions ?? []);
        setSummary(response.data.summary ?? "");
        setStatus(
          (response.data.status ?? "empty") as PromptSuggestionPoolStatus
        );
        setPoolSize(response.data.pool_size ?? 0);
        setGeneratedAt(response.data.generated_at ?? null);
        setNextCursor(response.data.next_cursor ?? null);
        cursorRef.current = response.data.next_cursor ?? 0;
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        const message =
          error instanceof Error ? error.message : "提示建议暂不可用";
        setSuggestions([]);
        setSummary("");
        setStatus("failed");
        setPoolSize(0);
        setGeneratedAt(null);
        setNextCursor(null);
        setErrorMessage(message);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [limit, project?.id, surface]
  );

  const reload = useCallback(async () => {
    const shouldRefresh = status === "failed" || status === "empty";
    await loadBatch(nextCursor ?? cursorRef.current, shouldRefresh);
  }, [loadBatch, nextCursor, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      cursorRef.current = 0;
      void loadBatch(0, false);
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [debounceMs, loadBatch]);

  useEffect(() => {
    if (status !== "generating" || suggestions.length > 0) return;
    const timer = window.setTimeout(() => {
      void loadBatch(0, false);
    }, 3000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadBatch, status, suggestions.length]);

  return {
    suggestions,
    summary,
    status,
    poolSize,
    generatedAt,
    isLoading,
    errorMessage,
    reload,
  };
}
