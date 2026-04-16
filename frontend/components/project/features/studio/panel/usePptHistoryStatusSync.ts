"use client";

import { useEffect, useMemo, useRef } from "react";
import { generateApi } from "@/lib/sdk";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import type {
  StudioHistoryItem,
  StudioPptHistoryStatus,
  StudioHistoryStatus,
  StudioHistoryStep,
} from "../history/types";

const SYNC_INTERVAL_MS = 2500;
const EVENT_PAGE_LIMIT = 200;
const EVENT_PAGE_CAP = 20;

type PptDerivedStatus = {
  status: StudioHistoryStatus;
  step: StudioHistoryStep;
  ppt_status?: StudioPptHistoryStatus;
  terminal: boolean;
};

interface UsePptHistoryStatusSyncArgs {
  activeSessionId: string | null;
  groupedHistory: Array<[GenerationToolType | string, StudioHistoryItem[]]>;
  resolvePptRunId: (fallback?: string | null) => string | null;
  recordWorkflowEntry: (payload: {
    toolType: GenerationToolType;
    title: string;
    status: StudioHistoryStatus;
    step: StudioHistoryStep;
    ppt_status?: StudioPptHistoryStatus;
    sessionId?: string | null;
    runId?: string;
    runNo?: number;
    titleSource?: string;
    toolLabel?: string;
  }) => void;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function isMatchingSlideReadyEvent(
  event: { event_type?: unknown; payload?: unknown },
  runId: string
): boolean {
  const eventType = readString(event.event_type);
  if (eventType !== "ppt.slide.generated" && eventType !== "slide.generated") {
    return false;
  }
  const payload =
    event.payload && typeof event.payload === "object"
      ? (event.payload as Record<string, unknown>)
      : null;
  const payloadRunId =
    readString(payload?.run_id) ||
    readString(
      (payload?.section_payload as { run_id?: unknown } | undefined)?.run_id
    );
  return payloadRunId === runId;
}

export function derivePptStatus(params: {
  sessionState: string | null;
  runStatus: string | null;
  runStep: string | null;
  hasSlideReadyEvent: boolean;
}): PptDerivedStatus | null {
  const sessionState = readString(params.sessionState)?.toUpperCase() ?? null;
  const runStatus = readString(params.runStatus)?.toLowerCase() ?? null;
  const runStep = readString(params.runStep)?.toLowerCase() ?? null;

  if (sessionState === "FAILED" || runStatus === "failed") {
    return {
      status: "failed",
      step: "preview",
      terminal: true,
    };
  }

  if (
    sessionState === "SUCCESS" ||
    runStatus === "completed" ||
    runStep === "completed"
  ) {
    return {
      status: "completed",
      step: "preview",
      terminal: true,
    };
  }

  if (params.hasSlideReadyEvent) {
    return {
      status: "previewing",
      step: "preview",
      ppt_status: "slide_preview_ready",
      terminal: false,
    };
  }

  if (sessionState === "AWAITING_OUTLINE_CONFIRM") {
    return {
      status: "draft",
      step: "outline",
      ppt_status: "outline_pending_confirm",
      terminal: false,
    };
  }

  if (sessionState === "DRAFTING_OUTLINE") {
    return {
      status: "draft",
      step: "outline",
      ppt_status: "outline_generating",
      terminal: false,
    };
  }

  if (sessionState === "GENERATING_CONTENT" || sessionState === "RENDERING") {
    return {
      status: "processing",
      step: "preview",
      ppt_status: "slides_generating",
      terminal: false,
    };
  }

  if (runStep === "outline") {
    return {
      status: "draft",
      step: "outline",
      ppt_status: "outline_generating",
      terminal: false,
    };
  }

  if (
    runStep === "generate" ||
    runStep === "preview" ||
    runStatus === "processing"
  ) {
    return {
      status: "processing",
      step: "preview",
      ppt_status: "slides_generating",
      terminal: false,
    };
  }

  return null;
}

export function usePptHistoryStatusSync({
  activeSessionId,
  groupedHistory,
  resolvePptRunId,
  recordWorkflowEntry,
}: UsePptHistoryStatusSyncArgs) {
  const cursorRef = useRef<string | null>(null);
  const hasSlideReadyEventRef = useRef(false);
  const syncingRef = useRef(false);
  const runKeyRef = useRef<string | null>(null);

  const activePptItem = useMemo(() => {
    if (!activeSessionId) return null;
    const pptGroup = groupedHistory.find(([toolType]) => toolType === "ppt");
    const items = pptGroup?.[1] ?? [];
    return (
      items.find(
        (item) =>
          item.toolType === "ppt" &&
          item.origin === "workflow" &&
          item.sessionId === activeSessionId
      ) ?? null
    );
  }, [activeSessionId, groupedHistory]);

  const sessionId = activeSessionId;
  const runId = useMemo(() => {
    if (!activePptItem || !sessionId) return null;
    return resolvePptRunId(activePptItem.runId ?? null);
  }, [activePptItem, resolvePptRunId, sessionId]);

  useEffect(() => {
    if (!sessionId || !activePptItem || !runId) return;

    const runKey = `${sessionId}:${runId}`;
    if (runKeyRef.current !== runKey) {
      runKeyRef.current = runKey;
      cursorRef.current = null;
      hasSlideReadyEventRef.current = false;
    }

    let cancelled = false;
    let timer: number | null = null;

    const pullEvents = async (fullCatchup: boolean) => {
      let pageCount = 0;
      while (pageCount < EVENT_PAGE_CAP) {
        const response = await generateApi.listEvents(sessionId, {
          cursor: cursorRef.current,
          limit: EVENT_PAGE_LIMIT,
        });
        const events = response?.data?.events ?? [];
        if (!events.length) return;
        for (const event of events) {
          if (isMatchingSlideReadyEvent(event, runId)) {
            hasSlideReadyEventRef.current = true;
          }
          const cursor = readString(event.cursor);
          if (cursor) cursorRef.current = cursor;
        }
        pageCount += 1;
        if (!fullCatchup || events.length < EVENT_PAGE_LIMIT) return;
      }
    };

    const syncOnce = async (): Promise<boolean> => {
      if (syncingRef.current) return false;
      syncingRef.current = true;
      try {
        await pullEvents(false);
        let runResponse: Awaited<ReturnType<typeof generateApi.getRun>> | null =
          null;
        try {
          runResponse = await generateApi.getRun(sessionId, runId);
        } catch {
          runResponse = null;
        }
        const runRecord = runResponse?.data?.run as
          | { run_status?: unknown; run_step?: unknown }
          | null
          | undefined;
        const snapshot = await generateApi.getSessionSnapshot(sessionId, {
          run_id: runId,
        });
        const sessionState = readString(snapshot?.data?.session?.state);
        const currentRun = snapshot?.data?.current_run as
          | { run_status?: unknown; run_step?: unknown }
          | null
          | undefined;
        const runStatus =
          readString(runRecord?.run_status) ||
          readString(currentRun?.run_status);
        const runStep =
          readString(runRecord?.run_step) || readString(currentRun?.run_step);
        const derived = derivePptStatus({
          sessionState,
          runStatus,
          runStep,
          hasSlideReadyEvent: hasSlideReadyEventRef.current,
        });
        if (!derived) return false;

        const isSameStatus =
          activePptItem.status === derived.status &&
          activePptItem.step === derived.step &&
          activePptItem.ppt_status === derived.ppt_status;
        if (!isSameStatus) {
          recordWorkflowEntry({
            toolType: "ppt",
            title: activePptItem.title,
            status: derived.status,
            step: derived.step,
            ppt_status: derived.ppt_status,
            sessionId,
            runId,
            runNo: activePptItem.runNo ?? undefined,
            toolLabel: "PPT",
          });
        }
        return derived.terminal;
      } catch {
        return false;
      } finally {
        syncingRef.current = false;
      }
    };

    const start = async () => {
      try {
        await pullEvents(true);
      } catch {
        // Ignore event catchup error and keep running sync loop.
      }
      if (cancelled) return;
      const done = await syncOnce();
      if (cancelled || done) return;
      timer = window.setInterval(() => {
        void (async () => {
          if (cancelled) return;
          const terminal = await syncOnce();
          if (terminal && timer !== null) {
            window.clearInterval(timer);
            timer = null;
          }
        })();
      }, SYNC_INTERVAL_MS);
    };

    void start();
    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [activePptItem, recordWorkflowEntry, runId, sessionId]);
}
