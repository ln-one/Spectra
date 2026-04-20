"use client";

import type { PromptSuggestionSurface } from "@/lib/sdk";
import { useRagPromptSuggestions } from "@/hooks/use-rag-prompt-suggestions";

interface RecommendationOptions {
  surface: PromptSuggestionSurface;
  seedText?: string;
  maxSuggestions?: number;
}

interface StudioRagRecommendations {
  suggestions: string[];
  summary: string;
  isLoading: boolean;
  errorMessage: string | null;
}

export function useStudioRagRecommendations({
  surface,
  seedText = "",
  maxSuggestions = 6,
}: RecommendationOptions): StudioRagRecommendations {
  const { suggestions, summary, isLoading, errorMessage } =
    useRagPromptSuggestions({
      surface,
      seedText,
      limit: maxSuggestions,
      debounceMs: 450,
    });

  return { suggestions, summary, isLoading, errorMessage };
}
