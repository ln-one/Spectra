"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  ArtifactHistoryByTool,
  ArtifactHistoryItem,
  GenerationToolType,
} from "@/lib/project-space/artifact-history";
import type {
  StudioHistoryItem,
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

type WorkflowEntryInput = {
  toolType: GenerationToolType;
  title: string;
  status: StudioHistoryStatus;
  step: StudioHistoryStep;
  sessionId?: string | null;
  artifactId?: string;
  createdAt?: string;
  runId?: string;
  titleSource?: string;
  toolLabel?: string;
};

function summarizeTitleFromText(text: string, toolLabel: string): string {
  const cleaned = text
    .replace(/[`*_#>[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return `${toolLabel}任务`;
  const sentence = cleaned.split(/[。！？；\n\r,.!?;:]/)[0]?.trim() || cleaned;
  return sentence.slice(0, 16);
}

function toArtifactHistoryItem(item: ArtifactHistoryItem): StudioHistoryItem {
  return {
    id: `artifact:${item.artifactId}`,
    origin: "artifact",
    toolType: item.toolType,
    title: item.title,
    status: item.status,
    createdAt: item.createdAt,
    sessionId: item.sessionId ?? null,
    step: "preview",
    artifactId: item.artifactId,
  };
}

function makeWorkflowId(input: WorkflowEntryInput): string {
  if (input.runId) {
    return `workflow:${input.toolType}:${input.runId}`;
  }
  if (input.sessionId) {
    return `workflow:${input.toolType}:${input.sessionId}`;
  }
  const localToken = (input.artifactId || input.title || "local")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return `workflow:${input.toolType}:local:${localToken}`;
}

type RequestedStepByTool = Partial<
  Record<GenerationToolType, StudioHistoryStep>
>;
type CurrentStepByTool = Partial<Record<GenerationToolType, StudioHistoryStep>>;

export function useStudioWorkflowHistory(
  artifactHistoryByTool: ArtifactHistoryByTool,
  activeSessionId?: string | null
) {
  const [workflowItems, setWorkflowItems] = useState<StudioHistoryItem[]>([]);
  const polishedTitleRequestedRef = useRef<Record<string, true>>({});
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState<Record<string, true>>(
    {}
  );
  const [archivedHistoryById, setArchivedHistoryById] = useState<
    Record<string, StudioHistoryItem>
  >({});
  const [requestedStepByTool, setRequestedStepByTool] =
    useState<RequestedStepByTool>({});
  const [currentStepByTool, setCurrentStepByTool] = useState<CurrentStepByTool>(
    {}
  );

  const recordWorkflowEntry = useCallback((input: WorkflowEntryInput) => {
    const nextItem: StudioHistoryItem = {
      id: makeWorkflowId(input),
      origin: "workflow",
      toolType: input.toolType,
      title: input.title,
      status: input.status,
      createdAt: input.createdAt ?? new Date().toISOString(),
      sessionId: input.sessionId ?? null,
      step: input.step,
      artifactId: input.artifactId,
    };

    setWorkflowItems((prev) => {
      const index = prev.findIndex((item) => item.id === nextItem.id);
      if (index < 0) {
        return [nextItem, ...prev].slice(0, 80);
      }
      const rest = prev.filter((_, idx) => idx !== index);
      return [nextItem, ...rest];
    });

    if (!input.titleSource?.trim()) return;
    if (polishedTitleRequestedRef.current[nextItem.id]) return;
    polishedTitleRequestedRef.current[nextItem.id] = true;
    const polishedTitle = summarizeTitleFromText(
      input.titleSource.trim(),
      input.toolLabel || input.title
    );
    if (!polishedTitle) return;
    setWorkflowItems((prev) =>
      prev.map((item) =>
        item.id === nextItem.id ? { ...item, title: polishedTitle } : item
      )
    );
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
    (toolType: GenerationToolType, step: StudioHistoryStep) => {
      setRequestedStepByTool((prev) => {
        if (!prev[toolType] || prev[toolType] !== step) return prev;
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
    const completedSessions = new Set(
      artifactItems
        .filter((item) => item.status === "completed" && item.sessionId)
        .map((item) => `${item.toolType}:${item.sessionId}`)
    );
    const sessionScopedWorkflow = workflowItems.filter((item) => {
      if (!activeSessionId) {
        return !item.sessionId;
      }
      if (!item.sessionId) {
        return true;
      }
      return item.sessionId === activeSessionId;
    });

    const filteredWorkflow = sessionScopedWorkflow.filter((item) => {
      if (item.status !== "processing" || !item.sessionId) return true;
      return !completedSessions.has(`${item.toolType}:${item.sessionId}`);
    });

    return TOOL_ORDER.map((toolType) => {
      const items = [...filteredWorkflow, ...artifactItems]
        .filter((item) => !hiddenHistoryIds[item.id])
        .filter((item) => item.toolType === toolType)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      return [toolType, items] as [GenerationToolType, StudioHistoryItem[]];
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
  };
}
