"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ragApi, type PromptSuggestionSurface } from "@/lib/sdk";
import { useProjectStore } from "@/stores/projectStore";

interface UseRagPromptSuggestionsArgs {
  surface: PromptSuggestionSurface;
  seedText?: string;
  limit?: number;
  debounceMs?: number;
}

interface RagPromptSuggestionsState {
  suggestions: string[];
  summary: string;
  isLoading: boolean;
  errorMessage: string | null;
  reload: () => Promise<void>;
}

export function useRagPromptSuggestions({
  surface,
  seedText = "",
  limit = 4,
  debounceMs = 450,
}: UseRagPromptSuggestionsArgs): RagPromptSuggestionsState {
  const { project, files, selectedFileIds } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      files: state.files,
      selectedFileIds: state.selectedFileIds,
    }))
  );

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const readyFileIds = useMemo(
    () =>
      files
        .filter((file) => file.status === "ready")
        .map((file) => file.id)
        .filter(Boolean),
    [files]
  );
  const effectiveFileIds = useMemo(
    () => (selectedFileIds.length > 0 ? selectedFileIds : readyFileIds),
    [readyFileIds, selectedFileIds]
  );
  const reload = useCallback(async () => {
    if (!project?.id) {
      setSuggestions([]);
      setSummary("");
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
        seed_text: seedText.trim() || project.name || "",
        limit,
        filters:
          effectiveFileIds.length > 0
            ? { file_ids: effectiveFileIds }
            : undefined,
      });
      if (requestId !== requestIdRef.current) return;
      setSuggestions(response.data.suggestions ?? []);
      setSummary(response.data.summary ?? "");
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message =
        error instanceof Error ? error.message : "提示建议暂不可用";
      setSuggestions([]);
      setSummary("");
      setErrorMessage(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [effectiveFileIds, limit, project?.id, project?.name, seedText, surface]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [debounceMs, reload]);

  return {
    suggestions,
    summary,
    isLoading,
    errorMessage,
    reload,
  };
}
