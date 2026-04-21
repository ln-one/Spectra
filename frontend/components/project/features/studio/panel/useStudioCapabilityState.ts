import { useEffect, useMemo, useRef, useState } from "react";
import { projectSpaceApi, studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import type {
  ArtifactHistoryByTool,
  ArtifactHistoryItem,
  GenerationToolType,
} from "@/lib/project-space/artifact-history";
import { toArtifactHistoryItem } from "@/lib/project-space/artifact-history";
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
import {
  doesArtifactMatchResolvedTarget,
  resolveManagedTarget,
} from "./managed-target-resolver";
import type {
  ManagedWorkbenchState,
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
  generationSession?: unknown;
  artifactHistoryByTool: ArtifactHistoryByTool;
  draftSourceArtifactId: string | null;
  managedWorkbenchState?: ManagedWorkbenchState | null;
}

export function useStudioCapabilityState({
  projectId,
  activeSessionId,
  activeRunId,
  expandedTool,
  generationSession,
  artifactHistoryByTool,
  draftSourceArtifactId,
  managedWorkbenchState = null,
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
  const resolvedArtifactIdsByCardRef = useRef<Record<string, string>>({});

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
  const supportsChatRefine = currentCapability?.supports_chat_refine ?? false;
  const currentReadiness =
    currentExecutionPlan?.readiness ?? currentCapability?.readiness ?? null;
  const isProtocolPending = currentReadiness === "protocol_pending";
  const hasSourceBinding = Boolean(selectedSourceId || draftSourceArtifactId);

  const mergedToolArtifacts = useMemo(() => {
    if (!expandedToolKey) return [];
    const fromStore = artifactHistoryByTool[expandedToolKey] ?? [];
    return mergeToolArtifacts(
      expandedToolKey,
      fromStore,
      runtimeArtifactsByTool
    );
  }, [artifactHistoryByTool, expandedToolKey, runtimeArtifactsByTool]);

  const resolvedManagedTarget = useMemo(
    () =>
      resolveManagedTarget({
        toolType: expandedToolKey,
        managedWorkbenchState,
        activeSessionId,
        activeRunId,
        currentToolArtifacts: mergedToolArtifacts,
      }),
    [
      activeRunId,
      activeSessionId,
      expandedToolKey,
      managedWorkbenchState,
      mergedToolArtifacts,
    ]
  );

  const currentToolArtifacts = useMemo(() => {
    if (!expandedToolKey) return [];
    if (resolvedManagedTarget?.toolType === expandedToolKey) {
      if (resolvedManagedTarget.kind === "draft") {
        if (!resolvedManagedTarget.artifactId) {
          return [];
        }
        const filteredDraftArtifacts = mergedToolArtifacts.filter((item) =>
          doesArtifactMatchResolvedTarget(item, resolvedManagedTarget)
        );
        return filteredDraftArtifacts;
      }
      const filtered = mergedToolArtifacts.filter((item) =>
        doesArtifactMatchResolvedTarget(item, resolvedManagedTarget)
      );
      if (filtered.length > 0) {
        return filtered;
      }
    }
    const normalizedRunId = activeRunId?.trim() || null;
    if (!normalizedRunId) {
      return mergedToolArtifacts;
    }
    return mergedToolArtifacts.filter(
      (item) => (item.runId?.trim() || null) === normalizedRunId
    );
  }, [
    activeRunId,
    expandedToolKey,
    mergedToolArtifacts,
    resolvedManagedTarget,
  ]);

  const completedPptHistorySources = useMemo<StudioSourceOption[]>(() => {
    const requiresPptSources =
      currentCardId === "word_document" ||
      currentCardId === "speaker_notes" ||
      currentCardId === "demonstration_animations";
    if (!requiresPptSources) return [];
    const pptHistory = artifactHistoryByTool.ppt ?? [];
    const seen = new Set<string>();
    const normalized: StudioSourceOption[] = [];
    for (const item of pptHistory) {
      if (item.status !== "completed") continue;
      if (!item.artifactId || seen.has(item.artifactId)) continue;
      seen.add(item.artifactId);
      normalized.push({
        id: item.artifactId,
        title: item.title,
        type: item.artifactType,
        sessionId: item.sessionId ?? null,
      });
    }
    return normalized;
  }, [artifactHistoryByTool.ppt, currentCardId]);

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
  const latestToolArtifact = currentToolArtifacts[0] ?? null;
  const latestToolArtifactId = latestToolArtifact?.artifactId ?? null;

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
    const latestArtifact = latestToolArtifact;
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
      delete resolvedArtifactIdsByCardRef.current[currentCardId];
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
        let artifactForResolution = latestArtifact;
        const metadataMissing =
          !latestArtifact.metadata ||
          Object.keys(latestArtifact.metadata).length === 0;
        const needsArtifactDetail =
          metadataMissing || latestArtifact.artifactType === "docx";

        if (needsArtifactDetail) {
          const detailResponse = await projectSpaceApi.getArtifact(
            projectId,
            latestArtifact.artifactId
          );
          if (detailResponse?.artifact) {
            const detailItem = toArtifactHistoryItem(detailResponse.artifact);
            artifactForResolution = {
              ...latestArtifact,
              ...detailItem,
              runId: latestArtifact.runId ?? detailItem.runId ?? null,
              runNo: latestArtifact.runNo ?? detailItem.runNo ?? null,
              metadata:
                detailItem.metadata ??
                latestArtifact.metadata ??
                null,
            };
          }
        }

        const blob = await projectSpaceApi.downloadArtifact(
          projectId,
          artifactForResolution.artifactId
        );
        const resolved = await resolveCapabilityFromArtifact({
          toolId: expandedToolKey,
          artifact: artifactForResolution,
          blob,
        });
        resolvedArtifactIdsByCardRef.current[currentCardId] =
          artifactForResolution.artifactId;
        applyResolution(resolved);
      } catch (error) {
        delete resolvedArtifactIdsByCardRef.current[currentCardId];
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
  }, [
    currentCardId,
    expandedToolKey,
    latestToolArtifact,
    latestToolArtifactId,
    projectId,
  ]);

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
      if (prev[currentCardId] || sources.length === 0) return prev;
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
      const nextItems = [
        runtimeItem,
        ...existing.filter((item) => item.artifactId !== runtimeItem.artifactId),
      ];
      return {
        ...prev,
        [toolKey]: nextItems,
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
    resolvedManagedTarget,
    activeCapabilityState,
    isLoadingCardProtocol,
    upsertCurrentCardSources,
    setSelectedSourceForCurrentCard,
    appendRuntimeArtifact,
    draftSourceArtifactId,
  };
}
