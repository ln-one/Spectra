"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ArtifactHistoryByTool,
  ArtifactHistoryItem,
  GenerationToolType,
} from "@/lib/project-space/artifact-history";
import type {
  StudioHistoryItem,
  StudioPptHistoryStatus,
  StudioHistoryStatus,
  StudioHistoryStep,
} from "./types";

const TOOL_ORDER: GenerationToolType[] = [
  "ppt",
  "word",
  "mindmap",
  "outline",
  "quiz",
  "summary",
  "animation",
  "handout",
];

const MANAGED_LIFECYCLE_TOOLS = new Set<GenerationToolType>([
  "word",
  "mindmap",
  "quiz",
  "outline",
]);

const WORKFLOW_HISTORY_STORAGE_VERSION = "run-v2";

type WorkflowEntryInput = {
  workflowId?: string | null;
  toolType: GenerationToolType;
  title: string;
  status: StudioHistoryStatus;
  step: StudioHistoryStep;
  ppt_status?: StudioPptHistoryStatus;
  sessionId?: string | null;
  artifactId?: string;
  createdAt?: string;
  runId?: string;
  runNo?: number | null;
  titleSource?: string;
  toolLabel?: string;
};

const TITLE_CANDIDATE_KEYS = [
  "title",
  "topic",
  "name",
  "prompt",
  "query",
  "question",
  "goal",
  "summary",
  "output_requirements",
  "learning_goal",
  "preset",
] as const;

function collectTitleFragments(value: unknown, fragments: string[]): void {
  if (fragments.length >= 2 || value == null) return;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized) {
      fragments.push(normalized);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (fragments.length >= 2) break;
      collectTitleFragments(item, fragments);
    }
    return;
  }
  if (typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of TITLE_CANDIDATE_KEYS) {
    if (fragments.length >= 2) break;
    collectTitleFragments(record[key], fragments);
  }
}

function summarizeTitleFromDraftJson(
  text: string,
  toolLabel: string
): string | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    const fragments: string[] = [];
    collectTitleFragments(parsed, fragments);
    if (fragments.length === 0) return null;
    const merged = fragments.join(" · ");
    return summarizeTitleFromText(merged, toolLabel);
  } catch {
    return null;
  }
}

