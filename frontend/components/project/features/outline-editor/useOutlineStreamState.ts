"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { generateApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import type { SessionStatePayload } from "@/stores/project-store/types";
import {
  DIEGO_EVENT_PREFIXES,
  EVENT_PAGE_CAP,
  EVENT_PAGE_LIMIT,
  STATE_LABELS,
} from "./constants";
import type {
  DiegoStreamChannel,
  OutlineDocument,
  OutlineEditorConfig,
  OutlineEditorPanelProps,
  PanelPhase,
  SessionEventLike,
  SlideDraft,
  StreamLog,
} from "./types";
import {
  appendUniqueStreamLog,
  buildOutlinePayloadFromSlides,
  ensureSlidesCount,
  isSlideContentReady,
  mergeParsedNodesIntoSlides,
  normalizeLayoutHint,
  normalizePageType,
  normalizeText,
  parseEventPayloadObject,
  parseOutlineNodesFromStream,
  parseSessionSlides,
  readOutlineRunCache,
  resolveEventKey,
  resolveEventLog,
  resolveExpectedPages,
  resolveSessionFailureMessage,
  seedProcessedKeysFromLogs,
  serializeComparableOutline,
  writeOutlineRunCache,
} from "./utils";

export interface OutlineStreamStateResult {
  // State
  phase: PanelPhase;
  preambleCollapsed: boolean;
  streamLogs: StreamLog[];
  slides: SlideDraft[];
  outlineStreamText: string;
  isConfirming: boolean;
  errorMessage: string | null;
  analysisPageCount: number;
  editingTitleId: string | null;
  editingContentId: string | null;
  targetPageCount: number;
  isEditable: boolean;
  canConfirm: boolean;
  canGoPreview: boolean;
  outlineIncomplete: boolean;
  readySlidesCount: number;
  phaseText: string;
  logTitle: string;
  isConnected: boolean;
  streamError: unknown;
  sessionState: string;
  logContainerRef: React.Ref<HTMLDivElement>;
  // Callbacks
  setPreambleCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingTitleId: React.Dispatch<React.SetStateAction<string | null>>;
  setEditingContentId: React.Dispatch<React.SetStateAction<string | null>>;
  handleSlideFieldChange: (slideId: string, updates: Partial<SlideDraft>) => void;
  handleReorderSlides: (newSlides: SlideDraft[]) => void;
  handleConfirm: () => Promise<void>;
}

