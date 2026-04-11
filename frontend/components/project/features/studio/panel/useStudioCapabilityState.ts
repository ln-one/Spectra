import { useEffect, useMemo, useState } from "react";
import { projectSpaceApi, studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import type {
  ArtifactHistoryByTool,
  ArtifactHistoryItem,
  GenerationToolType,
} from "@/lib/project-space/artifact-history";
import { toast } from "@/hooks/use-toast";
import type { StudioToolKey } from "../tools";
import {
  buildCapabilityWithoutArtifact,
  resolveCapabilityFromArtifact,
} from "../tools/capability-resolver";
import {
  DEFAULT_CAPABILITY_PENDING_REASON,
  STUDIO_CARD_BY_TOOL,
} from "./constants";
import type {
  CapabilityStateByCardId,
  CardCapabilityMap,
  ExecutionPlanMap,
  RuntimeArtifactsByTool,
  SelectedSourceByCard,
  SourceOptionsByCard,
  StudioSourceOption,
} from "./types";
import { buildRuntimeArtifactStorageKey, mergeToolArtifacts } from "./utils";

interface UseStudioCapabilityStateArgs {
  projectId: string | null;
  activeSessionId: string | null;
  activeRunId: string | null;
  expandedTool: GenerationToolType | null;
  artifactHistoryByTool: ArtifactHistoryByTool;
  draftSourceArtifactId: string | null;
}

export function useStudioCapabilityState({
  projectId,
  activeSessionId,
  activeRunId,
  expandedTool,
  artifactHistoryByTool,
  draftSourceArtifactId,
}: UseStudioCapabilityStateArgs) {
  const [selectedSourceByCard, setSelectedSourceByCard] =
    useState<SelectedSourceByCard>({});
  const [sourceOptionsByCard, setSourceOptionsByCard] =
    useState<SourceOptionsByCard>({});
  const [cardCapabilitiesById, setCardCapabilitiesById] =
    useState<CardCapabilityMap>({});
  const [executionPlanByCardId, setExecutionPlanByCardId] =
    useState<ExecutionPlanMap>({});
  const [isLoadingCardProtocol, setIsLoadingCardProtocol] = useState(false);
  const [capabilityStateByCardId, setCapabilityStateByCardId] =
    useState<CapabilityStateByCardId>({});
  const [runtimeArtifactsByTool, setRuntimeArtifactsByTool] =
    useState<RuntimeArtifactsByTool>({});

  const runtimeArtifactStorageKey = buildRuntimeArtifactStorageKey(
    projectId,
    activeSessionId
  );
  const expandedToolKey =
    expandedTool && expandedTool !== "ppt"
      ? (expandedTool as StudioToolKey)
      : null;
  const currentCardId = expandedToolKey
    ? (STUDIO_CARD_BY_TOOL[expandedToolKey] ?? null)
    : null;
  const currentCapability = currentCardId
    ? (cardCapabilitiesById[currentCardId] ?? null)
    : null;
  const currentExecutionPlan = currentCardId
    ? (executionPlanByCardId[currentCardId] ?? null)
    : null;
  const selectedSourceId = currentCardId
    ? (selectedSourceByCard[currentCardId] ?? null)
    : null;
  const requiresSourceArtifact =
    currentCapability?.requires_source_artifact ?? false;
  const supportsChatRefine = currentCapability?.supports_chat_refine ?? true;
  const currentReadiness =
    currentExecutionPlan?.readiness ?? currentCapability?.readiness ?? null;
  const isProtocolPending = currentReadiness === "protocol_pending";
  const hasSourceBinding = Boolean(selectedSourceId || draftSourceArtifactId);

  const currentToolArtifacts = useMemo(() => {
    if (!expandedToolKey) return [];
    const fromStore = artifactHistoryByTool[expandedToolKey] ?? [];
    const merged = mergeToolArtifacts(
      expandedToolKey,
      fromStore,
      runtimeArtifactsByTool
    );
    const normalizedRunId = activeRunId?.trim() || null;
    if (!normalizedRunId) {
      return merged;
    }
    return merged.filter(
      (item) => (item.runId?.trim() || null) === normalizedRunId
    );
  }, [
    activeRunId,
    artifactHistoryByTool,
    expandedToolKey,
    runtimeArtifactsByTool,
  ]);

  const completedPptHistorySources = useMemo<StudioSourceOption[]>(() => {
    if (expandedToolKey !== "summary" && expandedToolKey !== "animation") {
      return [];
    }
    const pptHistory = artifactHistoryByTool.ppt ?? [];
    const seen = new Set<string>();
    const normalized: StudioSourceOption[] = [];
    for (const item of pptHistory) {
      if (item.status !== "completed") continue;
      if (!item.artifactId || seen.has(item.artifactId)) continue;
      if (activeSessionId && item.sessionId !== activeSessionId) continue;
      seen.add(item.artifactId);
      normalized.push({
        id: item.artifactId,
        title: item.title,
        type: item.artifactType,
        sessionId: item.sessionId ?? null,
      });
    }
    return normalized;
  }, [activeSessionId, artifactHistoryByTool.ppt, expandedToolKey]);

  const currentCapabilityState = currentCardId
    ? capabilityStateByCardId[currentCardId]
    : undefined;
  const fallbackCapabilityState = useMemo(() => {
    if (!expandedToolKey) {
      return {
        status: "backend_placeholder" as const,
        reason: DEFAULT_CAPABILITY_PENDING_REASON,
        resolvedArtifact: null,
        isLoading: false,
      };
    }
    const defaultResolution = buildCapabilityWithoutArtifact(expandedToolKey);
    return {
      ...defaultResolution,
      isLoading: defaultResolution.status !== "backend_not_implemented",
    };
  }, [expandedToolKey]);
  const activeCapabilityState =
    currentCapabilityState ?? fallbackCapabilityState;

  useEffect(() => {
    if (!runtimeArtifactStorageKey) {
      setRuntimeArtifactsByTool({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(runtimeArtifactStorageKey);
      if (!raw) {
        setRuntimeArtifactsByTool({});
        return;
      }
      const parsed = JSON.parse(raw) as RuntimeArtifactsByTool;
      setRuntimeArtifactsByTool(parsed ?? {});
    } catch {
      setRuntimeArtifactsByTool({});
    }
  }, [runtimeArtifactStorageKey]);

  useEffect(() => {
    if (!runtimeArtifactStorageKey) return;
    try {
      window.localStorage.setItem(
        runtimeArtifactStorageKey,
        JSON.stringify(runtimeArtifactsByTool)
      );
    } catch {
      // Ignore local storage persistence failures.
    }
  }, [runtimeArtifactStorageKey, runtimeArtifactsByTool]);

  useEffect(() => {
    if (!currentCardId) return;
    if (currentCapability && currentExecutionPlan) {
      return;
    }

    let cancelled = false;
    const loadCardProtocol = async () => {
      try {
        setIsLoadingCardProtocol(true);
        const [detailResponse, planResponse] = await Promise.all([
          studioCardsApi.getCard(currentCardId),
          studioCardsApi.getExecutionPlan(currentCardId),
        ]);
        if (cancelled) return;
        if (detailResponse?.data?.studio_card) {
          setCardCapabilitiesById((prev) => ({
            ...prev,
            [currentCardId]: detailResponse.data.studio_card,
          }));
        }
        if (planResponse?.data?.execution_plan) {
          setExecutionPlanByCardId((prev) => ({
            ...prev,
            [currentCardId]: planResponse.data.execution_plan,
          }));
        }
      } catch (error) {
        if (cancelled) return;
        toast({
          title: "获取卡片协议失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) {
          setIsLoadingCardProtocol(false);
        }
      }
    };

    void loadCardProtocol();
    return () => {
      cancelled = true;
    };
  }, [currentCapability, currentCardId, currentExecutionPlan]);

  useEffect(() => {
    if (!currentCardId) return;
    if (selectedSourceId) return;
    if (!draftSourceArtifactId) return;
    setSelectedSourceByCard((prev) => ({
      ...prev,
      [currentCardId]: draftSourceArtifactId,
    }));
  }, [currentCardId, draftSourceArtifactId, selectedSourceId]);

  useEffect(() => {
    if (!currentCardId || !expandedToolKey) return;
    const latestArtifact = currentToolArtifacts[0];
    let cancelled = false;

    const applyResolution = (
      resolution: ReturnType<typeof buildCapabilityWithoutArtifact>,
      isLoading = false
    ) => {
      if (cancelled) return;
      setCapabilityStateByCardId((prev) => ({
        ...prev,
        [currentCardId]: {
          ...resolution,
          isLoading,
        },
      }));
    };

    const defaultResolution = buildCapabilityWithoutArtifact(expandedToolKey);
    if (defaultResolution.status === "backend_not_implemented") {
      applyResolution(defaultResolution);
      return () => {
        cancelled = true;
      };
    }
    if (!projectId || !latestArtifact) {
      applyResolution(defaultResolution);
      return () => {
        cancelled = true;
      };
    }

    applyResolution(
      {
        status: defaultResolution.status,
        reason: defaultResolution.reason,
        resolvedArtifact: null,
      },
      true
    );

    const loadCapability = async () => {
      try {
        const [blob, artifactResponse] = await Promise.all([
          projectSpaceApi.downloadArtifact(projectId, latestArtifact.artifactId),
          projectSpaceApi.getArtifact(projectId, latestArtifact.artifactId),
        ]);
        const resolved = await resolveCapabilityFromArtifact({
          toolId: expandedToolKey,
          artifact: latestArtifact,
          blob,
          artifactMetadata:
            (artifactResponse?.data?.artifact?.metadata as
              | Record<string, unknown>
              | undefined) ?? null,
        });
        applyResolution(resolved);
      } catch (error) {
        applyResolution({
          status: "backend_error",
          reason: `Failed to read backend artifact: ${getErrorMessage(error)}.`,
          resolvedArtifact: null,
        });
      }
    };

    void loadCapability();
    return () => {
      cancelled = true;
    };
  }, [currentCardId, currentToolArtifacts, expandedToolKey, projectId]);

  const sourceOptions = useMemo(() => {
    if (!currentCardId) return [];
    const fromCapability = sourceOptionsByCard[currentCardId] ?? [];
    if (completedPptHistorySources.length === 0) return fromCapability;

    const merged = [...fromCapability];
    const existingIds = new Set(fromCapability.map((item) => item.id));
    for (const item of completedPptHistorySources) {
      if (!existingIds.has(item.id)) {
        merged.push(item);
      }
    }
    return merged;
  }, [completedPptHistorySources, currentCardId, sourceOptionsByCard]);

  useEffect(() => {
    if (!currentCardId) return;
    if (selectedSourceId) return;
    if (sourceOptions.length === 0) return;
    setSelectedSourceByCard((prev) => ({
      ...prev,
      [currentCardId]: sourceOptions[0]?.id ?? null,
    }));
  }, [currentCardId, selectedSourceId, sourceOptions]);

  const upsertCurrentCardSources = (sources: StudioSourceOption[]) => {
    if (!currentCardId) return;
    setSourceOptionsByCard((prev) => ({
      ...prev,
      [currentCardId]: sources,
    }));
    setSelectedSourceByCard((prev) => {
      const currentSelectedId = prev[currentCardId] ?? null;
      if (sources.length === 0) {
        if (!currentSelectedId) return prev;
        return {
          ...prev,
          [currentCardId]: null,
        };
      }
      if (
        currentSelectedId &&
        sources.some((item) => item.id === currentSelectedId)
      ) {
        return prev;
      }
      return {
        ...prev,
        [currentCardId]: sources[0]?.id ?? null,
      };
    });
  };

  const setSelectedSourceForCurrentCard = (sourceId: string | null) => {
    if (!currentCardId) return;
    setSelectedSourceByCard((prev) => ({
      ...prev,
      [currentCardId]: sourceId,
    }));
  };

  const appendRuntimeArtifact = (
    toolKey: StudioToolKey,
    runtimeItem: ArtifactHistoryItem
  ) => {
    setRuntimeArtifactsByTool((prev) => {
      const existing = prev[toolKey] ?? [];
      if (existing.some((item) => item.artifactId === runtimeItem.artifactId)) {
        return prev;
      }
      return {
        ...prev,
        [toolKey]: [runtimeItem, ...existing],
      };
    });
  };

  return {
    currentCardId,
    currentCapability,
    currentExecutionPlan,
    selectedSourceId,
    sourceOptions,
    currentReadiness,
    isProtocolPending,
    requiresSourceArtifact,
    supportsChatRefine,
    hasSourceBinding,
    currentToolArtifacts,
    activeCapabilityState,
    isLoadingCardProtocol,
    upsertCurrentCardSources,
    setSelectedSourceForCurrentCard,
    appendRuntimeArtifact,
    draftSourceArtifactId,
  };
}