function summarizeTitleFromText(text: string, toolLabel: string): string {
  const cleaned = text
    .replace(/[`*_#>[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return `${toolLabel}草稿`;
  const sentence = cleaned.split(/[\n\r,.!?;:]/)[0]?.trim() || cleaned;
  return sentence.slice(0, 16);
}

function toArtifactHistoryItem(item: ArtifactHistoryItem): StudioHistoryItem {
  return {
    id: `artifact:${item.artifactId}`,
    origin: "artifact",
    workflowId: null,
    toolType: item.toolType,
    title: item.title,
    status: item.status,
    createdAt: item.createdAt,
    sessionId: item.sessionId ?? null,
    step: "preview",
    artifactId: item.artifactId,
    replacesArtifactId: item.replacesArtifactId ?? null,
    supersededByArtifactId: item.supersededByArtifactId ?? null,
    isCurrent: item.isCurrent ?? null,
    runId: item.runId ?? null,
    runNo: item.runNo ?? null,
  };
}

function makeWorkflowId(input: WorkflowEntryInput): string {
  const explicitWorkflowId =
    typeof input.workflowId === "string" && input.workflowId.trim()
      ? input.workflowId.trim()
      : null;
  if (explicitWorkflowId) {
    return explicitWorkflowId;
  }
  const normalizedRunId = normalizeRunId(input.runId);
  if (normalizedRunId) {
    return `workflow:${input.toolType}:${normalizedRunId}`;
  }
  const localToken = (input.artifactId || input.title || "local")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 48);
  const nonce = Date.now().toString(36);
  if (input.sessionId) {
    return `workflow:${input.toolType}:${input.sessionId}:pending:${localToken}:${nonce}`;
  }
  return `workflow:${input.toolType}:local:${localToken}:${nonce}`;
}

function isTransientRunId(runId: string | null | undefined): boolean {
  if (!runId) return false;
  return /^\d{13}-[a-z0-9]{6}$/i.test(runId);
}

function normalizeRunId(runId: string | null | undefined): string | null {
  if (!runId) return null;
  return isTransientRunId(runId) ? null : runId;
}

function statusRank(status: StudioHistoryStatus): number {
  switch (status) {
    case "pending":
      return 0;
    case "draft":
      return 1;
    case "processing":
      return 2;
    case "previewing":
      return 3;
    case "completed":
      return 4;
    case "failed":
      return 4;
    default:
      return 0;
  }
}

function stepRank(step: StudioHistoryStep): number {
  switch (step) {
    case "config":
      return 0;
    case "generate":
      return 1;
    case "outline":
      return 2;
    case "preview":
      return 3;
    default:
      return 0;
  }
}

function pickPreferredWorkflowItem(
  current: StudioHistoryItem,
  incoming: StudioHistoryItem
): StudioHistoryItem {
  const currentScore = stepRank(current.step) * 10 + statusRank(current.status);
  const incomingScore =
    stepRank(incoming.step) * 10 + statusRank(incoming.status);
  if (incomingScore !== currentScore) {
    return incomingScore > currentScore ? incoming : current;
  }
  const currentTime = new Date(current.createdAt).getTime();
  const incomingTime = new Date(incoming.createdAt).getTime();
  if (!Number.isFinite(currentTime)) return incoming;
  if (!Number.isFinite(incomingTime)) return current;
  return incomingTime >= currentTime ? incoming : current;
}

function isNonTerminalWorkflowItem(item: StudioHistoryItem): boolean {
  return (
    item.origin === "workflow" &&
    item.status !== "completed" &&
    item.status !== "failed" &&
    !item.artifactId
  );
}

type RequestedStepByTool = Partial<
  Record<GenerationToolType, StudioHistoryStep>
>;
type CurrentStepByTool = Partial<Record<GenerationToolType, StudioHistoryStep>>;

type PersistedWorkflowHistory = {
  workflowItems?: StudioHistoryItem[];
  hiddenHistoryIds?: Record<string, true>;
  archivedHistoryById?: Record<string, StudioHistoryItem>;
};

function isInvalidPptWorkflowWithoutRunId(item: StudioHistoryItem): boolean {
  return (
    item.origin === "workflow" &&
    item.toolType === "ppt" &&
    !normalizeRunId(item.runId)
  );
}

function readPersistedWorkflowHistory(
  projectId?: string | null
): PersistedWorkflowHistory {
  if (typeof window === "undefined") return {};
  if (!projectId) return {};
  const storageKey = `studio-workflow-history:${WORKFLOW_HISTORY_STORAGE_VERSION}:${projectId}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    return (JSON.parse(raw) as PersistedWorkflowHistory) || {};
  } catch {
    return {};
  }
}

function shouldPromoteWorkflowStatus(
  workflowItem: StudioHistoryItem,
  matchedArtifact: StudioHistoryItem | undefined
): boolean {
  if (!matchedArtifact) return false;
  if (!workflowItem.sessionId || !matchedArtifact.sessionId) return false;
  if (workflowItem.sessionId !== matchedArtifact.sessionId) return false;
  if (workflowItem.toolType !== matchedArtifact.toolType) return false;
  if (
    workflowItem.status !== "processing" &&
    workflowItem.status !== "previewing" &&
    workflowItem.status !== "draft" &&
    workflowItem.status !== "pending"
  ) {
    return false;
  }
  const workflowTime = new Date(workflowItem.createdAt).getTime();
  const artifactTime = new Date(matchedArtifact.createdAt).getTime();
  if (!Number.isFinite(workflowTime) || !Number.isFinite(artifactTime))
    return true;
  return artifactTime >= workflowTime;
}

export function useStudioWorkflowHistory(
  artifactHistoryByTool: ArtifactHistoryByTool,
  activeSessionId?: string | null,
  projectId?: string | null
) {
  const persisted = readPersistedWorkflowHistory(projectId);
  const [workflowItems, setWorkflowItems] = useState<StudioHistoryItem[]>(
    Array.isArray(persisted.workflowItems)
      ? persisted.workflowItems
          .filter((item) => !isInvalidPptWorkflowWithoutRunId(item))
          .slice(0, 80)
      : []
  );
  const polishedTitleRequestedRef = useRef<Record<string, true>>({});
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState<
    Record<string, true>
  >(
    persisted.hiddenHistoryIds && typeof persisted.hiddenHistoryIds === "object"
      ? persisted.hiddenHistoryIds
      : {}
  );
  const [archivedHistoryById, setArchivedHistoryById] = useState<
    Record<string, StudioHistoryItem>
  >(
    persisted.archivedHistoryById &&
      typeof persisted.archivedHistoryById === "object"
      ? persisted.archivedHistoryById
      : {}
  );
  const [requestedStepByTool, setRequestedStepByTool] =
    useState<RequestedStepByTool>({});
  const [currentStepByTool, setCurrentStepByTool] = useState<CurrentStepByTool>(
    {}
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!projectId) return;
    const storageKey = `studio-workflow-history:${WORKFLOW_HISTORY_STORAGE_VERSION}:${projectId}`;
    const payload = {
      workflowItems,
      hiddenHistoryIds,
      archivedHistoryById,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [archivedHistoryById, hiddenHistoryIds, projectId, workflowItems]);

  const recordWorkflowEntry = useCallback((input: WorkflowEntryInput) => {
    const normalizedInputRunId = normalizeRunId(input.runId);
    if (input.toolType === "ppt" && !normalizedInputRunId) {
      return "";
    }
    const requestedWorkflowId =
      typeof input.workflowId === "string" && input.workflowId.trim()
        ? input.workflowId.trim()
        : null;
    const nextWorkflowId = makeWorkflowId(input);
    const nextItem: StudioHistoryItem = {
      id: nextWorkflowId,
      origin: "workflow",
      workflowId: nextWorkflowId,
      toolType: input.toolType,
      title: input.title,
      status: input.status,
      createdAt: input.createdAt ?? new Date().toISOString(),
      sessionId: input.sessionId ?? null,
      step: input.step,
      artifactId: input.artifactId,
      runId: normalizedInputRunId,
      runNo: input.runNo ?? null,
      ppt_status: input.ppt_status,
    };

    let finalWorkflowId = nextWorkflowId;
    setWorkflowItems((prev) => {
      let resolvedItemId = nextItem.id;
      if (requestedWorkflowId) {
        resolvedItemId = requestedWorkflowId;
      }
      const sameSessionItems = input.sessionId
        ? prev.filter(
            (item) =>
              item.origin === "workflow" &&
              item.toolType === input.toolType &&
              item.sessionId === input.sessionId
          )
        : [];
      const activeSessionWorkflow = sameSessionItems.filter(isNonTerminalWorkflowItem);
      if (!requestedWorkflowId && normalizedInputRunId && input.sessionId) {
        const sameRunItem = sameSessionItems.find(
          (item) => normalizeRunId(item.runId) === normalizedInputRunId
        );
        resolvedItemId =
          sameRunItem?.id ??
          (activeSessionWorkflow.length === 1 ? activeSessionWorkflow[0]?.id : undefined) ??
          resolvedItemId;
      } else if (!requestedWorkflowId && input.sessionId) {
        const transientItem =
          activeSessionWorkflow.find((item) => !normalizeRunId(item.runId)) ??
          activeSessionWorkflow[0];
        resolvedItemId = transientItem?.id ?? resolvedItemId;
      }
      finalWorkflowId = resolvedItemId;
      const index = prev.findIndex((item) => item.id === resolvedItemId);
      const itemWithResolvedId: StudioHistoryItem =
        resolvedItemId === nextItem.id
          ? nextItem
          : {
              ...nextItem,
              id: resolvedItemId,
              workflowId: resolvedItemId,
            };
      if (index < 0) {
        return [itemWithResolvedId, ...prev].slice(0, 80);
      }
      const existing = prev[index];
      const mergedItem: StudioHistoryItem = {
        ...existing,
        ...itemWithResolvedId,
        createdAt: existing.createdAt || itemWithResolvedId.createdAt,
        runId: normalizeRunId(itemWithResolvedId.runId)
          ? itemWithResolvedId.runId
          : normalizeRunId(existing.runId)
            ? existing.runId
            : null,
        runNo:
          itemWithResolvedId.runNo ??
          (existing.runNo === undefined ? null : existing.runNo),
        artifactId: itemWithResolvedId.artifactId ?? existing.artifactId,
        workflowId: resolvedItemId,
      };
      const stabilizedItem = pickPreferredWorkflowItem(existing, mergedItem);
      const rest = prev.filter((_, idx) => idx !== index);
      return [stabilizedItem, ...rest];
    });

    if (!input.titleSource?.trim()) return finalWorkflowId;
    const rawTitleSource = input.titleSource.trim();
    const polishedTitle =
      summarizeTitleFromDraftJson(
        rawTitleSource,
        input.toolLabel || input.title
      ) ??
      summarizeTitleFromText(rawTitleSource, input.toolLabel || input.title);
    if (!polishedTitle) return finalWorkflowId;
    setWorkflowItems((prev) => {
      const resolvedItem =
        prev.find((item) => item.id === nextItem.id) ??
        prev.find(
          (item) =>
            item.origin === "workflow" &&
            item.toolType === input.toolType &&
            item.sessionId === (input.sessionId ?? null) &&
            normalizeRunId(item.runId) === normalizedInputRunId
        ) ??
        null;
      const resolvedItemId = resolvedItem?.id ?? finalWorkflowId;
      if (polishedTitleRequestedRef.current[resolvedItemId]) {
        return prev;
      }
      polishedTitleRequestedRef.current[resolvedItemId] = true;
      return prev.map((item) =>
        item.id === resolvedItemId ? { ...item, title: polishedTitle } : item
      );
    });
    return finalWorkflowId;
  }, []);

  const trackStep = useCallback(
    (toolType: GenerationToolType, step: StudioHistoryStep) => {
      setCurrentStepByTool((prev) => {
        if (prev[toolType] === step) return prev;
        return {
          ...prev,
          [toolType]: step,
        };
      });
    },
    []
  );

  const requestStep = useCallback(
    (toolType: GenerationToolType, step: StudioHistoryStep) => {
      setRequestedStepByTool((prev) => ({
        ...prev,
        [toolType]: step,
      }));
    },
    []
  );

  const acknowledgeStep = useCallback(
    (toolType: GenerationToolType, step?: StudioHistoryStep) => {
      setRequestedStepByTool((prev) => {
        if (!prev[toolType]) return prev;
        if (step && prev[toolType] !== step) return prev;
        const next = { ...prev };
        delete next[toolType];
        return next;
      });
    },
    []
  );

  const archiveHistoryItem = useCallback((item: StudioHistoryItem) => {
    setHiddenHistoryIds((prev) => {
      if (prev[item.id]) return prev;
      return {
        ...prev,
        [item.id]: true,
      };
    });
    setArchivedHistoryById((prev) => ({
      ...prev,
      [item.id]: item,
    }));
  }, []);

  const unarchiveHistoryItem = useCallback((itemId: string) => {
    setHiddenHistoryIds((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setArchivedHistoryById((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  const deleteArchivedHistoryItem = useCallback((itemId: string) => {
    setArchivedHistoryById((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    // Keep hidden marker so deleted archived entries do not reappear
    // in the main generation timeline.
    setHiddenHistoryIds((prev) => {
      if (prev[itemId]) return prev;
      return {
        ...prev,
        [itemId]: true,
      };
    });
  }, []);

  const archivedHistory = useMemo(
    () =>
      Object.values(archivedHistoryById).sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [archivedHistoryById]
  );

  const groupedHistory = useMemo(() => {
    const artifactItems = TOOL_ORDER.flatMap((toolType) =>
      (artifactHistoryByTool[toolType] ?? []).map(toArtifactHistoryItem)
    );

    const sessionScopedArtifacts = artifactItems.filter((item) => {
      if (!activeSessionId) {
        return !item.sessionId;
      }
      return item.sessionId === activeSessionId;
    });

    const artifactByRun = new Map<string, StudioHistoryItem>();
    for (const item of sessionScopedArtifacts) {
      if (!item.sessionId) continue;
      if (item.runId) {
        artifactByRun.set(
          `${item.toolType}:${item.sessionId}:${item.runId}`,
          item
        );
      }
    }

    const latestCompletedBySession = new Map<string, number>();
    sessionScopedArtifacts.forEach((item) => {
      if (item.status !== "completed" || !item.sessionId) {
        return;
      }
      const key = `${item.toolType}:${item.sessionId}`;
      const completedAt = new Date(item.createdAt).getTime();
      const previous =
        latestCompletedBySession.get(key) ?? Number.NEGATIVE_INFINITY;
      if (completedAt > previous) {
        latestCompletedBySession.set(key, completedAt);
      }
    });

    const sessionScopedWorkflow = workflowItems.filter((item) => {
      if (isInvalidPptWorkflowWithoutRunId(item)) {
        return false;
      }
      if (!activeSessionId) {
        return !item.sessionId;
      }
      return item.sessionId === activeSessionId;
    });

    const normalizedWorkflow: StudioHistoryItem[] = sessionScopedWorkflow.map(
      (item): StudioHistoryItem => {
        if (item.origin !== "workflow" || !item.sessionId) return item;
        const normalizedRunId = normalizeRunId(item.runId);
        const matchedArtifact = normalizedRunId
          ? artifactByRun.get(
              `${item.toolType}:${item.sessionId}:${normalizedRunId}`
            )
          : item.artifactId
            ? sessionScopedArtifacts.find(
                (artifact) => artifact.artifactId === item.artifactId
              )
            : undefined;
        if (!shouldPromoteWorkflowStatus(item, matchedArtifact)) {
          return item;
        }
        return {
          ...item,
          status: matchedArtifact?.status ?? item.status,
          step: "preview",
          title: matchedArtifact?.title || item.title,
          artifactId: matchedArtifact?.artifactId ?? item.artifactId,
          runId: normalizedRunId ?? matchedArtifact?.runId ?? null,
          runNo: item.runNo ?? matchedArtifact?.runNo ?? null,
        };
      }
    );

    const filteredWorkflow = normalizedWorkflow.filter((item) => {
      const normalizedRunId = normalizeRunId(item.runId);
      const sessionArtifactsForTool =
        item.sessionId
          ? sessionScopedArtifacts.filter(
              (artifact) =>
                artifact.sessionId === item.sessionId &&
                artifact.toolType === item.toolType
            )
          : [];
      const matchedArtifact =
        item.sessionId && normalizedRunId
          ? artifactByRun.get(
              `${item.toolType}:${item.sessionId}:${normalizedRunId}`
            )
          : item.artifactId
            ? sessionScopedArtifacts.find(
                (artifact) => artifact.artifactId === item.artifactId
              )
            : undefined;
      if (matchedArtifact) {
        return false;
      }
      if (
        MANAGED_LIFECYCLE_TOOLS.has(item.toolType) &&
        sessionArtifactsForTool.length > 0 &&
        (item.status === "previewing" ||
          item.status === "completed" ||
          item.status === "failed")
      ) {
        return false;
      }
      if (
        item.status === "previewing" &&
        sessionArtifactsForTool.some((artifact) => artifact.status === "completed")
      ) {
        return false;
      }
      if (
        (item.status !== "processing" && item.status !== "previewing") ||
        !item.sessionId
      ) {
        return true;
      }
      const key = `${item.toolType}:${item.sessionId}`;
      const latestCompletedAt = latestCompletedBySession.get(key);
      if (latestCompletedAt == null) {
        return true;
      }
      const workflowStartedAt = new Date(item.createdAt).getTime();
      return workflowStartedAt > latestCompletedAt;
    });

    const dedupedWorkflowMap = new Map<string, StudioHistoryItem>();
    for (const item of filteredWorkflow) {
      const normalizedRunId = normalizeRunId(item.runId);
      const logicalKey =
        item.sessionId && normalizedRunId
          ? `${item.toolType}:${item.sessionId}:${normalizedRunId}`
          : item.id;
      const existing = dedupedWorkflowMap.get(logicalKey);
      if (!existing) {
        dedupedWorkflowMap.set(logicalKey, item);
        continue;
      }
      dedupedWorkflowMap.set(
        logicalKey,
        pickPreferredWorkflowItem(existing, item)
      );
    }
    const dedupedWorkflow = [...dedupedWorkflowMap.values()];

    const workflowArtifactIds = new Set(
      dedupedWorkflow
        .map((item) => item.artifactId)
        .filter((id): id is string => Boolean(id))
    );
    const workflowRunKeys = new Set(
      dedupedWorkflow
        .filter((item) => item.sessionId && normalizeRunId(item.runId))
        .map(
          (item) =>
            `${item.toolType}:${item.sessionId}:${normalizeRunId(item.runId)}`
        )
    );

    const dedupedArtifacts = sessionScopedArtifacts.filter((item) => {
      if (
        MANAGED_LIFECYCLE_TOOLS.has(item.toolType) &&
        item.supersededByArtifactId
      ) {
        return false;
      }
      if (item.artifactId && workflowArtifactIds.has(item.artifactId)) {
        return false;
      }
      if (item.sessionId && item.runId) {
        if (
          workflowRunKeys.has(
            `${item.toolType}:${item.sessionId}:${item.runId}`
          )
        ) {
          return false;
        }
      }
      return true;
    });

    return TOOL_ORDER.map((toolType) => {
      const items = [...dedupedWorkflow, ...dedupedArtifacts]
        .filter((item) => !hiddenHistoryIds[item.id])
        .filter((item) => item.toolType === toolType)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      return [toolType, items] as [
        GenerationToolType,
        StudioHistoryItem[],
      ];
    }).filter(([, items]) => items.length > 0);
  }, [activeSessionId, artifactHistoryByTool, hiddenHistoryIds, workflowItems]);

  return {
    groupedHistory,
    currentStepByTool,
    requestedStepByTool,
    trackStep,
    requestStep,
    acknowledgeStep,
    recordWorkflowEntry,
    archiveHistoryItem,
    archivedHistory,
    unarchiveHistoryItem,
    deleteArchivedHistoryItem,
  };
}
