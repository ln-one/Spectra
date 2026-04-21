"use client";

import { useEffect, useMemo, useRef } from "react";
import { generateApi } from "@/lib/sdk";
import { getArtifacts } from "@/lib/sdk/project-space/artifacts";
import { ApiError } from "@/lib/sdk/client";
import {
  toArtifactHistoryItem,
  type ArtifactHistoryItem,
  type GenerationToolType,
} from "@/lib/project-space/artifact-history";
import { TOOL_LABELS } from "../constants";
import type { StudioHistoryItem, StudioHistoryStatus, StudioHistoryStep } from "../history/types";
import type { ManagedResolvedTarget, StudioToolKey } from "../tools";

const SYNC_INTERVAL_MS = 2500;

type DerivedManagedStatus = {
  status: StudioHistoryStatus;
  step: StudioHistoryStep;
  terminal: boolean;
  artifactId?: string | null;
  runId?: string | null;
  runNo?: number | null;
};

interface UseManagedHistoryStatusSyncArgs {
  projectId: string | null;
  activeSessionId: string | null;
  groupedHistory: Array<[GenerationToolType | string, StudioHistoryItem[]]>;
  resolvedTarget: ManagedResolvedTarget | null | undefined;
  fetchArtifactHistory: (projectId: string, sessionId: string | null) => Promise<void>;
  recordWorkflowEntry: (payload: {
    workflowId?: string | null;
    toolType: GenerationToolType;
    title: string;
    status: StudioHistoryStatus;
    step: StudioHistoryStep;
    sessionId?: string | null;
    runId?: string;
    runNo?: number;
    artifactId?: string;
    toolLabel?: string;
  }) => string;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readManagedArtifact(
  artifacts: ArtifactHistoryItem[],
  toolType: GenerationToolType,
  sessionId: string,
  runId: string | null,
  artifactId: string | null
): ArtifactHistoryItem | null {
  const sessionArtifacts = artifacts.filter(
    (item) => item.toolType === toolType && item.sessionId === sessionId
  );
  if (artifactId) {
    const matched = sessionArtifacts.find((item) => item.artifactId === artifactId);
    if (matched) return matched;
  }
  if (runId) {
    const matched = sessionArtifacts.find((item) => item.runId === runId);
    if (matched) return matched;
  }
  return null;
}

function deriveManagedStatus(params: {
  runStatus: string | null;
  artifact: ArtifactHistoryItem | null;
  runId: string | null;
  artifactStatus?: string | null;
}): DerivedManagedStatus | null {
  const runStatus = readString(params.runStatus)?.toLowerCase() ?? null;
  const artifactStatus = readString(params.artifactStatus)?.toLowerCase() ?? null;
  const artifact = params.artifact;

  if (runStatus === "failed") {
    return {
      status: "failed",
      step: "preview",
      terminal: true,
      artifactId: artifact?.artifactId ?? null,
      runId: params.runId ?? artifact?.runId ?? null,
      runNo: artifact?.runNo ?? null,
    };
  }

  if (
    artifact &&
    (runStatus === "completed" || artifactStatus === "completed")
  ) {
    return {
      status: "completed",
      step: "preview",
      terminal: true,
      artifactId: artifact.artifactId,
      runId: params.runId ?? artifact.runId ?? null,
      runNo: artifact.runNo ?? null,
    };
  }

  if (artifact) {
    return {
      status: "previewing",
      step: "preview",
      terminal: true,
      artifactId: artifact.artifactId,
      runId: params.runId ?? artifact.runId ?? null,
      runNo: artifact.runNo ?? null,
    };
  }

  if (
    runStatus === "processing" ||
    runStatus === "pending" ||
    artifactStatus === "processing"
  ) {
    return {
      status: "processing",
      step: "preview",
      terminal: false,
      runId: params.runId,
      runNo: null,
    };
  }

  return null;
}

export function useManagedHistoryStatusSync({
  projectId,
  activeSessionId,
  groupedHistory,
  resolvedTarget,
  fetchArtifactHistory,
  recordWorkflowEntry,
}: UseManagedHistoryStatusSyncArgs) {
  const syncingRef = useRef(false);
  const syncedKeyRef = useRef<string | null>(null);

  const targetToolType = resolvedTarget?.toolType as GenerationToolType | null;
  const activeManagedItem = useMemo(() => {
    if (!targetToolType) return null;
    const toolGroup = groupedHistory.find(([toolType]) => toolType === targetToolType);
    const items = toolGroup?.[1] ?? [];
    const targetSessionId = resolvedTarget?.sessionId ?? activeSessionId;
    const targetRunId = resolvedTarget?.runId ?? null;
    const targetArtifactId = resolvedTarget?.artifactId ?? null;
    if (!targetSessionId) return null;
    return (
      items.find(
        (item) =>
          item.sessionId === targetSessionId &&
          ((targetArtifactId && item.artifactId === targetArtifactId) ||
            (targetRunId && item.runId === targetRunId))
      ) ??
      null
    );
  }, [activeSessionId, groupedHistory, resolvedTarget, targetToolType]);

  useEffect(() => {
    if (!projectId || !targetToolType) return;
    const sessionId = resolvedTarget?.sessionId ?? activeSessionId ?? null;
    if (!sessionId) return;

    const seedRunId = resolvedTarget?.runId ?? activeManagedItem?.runId ?? null;
    const seedArtifactId =
      resolvedTarget?.artifactId ?? activeManagedItem?.artifactId ?? null;
    const seedStatus = resolvedTarget?.status ?? activeManagedItem?.status ?? null;
    if (
      seedStatus === "completed" ||
      seedStatus === "failed" ||
      (!seedRunId && !seedArtifactId)
    ) {
      return;
    }

    const syncKey = `${targetToolType}:${sessionId}:${seedRunId ?? "no-run"}:${seedArtifactId ?? "no-artifact"}`;
    if (syncedKeyRef.current === syncKey) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const sync = async () => {
      if (syncingRef.current || cancelled) return;
      syncingRef.current = true;
      try {
        await fetchArtifactHistory(projectId, sessionId);
        const [runResponse, artifactsResponse] = await Promise.all([
          seedRunId ? generateApi.getRun(sessionId, seedRunId).catch(() => null) : null,
          getArtifacts(projectId, { session_id: sessionId }),
        ]);
        if (cancelled) return;
        const resolvedRunId =
          seedRunId ??
          readString((runResponse?.data?.run as { run_id?: unknown } | null)?.run_id) ??
          readString(activeManagedItem?.runId) ??
          null;
        const runRecord = runResponse?.data?.run ?? null;
        const artifactItems = (artifactsResponse.artifacts ?? []).map(toArtifactHistoryItem);
        const matchedArtifact = readManagedArtifact(
          artifactItems,
          targetToolType,
          sessionId,
          resolvedRunId,
          seedArtifactId
        );
        const derived = deriveManagedStatus({
          runStatus: readString(
            (runRecord as { run_status?: unknown } | null)?.run_status
          ),
          artifact: matchedArtifact,
          runId: resolvedRunId,
          artifactStatus: matchedArtifact?.status ?? null,
        });
        if (!derived) return;

        syncedKeyRef.current = syncKey;
        if (derived.artifactId) {
          return;
        }
        recordWorkflowEntry({
          toolType: targetToolType,
          title:
            matchedArtifact?.title ||
            activeManagedItem?.title ||
            TOOL_LABELS[targetToolType as StudioToolKey] ||
            "Studio 结果",
          status: derived.status,
          step: derived.step,
          sessionId,
          artifactId: derived.artifactId ?? undefined,
          runId: derived.runId ?? undefined,
          runNo: derived.runNo ?? undefined,
          toolLabel: TOOL_LABELS[targetToolType as StudioToolKey],
        });

        if (!derived.terminal && !cancelled) {
          timer = window.setTimeout(sync, SYNC_INTERVAL_MS);
        }
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === "RESOURCE_CONFLICT" &&
          error.details?.reason === "state_event_mismatch"
        ) {
          timer = window.setTimeout(sync, SYNC_INTERVAL_MS);
          return;
        }
        return;
      } finally {
        syncingRef.current = false;
      }
    };

    void sync();
    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [
    activeManagedItem,
    activeSessionId,
    fetchArtifactHistory,
    groupedHistory,
    resolvedTarget,
    projectId,
    recordWorkflowEntry,
    targetToolType,
  ]);
}
