"use client";

import { useCallback, useMemo, useState } from "react";
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
};

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
  const sessionToken = input.sessionId ?? "local";
  const artifactToken = input.artifactId ?? "none";
  return `workflow:${input.toolType}:${sessionToken}:${input.step}:${input.status}:${artifactToken}`;
}

type RequestedStepByTool = Partial<
  Record<GenerationToolType, StudioHistoryStep>
>;
type CurrentStepByTool = Partial<Record<GenerationToolType, StudioHistoryStep>>;

export function useStudioWorkflowHistory(
  artifactHistoryByTool: ArtifactHistoryByTool
) {
  const [workflowItems, setWorkflowItems] = useState<StudioHistoryItem[]>([]);
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

  const groupedHistory = useMemo(() => {
    const artifactItems = TOOL_ORDER.flatMap((toolType) =>
      (artifactHistoryByTool[toolType] ?? []).map(toArtifactHistoryItem)
    );
    const completedSessions = new Set(
      artifactItems
        .filter((item) => item.status === "completed" && item.sessionId)
        .map((item) => `${item.toolType}:${item.sessionId}`)
    );
    const filteredWorkflow = workflowItems.filter((item) => {
      if (item.status !== "processing" || !item.sessionId) return true;
      return !completedSessions.has(`${item.toolType}:${item.sessionId}`);
    });

    return TOOL_ORDER.map((toolType) => {
      const items = [...filteredWorkflow, ...artifactItems]
        .filter((item) => item.toolType === toolType)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      return [toolType, items] as [GenerationToolType, StudioHistoryItem[]];
    }).filter(([, items]) => items.length > 0);
  }, [artifactHistoryByTool, workflowItems]);

  return {
    groupedHistory,
    currentStepByTool,
    requestedStepByTool,
    trackStep,
    requestStep,
    acknowledgeStep,
    recordWorkflowEntry,
  };
}
