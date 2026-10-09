"use client";

import { type QueryKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const stoppedRef = useRef(false);
  const [waitingStartedAt, setWaitingStartedAt] = useState<number | null>(null);
  const startWaiting = useCallback(() => {
    if (waitingStartedAtRef.current !== null) return;
    const startedAt = Date.now();
    waitingStartedAtRef.current = startedAt;
    setWaitingStartedAt(startedAt);
  }, []);
  const stopWaiting = useCallback((failed: boolean) => {
    stoppedRef.current = failed;
    refreshGenerationRef.current = undefined;
    waitingStartedAtRef.current = null;
    setRefreshGeneration(undefined);
    setWaitingStartedAt(null);
    setTimedOut(failed);
  }, []);
  useEffect(() => {
    if (!input.enabled || waitingStartedAt === null) return;
    const timer = setTimeout(
      () => {
        stopWaiting(true);
        void queryClient.cancelQueries({ queryKey: input.queryKey, exact: true });
      },
      Math.max(0, SUGGESTION_WAIT_TIMEOUT_MS - (Date.now() - waitingStartedAt)),
    );
    return () => clearTimeout(timer);
  }, [input.enabled, input.queryKey, queryClient, waitingStartedAt, stopWaiting]);
  const query = useQuery({
    enabled: input.enabled,
    gcTime: SUGGESTION_CACHE_GC_TIME_MS,
    queryFn: async () => {
      const waitingFor = refreshGenerationRef.current;
      startWaiting();
      const result = await input.fetchSuggestions(waitingFor, waitingFor !== undefined);
      const cached = queryClient.getQueryData<SuggestionResult<Suggestion>>(input.queryKey);
      if (stoppedRef.current || result.status === "failed") {
        stopWaiting(true);
        if (cached?.status === "fresh" || cached?.status === "stale") return cached;
        return { generation: result.generation, status: "failed" as const, suggestions: [] };
      }
      if (result.status === "pending") {
        const existing = queryClient.getQueryData<SuggestionResult<Suggestion>>(input.queryKey);
        if (waitingFor === undefined) {
          const generation = result.generation ?? null;
          refreshGenerationRef.current = generation;
          startWaiting();
          setRefreshGeneration(generation);
        } else if (
          waitingStartedAtRef.current !== null &&
          Date.now() - waitingStartedAtRef.current >= SUGGESTION_WAIT_TIMEOUT_MS
        ) {
          stopWaiting(true);
          if (existing?.status === "fresh" || existing?.status === "stale") return existing;
          return { generation: result.generation, status: "failed" as const, suggestions: [] };
        }
        if (existing?.status === "fresh" || existing?.status === "stale") return existing;
      }
      if (waitingFor === undefined && result.status === "stale") {
        const generation = result.generation ?? null;
        refreshGenerationRef.current = generation;
        startWaiting();
        setRefreshGeneration(generation);
      }
      if (
        waitingFor !== undefined &&
        (result.status === "fresh" || result.status === "stale") &&
        result.generation !== waitingFor
      ) {
        stopWaiting(false);
      }
      if (waitingFor === undefined && result.status === "fresh") stopWaiting(false);
      return result;
    },
    queryKey: input.queryKey,
    refetchInterval: (query) => {
      if (timedOut || query.state.status === "error") return false;
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
    onMutate: () => {
      stopWaiting(false);
      startWaiting();
    },
    onError: () => stopWaiting(true),
    onSuccess: (result) => {
      if (stoppedRef.current || result.status === "failed") {
        stopWaiting(true);
        return;
      }
      if (result.status === "pending") {
        const generation = result.generation ?? null;
        refreshGenerationRef.current = generation;
        startWaiting();
        setRefreshGeneration(generation);
        setTimedOut(false);
        void query.refetch();
        return;
      }
      stopWaiting(false);
      queryClient.setQueryData(input.queryKey, result);
    },
  });
  useEffect(() => {
    if (query.isError) stopWaiting(true);
  }, [query.isError, stopWaiting]);
  const snapshot =
    query.data?.status === "fresh" || query.data?.status === "stale" ? query.data : undefined;
  return {
    error: timedOut || query.isError || refresh.isError || query.data?.status === "failed",
    loading: !timedOut && !snapshot && (query.isPending || query.data?.status === "pending"),
    refresh: () => {
      stopWaiting(false);
      refresh.mutate(snapshot?.generation ?? null);
    },
    refreshing:
      !timedOut && (refresh.isPending || refreshGeneration !== undefined || query.isFetching),
    retry: () => {
      if (timedOut || query.isError || refresh.isError || query.data?.status === "failed") {
        stopWaiting(false);
        refresh.mutate(snapshot?.generation ?? null);
        return;
      }
      void query.refetch();
    },
    suggestions: snapshot?.suggestions,
  };
}
