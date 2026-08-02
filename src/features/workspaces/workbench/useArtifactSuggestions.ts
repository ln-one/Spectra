"use client";

import { type QueryKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { ArtifactSuggestion } from "./ArtifactWorkspacePrimitives";

type SuggestionResult<Suggestion extends ArtifactSuggestion> = {
  generation?: string | null | undefined;
  status: "fresh" | "stale" | "pending" | "failed";
  suggestions: Suggestion[];
};

// Covers three 30-second worker attempts, their 5/10-second backoff, and scheduling overhead.
const SUGGESTION_WAIT_TIMEOUT_MS = 120_000;
const SUGGESTION_CACHE_GC_TIME_MS = 15 * 60 * 1_000;

export function useArtifactSuggestions<Suggestion extends ArtifactSuggestion>(input: {
  enabled: boolean;
  fetchSuggestions: (
    afterGeneration?: string | null,
    waitOnly?: boolean,
  ) => Promise<SuggestionResult<Suggestion>>;
  queryKey: QueryKey;
  regenerateSuggestions: (afterGeneration: string | null) => Promise<SuggestionResult<Suggestion>>;
}) {
  const queryClient = useQueryClient();
  const refreshGenerationRef = useRef<string | null | undefined>(undefined);
  const waitingStartedAtRef = useRef<number | null>(null);
  const [refreshGeneration, setRefreshGeneration] = useState<string | null | undefined>(undefined);
  const [timedOut, setTimedOut] = useState(false);
  const query = useQuery({
    enabled: input.enabled,
    gcTime: SUGGESTION_CACHE_GC_TIME_MS,
    queryFn: async () => {
      const waitingFor = refreshGenerationRef.current;
      const result = await input.fetchSuggestions(waitingFor, waitingFor !== undefined);
      if (result.status === "pending") {
        const existing = queryClient.getQueryData<SuggestionResult<Suggestion>>(input.queryKey);
        if (waitingFor === undefined) {
          const generation = result.generation ?? null;
          refreshGenerationRef.current = generation;
          waitingStartedAtRef.current = Date.now();
          setRefreshGeneration(generation);
        } else if (
          waitingStartedAtRef.current !== null &&
          Date.now() - waitingStartedAtRef.current >= SUGGESTION_WAIT_TIMEOUT_MS
        ) {
          refreshGenerationRef.current = undefined;
          waitingStartedAtRef.current = null;
          setRefreshGeneration(undefined);
          setTimedOut(true);
          if (existing?.status === "fresh" || existing?.status === "stale") return existing;
          return { generation: result.generation, status: "failed" as const, suggestions: [] };
        }
        if (existing?.status === "fresh" || existing?.status === "stale") return existing;
      }
      if (waitingFor === undefined && result.status === "stale") {
        const generation = result.generation ?? null;
        refreshGenerationRef.current = generation;
        waitingStartedAtRef.current = Date.now();
        setRefreshGeneration(generation);
      }
      if (
        waitingFor !== undefined &&
        (result.status === "fresh" || result.status === "stale") &&
        result.generation !== waitingFor
      ) {
        refreshGenerationRef.current = undefined;
        waitingStartedAtRef.current = null;
        setRefreshGeneration(undefined);
        setTimedOut(false);
      }
      return result;
    },
    queryKey: input.queryKey,
    refetchInterval: (query) => {
      if (timedOut) return false;
      return refreshGeneration !== undefined ||
        query.state.data?.status === "pending" ||
        query.state.data?.status === "stale"
        ? 2_000
        : false;
    },
    staleTime: 5 * 60 * 1_000,
  });
  const refresh = useMutation({
    mutationFn: input.regenerateSuggestions,
    onSuccess: (result) => {
      if (result.status === "pending") {
        const generation = result.generation ?? null;
        refreshGenerationRef.current = generation;
        waitingStartedAtRef.current = Date.now();
        setRefreshGeneration(generation);
        setTimedOut(false);
        void query.refetch();
        return;
      }
      if (result.status === "fresh" || result.status === "stale") {
        queryClient.setQueryData(input.queryKey, result);
      }
      void queryClient.invalidateQueries({ queryKey: input.queryKey });
    },
  });
  const snapshot =
    query.data?.status === "fresh" || query.data?.status === "stale" ? query.data : undefined;
  return {
    error: timedOut || query.isError || refresh.isError || query.data?.status === "failed",
    loading: !timedOut && !snapshot && (query.isPending || query.data?.status === "pending"),
    refresh: () => {
      setTimedOut(false);
      refresh.mutate(snapshot?.generation ?? null);
    },
    refreshing: refresh.isPending || refreshGeneration !== undefined || query.isFetching,
    retry: () => {
      if (timedOut || refresh.isError || query.data?.status === "failed") {
        setTimedOut(false);
        refresh.mutate(snapshot?.generation ?? null);
        return;
      }
      void query.refetch();
    },
    suggestions: snapshot?.suggestions,
  };
}
