"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ragApi } from "@/lib/sdk";
import { useProjectStore } from "@/stores/projectStore";

interface RecommendationOptions {
  query: string;
  fallbackSuggestions?: string[];
  maxSuggestions?: number;
}

interface StudioRagRecommendations {
  suggestions: string[];
  summary: string;
  isLoading: boolean;
}

function normalizeLabel(value: string): string {
  return value
    .replace(/\.[a-zA-Z0-9]+$/g, "")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(input: string): string[] {
  return input
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 18);
}

function extractSentences(input: string): string[] {
  return input
    .split(/[\n。！？!?；;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8 && item.length <= 60);
}

export function useStudioRagRecommendations({
  query,
  fallbackSuggestions = [],
  maxSuggestions = 6,
}: RecommendationOptions): StudioRagRecommendations {
  const { project, files, selectedFileIds } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      files: state.files,
      selectedFileIds: state.selectedFileIds,
    }))
  );
  const [suggestions, setSuggestions] = useState<string[]>(fallbackSuggestions);
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fallbackRef = useRef(fallbackSuggestions);

  const fallbackKey = useMemo(
    () => fallbackSuggestions.join("||"),
    [fallbackSuggestions]
  );
  const readyFileIds = useMemo(
    () => files.filter((file) => file.status === "ready").map((file) => file.id),
    [files]
  );
  const readyFileIdsKey = useMemo(() => readyFileIds.join("|"), [readyFileIds]);
  const selectedFileIdsKey = useMemo(
    () => selectedFileIds.join("|"),
    [selectedFileIds]
  );

  useEffect(() => {
    fallbackRef.current = fallbackSuggestions;
  }, [fallbackSuggestions]);

  useEffect(() => {
    if (!project?.id) {
      setSuggestions(fallbackRef.current);
      setSummary("");
      return;
    }

    let cancelled = false;
    const loadRecommendations = async () => {
      setIsLoading(true);
      try {
        const fileIds = selectedFileIds.length > 0 ? selectedFileIds : readyFileIds;
        const response = await ragApi.search({
          project_id: project.id,
          query,
          top_k: 6,
          filters: fileIds.length > 0 ? { file_ids: fileIds } : undefined,
        });
        if (cancelled) return;

        const chunks = response?.data?.results ?? [];
        const mergedText = chunks.map((item) => item.content).join("\n");
        const keywordCandidates = extractKeywords(mergedText);
        const sentenceCandidates = extractSentences(mergedText);
        const sourceCandidates = chunks
          .map((item) => normalizeLabel(item.source?.filename || ""))
          .filter(Boolean);

        const nextSuggestions = Array.from(
          new Set([
            ...fallbackRef.current,
            ...keywordCandidates,
            ...sourceCandidates,
            ...sentenceCandidates.map((item) => item.slice(0, 24)),
          ])
        )
          .filter((item) => item.length >= 2 && item.length <= 24)
          .slice(0, maxSuggestions);

        setSuggestions(nextSuggestions);
        setSummary(sentenceCandidates[0] ?? "");
      } catch {
        if (cancelled) return;
        setSuggestions(fallbackRef.current);
        setSummary("");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, [
    fallbackKey,
    maxSuggestions,
    project?.id,
    query,
    readyFileIds,
    readyFileIdsKey,
    selectedFileIds,
    selectedFileIdsKey,
  ]);

  return { suggestions, summary, isLoading };
}