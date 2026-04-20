"use client";

import { useEffect, useMemo, useRef } from "react";
import { generateApi } from "@/lib/sdk";
import { getArtifacts } from "@/lib/sdk/project-space/artifacts";
import {
  toArtifactHistoryItem,
  type ArtifactHistoryItem,
  type GenerationToolType,
} from "@/lib/project-space/artifact-history";
import type {
  StudioHistoryItem,
  StudioHistoryStatus,
  StudioHistoryStep,
} from "../history/types";

const SYNC_INTERVAL_MS = 2500;

type DerivedWordStatus = {
  status: StudioHistoryStatus;
  step: StudioHistoryStep;
  terminal: boolean;
  artifactId?: string | null;
  runId?: string | null;
  runNo?: number | null;
};

interface UseWordHistoryStatusSyncArgs {
  projectId: string | null;
  activeSessionId: string | null;
  groupedHistory: Array<[GenerationToolType | string, StudioHistoryItem[]]>;
  wordResultTarget:
    | {
        sessionId?: string | null;
        runId?: string | null;
        artifactId?: string | null;
        status?: StudioHistoryStatus | null;
      }
    | null
    | undefined;
  fetchArtifactHistory: (projectId: string, sessionId: string | null) => Promise<void>;
  recordWorkflowEntry: (payload: {
    toolType: GenerationToolType;
    title: string;
    status: StudioHistoryStatus;
    step: StudioHistoryStep;
    sessionId?: string | null;
    runId?: string;
    runNo?: number;
    artifactId?: string;
    toolLabel?: string;
  }) => void;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readWordArtifact(
  artifacts: ArtifactHistoryItem[],
  sessionId: string,
  runId: string | null,
  artifactId: string | null
): ArtifactHistoryItem | null {
  const sessionArtifacts = artifacts.filter(
    (item) => item.toolType === "word" && item.sessionId === sessionId
  );
  if (artifactId) {
    const matched = sessionArtifacts.find((item) => item.artifactId === artifactId);
    if (matched) return matched;
  }
  if (runId) {
    const matched = sessionArtifacts.find((item) => item.runId === runId);
    if (matched) return matched;
  }
  return sessionArtifacts[0] ?? null;
}

function deriveWordStatus(params: {
  sessionState: string | null;
  runStatus: string | null;
  artifact: ArtifactHistoryItem | null;
  runId: string | null;
}): DerivedWordStatus | null {
  const sessionState = readString(params.sessionState)?.toUpperCase() ?? null;
  const runStatus = readString(params.runStatus)?.toLowerCase() ?? null;
  const artifact = params.artifact;

  if (sessionState === "FAILED" || runStatus === "failed") {
    return {
      status: "failed",
      step: "preview",
      terminal: true,
      artifactId: artifact?.artifactId ?? null,
      runId: params.runId ?? artifact?.runId ?? null,
      runNo: artifact?.runNo ?? null,
    };
  }

  if (artifact && (sessionState === "SUCCESS" || runStatus === "completed")) {
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
      terminal: false,
      artifactId: artifact.artifactId,
      runId: params.runId ?? artifact.runId ?? null,
      runNo: artifact.runNo ?? null,
    };
  }

  if (runStatus === "processing" || runStatus === "pending") {
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

export function useWordHistoryStatusSync({
  projectId,
  activeSessionId,
  groupedHistory,
  wordResultTarget,
  fetchArtifactHistory,
  recordWorkflowEntry,
}: UseWordHistoryStatusSyncArgs) {
  const syncingRef = useRef(false);
  const syncedKeyRef = useRef<string | null>(null);

  const activeWordItem = useMemo(() => {
    const wordGroup = groupedHistory.find(([toolType]) => toolType === "word");
    const items = wordGroup?.[1] ?? [];
    const targetSessionId = wordResultTarget?.sessionId ?? activeSessionId;
    const targetRunId = wordResultTarget?.runId ?? null;
    const targetArtifactId = wordResultTarget?.artifactId ?? null;
    if (!targetSessionId) return null;
    return (
      items.find(
        (item) =>
          item.sessionId === targetSessionId &&
          ((targetArtifactId && item.artifactId === targetArtifactId) ||
            (targetRunId && item.runId === targetRunId))
      ) ??
      items.find((item) => item.sessionId === targetSessionId) ??
      null
    );
  }, [activeSessionId, groupedHistory, wordResultTarget]);

  useEffect(() => {
    if (!projectId) return;
    const sessionId = wordResultTarget?.sessionId ?? activeSessionId ?? null;
    if (!sessionId) return;

    const seedRunId = wordResultTarget?.runId ?? activeWordItem?.runId ?? null;
    const seedArtifactId =
      wordResultTarget?.artifactId ?? activeWordItem?.artifactId ?? null;
    const seedStatus =
      wordResultTarget?.status ?? activeWordItem?.status ?? null;
    if (
      seedStatus === "completed" ||
      seedStatus === "failed" ||
      (!seedRunId && !seedArtifactId)
    ) {
      return;
    }

    const syncKey = `${sessionId}:${seedRunId ?? "no-run"}:${seedArtifactId ?? "no-artifact"}`;
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
        const [snapshotResponse, artifactsResponse] = await Promise.all([
          generateApi.getSessionSnapshot(
            sessionId,
            seedRunId ? { run_id: seedRunId } : undefined
          ),
          getArtifacts(projectId, { session_id: sessionId }),
        ]);
        if (cancelled) return;
        const snapshot = snapshotResponse?.data ?? null;
        const snapshotRun = (
          snapshot as {
            current_run?: { run_id?: string | null; run_status?: string | null } | null;
          } | null
        )?.current_run;
        const resolvedRunId =
          seedRunId ??
          readString(snapshotRun?.run_id) ??
          readString(activeWordItem?.runId) ??
          null;
        const runResponse = resolvedRunId
          ? await generateApi.getRun(sessionId, resolvedRunId).catch(() => null)
          : null;
        const runRecord = runResponse?.data?.run ?? null;
        const artifactItems = (artifactsResponse.artifacts ?? []).map(toArtifactHistoryItem);
        const matchedArtifact = readWordArtifact(
          artifactItems,
          sessionId,
          resolvedRunId,
          seedArtifactId
        );
        const derived = deriveWordStatus({
          sessionState:
            readString((snapshot as { session?: { state?: string | null } } | null)?.session?.state),
          runStatus:
            readString(runRecord?.run_status) ??
            readString(snapshotRun?.run_status) ??
            null,
          artifact: matchedArtifact,
          runId: resolvedRunId,
        });
        if (!derived) return;

        syncedKeyRef.current = syncKey;
        recordWorkflowEntry({
          toolType: "word",
          title: matchedArtifact?.title || activeWordItem?.title || "教学文档",
          status: derived.status,
          step: derived.step,
          sessionId,
          artifactId: derived.artifactId ?? undefined,
          runId: derived.runId ?? undefined,
          runNo: derived.runNo ?? undefined,
          toolLabel: "教学文档",
        });

        if (!derived.terminal && !cancelled) {
          timer = window.setTimeout(sync, SYNC_INTERVAL_MS);
        }
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
    activeSessionId,
    activeWordItem,
    fetchArtifactHistory,
    projectId,
    recordWorkflowEntry,
    wordResultTarget,
  ]);
}