export function useOutlineStreamState({
  topic: _topic = "课程大纲",
  isBootstrapping = false,
  onConfirm,
  onPreview,
}: Pick<
  OutlineEditorPanelProps,
  "topic" | "isBootstrapping" | "onConfirm" | "onPreview"
>): OutlineStreamStateResult {
  const { generationSession, activeRunId, updateOutline, confirmOutline } =
    useProjectStore(
      useShallow((state) => ({
        generationSession: state.generationSession,
        activeRunId: state.activeRunId,
        updateOutline: state.updateOutline,
        confirmOutline: state.confirmOutline,
      }))
    );

  const sessionId = generationSession?.session?.session_id || "";
  const sessionState = generationSession?.session?.state || "";
  const outlineVersion = Number(generationSession?.outline?.version || 1);
  const outlineSummary =
    typeof generationSession?.outline?.summary === "string"
      ? generationSession.outline.summary
      : "";
  const expectedPages = resolveExpectedPages(generationSession?.options);
  const currentRunId = activeRunId || null;

  const [phase, setPhase] = useState<PanelPhase>("preamble_streaming");
  const [preambleCollapsed, setPreambleCollapsed] = useState(false);
  const [streamLogs, setStreamLogs] = useState<StreamLog[]>([]);
  const [outlineStreamText, setOutlineStreamText] = useState("");
  const [slides, setSlides] = useState<SlideDraft[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analysisPageCount, setAnalysisPageCount] = useState<number>(0);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);

  const processedEventKeysRef = useRef<Set<string>>(new Set());
  const processedDiegoSeqRef = useRef<Set<number>>(new Set());
  const lastDiegoSeqRef = useRef(0);
  const requirementsResultLoggedRef = useRef(false);
  const lastLoggedStateRef = useRef<string>("");
  const lastRunScopeRef = useRef<string>("");
  const runScopedSnapshotSyncRef = useRef<string>("");
  const snapshotSyncInFlightRef = useRef<Promise<SessionStatePayload | null> | null>(
    null
  );
  const logContainerRef = useRef<HTMLDivElement>(null!);
  const targetPageCountRef = useRef<number>(0);

  // When true, the outline is already complete (loaded from snapshot or cache
  // in editing phase). Prevents catch-up event replay from regressing phase,
  // re-processing outline tokens, and duplicating slides.
  const outlineLockedRef = useRef(false);

  const targetPageCount = analysisPageCount || expectedPages;
  const snapshotRunId = generationSession?.current_run?.run_id || null;
  const isSnapshotAlignedToRun =
    !currentRunId || !snapshotRunId || currentRunId === snapshotRunId;

  const { events, isConnected, error: streamError } = useGenerationEvents({
    sessionId: sessionId && currentRunId ? sessionId : null,
    runId: currentRunId,
  });

  useEffect(() => {
    targetPageCountRef.current = targetPageCount;
  }, [targetPageCount]);

  const hydrateRunScopedSnapshot = useCallback(async () => {
    if (!sessionId || !currentRunId) return null;
    if (snapshotSyncInFlightRef.current) {
      return snapshotSyncInFlightRef.current;
    }
    const syncTask = (async () => {
      try {
        const response = await generateApi.getSessionSnapshot(sessionId, {
          run_id: currentRunId,
        });
        const latestSession = (response?.data ?? null) as SessionStatePayload | null;
        if (!latestSession) return null;
        useProjectStore.setState({
          generationSession: latestSession,
          activeRunId: currentRunId,
        });
        runScopedSnapshotSyncRef.current = `${sessionId}:${currentRunId}`;
        return latestSession;
      } catch {
        return null;
      }
    })();
    snapshotSyncInFlightRef.current = syncTask;
    try {
      return await syncTask;
    } finally {
      if (snapshotSyncInFlightRef.current === syncTask) {
        snapshotSyncInFlightRef.current = null;
      }
    }
  }, [currentRunId, sessionId]);

  // Reset state when run scope changes
  useEffect(() => {
    const runScopeKey = `${sessionId || "no-session"}:${currentRunId || "no-run"}`;
    if (runScopeKey === lastRunScopeRef.current) return;
    lastRunScopeRef.current = runScopeKey;
    processedEventKeysRef.current.clear();
    processedDiegoSeqRef.current.clear();
    lastDiegoSeqRef.current = 0;
    requirementsResultLoggedRef.current = false;
    lastLoggedStateRef.current = "";
    outlineLockedRef.current = false;
    setErrorMessage(null);
    runScopedSnapshotSyncRef.current = "";
    snapshotSyncInFlightRef.current = null;

    const cached = readOutlineRunCache(sessionId || null, currentRunId || null);
    if (cached) {
      const cachedTargetCount =
        cached.analysisPageCount || expectedPages || cached.slides.length || 0;
      setStreamLogs(cached.streamLogs);
      processedEventKeysRef.current = seedProcessedKeysFromLogs(cached.streamLogs);
      lastDiegoSeqRef.current = cached.lastDiegoSeq || 0;
      setOutlineStreamText(cached.outlineStreamText);
      setAnalysisPageCount(cached.analysisPageCount);
      setSlides(ensureSlidesCount(cached.slides, cachedTargetCount));
      setPhase(cached.phase);
      setPreambleCollapsed(cached.preambleCollapsed);
      // If cached phase is already editing, lock outline to prevent replay
      if (cached.phase === "editing") {
        outlineLockedRef.current = true;
      }
    } else {
      setStreamLogs([]);
      setOutlineStreamText("");
      setPreambleCollapsed(false);
      setAnalysisPageCount(0);
    }

    const canSeedFromSnapshot =
      isSnapshotAlignedToRun &&
      (sessionState === "AWAITING_OUTLINE_CONFIRM" ||
        sessionState === "GENERATING_CONTENT" ||
        sessionState === "RENDERING" ||
        sessionState === "SUCCESS");
    const sessionSlides = canSeedFromSnapshot
      ? parseSessionSlides(generationSession)
      : [];
    const baselineCount =
      sessionSlides.length ||
      (cached?.analysisPageCount || 0) ||
      expectedPages ||
      cached?.slides.length ||
      0;
    if (sessionSlides.length > 0 || !cached) {
      setSlides(
        ensureSlidesCount(
          sessionSlides.length > 0 ? sessionSlides : cached?.slides ?? [],
          baselineCount
        )
      );
    }

    if (canSeedFromSnapshot && sessionState === "AWAITING_OUTLINE_CONFIRM") {
      setPhase("editing");
      setPreambleCollapsed(true);
      outlineLockedRef.current = true;
      // Clear accumulated outline stream text to prevent duplication on
      // subsequent re-entries. Slides are already loaded from snapshot.
      setOutlineStreamText("");
      return;
    }
    if (!cached) {
      setPhase("preamble_streaming");
    }
  }, [
    currentRunId,
    expectedPages,
    generationSession,
    isSnapshotAlignedToRun,
    sessionId,
    sessionState,
  ]);

  // Run-scoped snapshot sync
  useEffect(() => {
    if (!sessionId || !currentRunId) return;
    const runKey = `${sessionId}:${currentRunId}`;
    if (runScopedSnapshotSyncRef.current === runKey) return;
    if (snapshotRunId && snapshotRunId === currentRunId) {
      runScopedSnapshotSyncRef.current = runKey;
      return;
    }
    let cancelled = false;
    void (async () => {
      const latestSession = await hydrateRunScopedSnapshot();
      if (cancelled || !latestSession) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [currentRunId, hydrateRunScopedSnapshot, sessionId, snapshotRunId]);

  // Session state synchronization
  useEffect(() => {
    const sessionSlides = parseSessionSlides(generationSession);
    if (isSnapshotAlignedToRun && sessionState === "AWAITING_OUTLINE_CONFIRM") {
      if (sessionSlides.length > 0) {
        setSlides((prev) =>
          ensureSlidesCount(
            sessionSlides,
            targetPageCount || prev.length || sessionSlides.length
          )
        );
      }
      setPhase("editing");
      setPreambleCollapsed(true);
    }

    if (isSnapshotAlignedToRun && sessionState === "FAILED") {
      const message = resolveSessionFailureMessage(generationSession?.session);
      setErrorMessage(message);
    }
  }, [generationSession, isSnapshotAlignedToRun, sessionState, targetPageCount]);

  // Ensure slides match target page count
  useEffect(() => {
    if (targetPageCount <= 0) return;
    setSlides((prev) => ensureSlidesCount(prev, targetPageCount));
  }, [targetPageCount]);

  // Consume Diego events
  const consumeDiegoEvent = useCallback(
    (event: SessionEventLike) => {
      const key = resolveEventKey(event as never);
      if (processedEventKeysRef.current.has(key)) return;
      processedEventKeysRef.current.add(key);

      const payloadObject = parseEventPayloadObject(event.payload);
      const payload = payloadObject as {
        run_id?: string;
        progress_message?: string;
        section_payload?: {
          run_id?: string;
          stream_channel?: string;
          diego_event_type?: string;
          token?: string;
          diego_seq?: number;
          raw_payload?: Record<string, unknown>;
        };
      };
      const sectionPayload =
        payload.section_payload && typeof payload.section_payload === "object"
          ? payload.section_payload
          : null;

      const eventRunId =
        normalizeText(payload.run_id) ||
        normalizeText(sectionPayload?.run_id) ||
        null;
      if (currentRunId) {
        if (!eventRunId || currentRunId !== eventRunId) return;
      }

      const eventType = normalizeText(event.event_type);
      const state = normalizeText(event.state);
      if (state && state !== lastLoggedStateRef.current) {
        lastLoggedStateRef.current = state;
        if (state === "AWAITING_OUTLINE_CONFIRM") {
          setPhase("editing");
          setPreambleCollapsed(true);
        }
        if (state === "FAILED") {
          const failureFromPayload =
            normalizeText((payload as Record<string, unknown>).error_message) ||
            normalizeText((payload as Record<string, unknown>).message);
          if (failureFromPayload) {
            setErrorMessage(failureFromPayload);
          }
          void hydrateRunScopedSnapshot();
          setStreamLogs((prev) => {
            return appendUniqueStreamLog(prev, {
              id: `${key}:state:${state}`,
              ts: event.timestamp,
              title: "状态异常",
              detail: STATE_LABELS[state] || state,
              tone: "error",
            });
          });
        }
      }

      // When outline is already loaded from snapshot/cache, skip non-state
      // replay events to avoid duplicated logs/tokens, but keep terminal state.
      if (outlineLockedRef.current && state !== "FAILED") return;

      const diegoSeq = Number(sectionPayload?.diego_seq || 0);
      if (diegoSeq > 0) {
        if (diegoSeq <= lastDiegoSeqRef.current) return;
        if (processedDiegoSeqRef.current.has(diegoSeq)) return;
        processedDiegoSeqRef.current.add(diegoSeq);
        lastDiegoSeqRef.current = diegoSeq;
      }

      const diegoEventType =
        normalizeText(sectionPayload?.diego_event_type) || eventType;
      const isDiegoEvent =
        eventType === "progress.updated" ||
        Boolean(normalizeText(sectionPayload?.diego_event_type)) ||
        DIEGO_EVENT_PREFIXES.some((prefix) => diegoEventType.startsWith(prefix));
      if (!isDiegoEvent) return;

      const streamChannelRaw = normalizeText(sectionPayload?.stream_channel);
      const streamChannel = streamChannelRaw as DiegoStreamChannel | undefined;

      if (
        diegoEventType === "outline.token" ||
        (eventType === "outline.token" && streamChannel !== "diego.preamble")
      ) {
        // Skip outline token replay when outline is already loaded from
        // snapshot/cache. This prevents phase regression, outlineStreamText
        // accumulation, and slide duplication on re-entry.
        if (outlineLockedRef.current) return;

        const token =
          normalizeText(sectionPayload?.token) ||
          normalizeText(payload.progress_message);
        if (!token) return;
        setPhase("outline_streaming");
        setPreambleCollapsed(true);
        setOutlineStreamText((prev) => {
          const merged = `${prev}${token}`.slice(-120000);
          const parsedNodes = parseOutlineNodesFromStream(merged);
          if (parsedNodes.length > 0) {
            const desiredCount =
              targetPageCountRef.current > 0
                ? targetPageCountRef.current
                : Math.max(parsedNodes.length, expectedPages || 0);
            setSlides((current) =>
              mergeParsedNodesIntoSlides(current, parsedNodes, desiredCount)
            );
          }
          return merged;
        });
        return;
      }

      if (
        streamChannelRaw &&
        streamChannel !== "diego.preamble" &&
        streamChannel !== "diego.outline.token"
      ) {
        return;
      }

      const rawPayload =
        sectionPayload?.raw_payload &&
        typeof sectionPayload.raw_payload === "object"
          ? sectionPayload.raw_payload
          : (payload as Record<string, unknown>);
      if (
        diegoEventType === "requirements.analyzing.completed" ||
        diegoEventType === "requirements.analyzed"
      ) {
        if (requirementsResultLoggedRef.current) {
          return;
        }
        requirementsResultLoggedRef.current = true;
      }

      if (
        diegoEventType === "requirements.analyzing.completed" ||
        diegoEventType === "requirements.analyzed"
      ) {
        const fixedPageCount = Number(rawPayload.page_count_fixed || 0);
        if (fixedPageCount > 0) {
          setAnalysisPageCount((prev) =>
            prev === fixedPageCount ? prev : fixedPageCount
          );
          setSlides((current) => ensureSlidesCount(current, fixedPageCount));
        }
      }

      if (diegoEventType === "outline.completed") {
        setPhase("editing");
        setPreambleCollapsed(true);
        outlineLockedRef.current = true;
      }

      const normalized = resolveEventLog(diegoEventType, rawPayload);
      if (!normalized.title) return;

      setStreamLogs((prev) => {
        return appendUniqueStreamLog(prev, {
          id: key,
          ts: event.timestamp,
          title: normalized.title,
          detail: normalized.detail,
          tone: normalized.tone,
        });
      });
    },
    [currentRunId, expectedPages, hydrateRunScopedSnapshot]
  );

  // Process incoming events
  useEffect(() => {
    for (const event of events) {
      consumeDiegoEvent(event as SessionEventLike);
    }
  }, [consumeDiegoEvent, events]);

  // Handle stream error
  useEffect(() => {
    if (!streamError || !sessionId || !currentRunId) return;

    let cancelled = false;
    setErrorMessage((prev) =>
      prev || "Diego 事件流连接失败，正在同步任务状态..."
    );

    void (async () => {
      try {
        const latestSession = await hydrateRunScopedSnapshot();
        if (cancelled || !latestSession) return;

        const latestState =
          typeof latestSession?.session?.state === "string"
            ? latestSession.session.state
            : "";
        if (latestState === "FAILED") {
          setErrorMessage(resolveSessionFailureMessage(latestSession.session));
        }
      } catch {
        if (cancelled) return;
        setErrorMessage((prev) => prev || "Diego 事件流连接失败，请稍后重试");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentRunId, hydrateRunScopedSnapshot, sessionId, streamError]);

  // Catch-up: paginate historical events.
  // Skip entirely when outline is already locked (session confirmed, slides
  // loaded from snapshot/cache). Replaying events at that point only causes
  // phase regression, log duplication, and slide multiplication.
  useEffect(() => {
    if (!sessionId || !currentRunId) return;
    if (outlineLockedRef.current) return;
    let cancelled = false;
    void (async () => {
      let cursor: string | null = null;
      let pageCount = 0;
      while (!cancelled && pageCount < EVENT_PAGE_CAP) {
        const response = await generateApi.listEvents(sessionId, {
          cursor,
          limit: EVENT_PAGE_LIMIT,
          run_id: currentRunId,
        });
        const pageEvents = (response?.data?.events ?? []) as SessionEventLike[];
        if (!pageEvents.length) break;
        let nextCursor: string | null = cursor;
        for (const event of pageEvents) {
          consumeDiegoEvent(event);
          const eventCursor = normalizeText(event.cursor);
          if (eventCursor) {
            nextCursor = eventCursor;
          }
        }
        if (!nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
        if (pageEvents.length < EVENT_PAGE_LIMIT) break;
        pageCount += 1;
      }
    })().catch(() => {
      // Keep live stream resilient if catch-up query fails.
    });
    return () => {
      cancelled = true;
    };
  }, [consumeDiegoEvent, currentRunId, sessionId]);

  // Persist cache
  useEffect(() => {
    if (!sessionId || !currentRunId) return;
    const hasMeaningfulState =
      streamLogs.length > 0 ||
      Boolean(outlineStreamText) ||
      analysisPageCount > 0 ||
      slides.some(isSlideContentReady) ||
      phase === "editing";
    if (!hasMeaningfulState) return;
    writeOutlineRunCache(sessionId, currentRunId, {
      phase,
      preambleCollapsed,
      streamLogs,
      outlineStreamText,
      slides,
      analysisPageCount,
      lastDiegoSeq: lastDiegoSeqRef.current,
    });
  }, [
    analysisPageCount,
    currentRunId,
    outlineStreamText,
    phase,
    preambleCollapsed,
    sessionId,
    slides,
    streamLogs,
  ]);

  // Auto-scroll logs
  useEffect(() => {
    const node = logContainerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [streamLogs]);

  // Derived values
  const readySlidesCount = useMemo(
    () => slides.filter((slide) => isSlideContentReady(slide)).length,
    [slides]
  );

  const outlineIncomplete =
    targetPageCount > 0 && readySlidesCount < targetPageCount;
  const canGoPreview = ["GENERATING_CONTENT", "RENDERING", "SUCCESS"].includes(
    sessionState
  );
  const isEditable = phase === "editing";
  const canConfirm =
    isEditable &&
    slides.length > 0 &&
    !isConfirming &&
    !isBootstrapping &&
    !canGoPreview;

  const handleSlideFieldChange = (
    slideId: string,
    updates: Partial<SlideDraft>
  ) => {
    if (!isEditable || isConfirming) return;
    setSlides((prev) =>
      prev.map((slide) => {
        if (slide.id !== slideId) return slide;
        const next = { ...slide, ...updates };
        const pageType = normalizePageType(next.pageType, slide.pageType);
        return {
          ...next,
          pageType,
          layoutHint: normalizeLayoutHint(next.layoutHint, pageType),
        };
      })
    );
  };

  const handleConfirm = async () => {
    if (!sessionId || !canConfirm) return;
    setIsConfirming(true);
    setErrorMessage(null);
    try {
      const nextOutline = buildOutlinePayloadFromSlides(
        slides,
        outlineVersion,
        outlineSummary
      );

      const currentComparable = serializeComparableOutline(
        (generationSession?.outline as OutlineDocument | null) ?? null
      );
      const nextComparable = serializeComparableOutline(nextOutline);
      const outlineChanged = currentComparable !== nextComparable;

      if (outlineChanged) {
        await updateOutline(sessionId, nextOutline);
      }

      if (onConfirm) {
        const config: OutlineEditorConfig = {
          detailLevel: "standard",
          visualTheme: "auto",
          imageStyle: "auto",
          keywords: [],
        };
        onConfirm(nextOutline, config);
      }

      await confirmOutline(sessionId);
      onPreview?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsConfirming(false);
    }
  };

  const phaseText = useMemo(() => {
    if (phase === "preamble_streaming")
      return "Diego 正在分析需求并准备结构化大纲";
    if (phase === "outline_streaming")
      return "Diego 正在逐 token 填充大纲卡片";
    return "大纲已完成，可编辑并确认开始生成";
  }, [phase]);

  const logTitle = "需求与受众分析";

  return {
    phase,
    preambleCollapsed,
    streamLogs,
    slides,
    outlineStreamText,
    isConfirming,
    errorMessage,
    analysisPageCount,
    editingTitleId,
    editingContentId,
    targetPageCount,
    isEditable,
    canConfirm,
    canGoPreview,
    outlineIncomplete,
    readySlidesCount,
    phaseText,
    logTitle,
    isConnected,
    streamError,
    sessionState,
    logContainerRef,
    setPreambleCollapsed,
    setEditingTitleId,
    setEditingContentId,
    handleSlideFieldChange,
    handleReorderSlides: setSlides,
    handleConfirm,
  };
}
