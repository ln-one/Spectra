"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Play } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { getErrorMessage } from "@/lib/sdk/errors";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  OutlineDocument,
  OutlineEditorConfig,
  OutlineEditorPanelProps,
} from "./types";

export type { OutlineEditorConfig, OutlineEditorPanelProps } from "./types";

type DiegoStreamChannel = "diego.preamble" | "diego.outline.token";

type SlideDraft = {
  id: string;
  order: number;
  title: string;
  keyPoints: string[];
  estimatedMinutes?: number;
};

type StreamLog = {
  id: string;
  ts: string;
  eventType: string;
  message: string;
};

type PanelPhase = "preamble_streaming" | "outline_streaming" | "editing";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveEventKey(event: {
  event_id?: string;
  cursor?: string;
  timestamp?: string;
  event_type?: string;
}): string {
  if (event.event_id) return `id:${event.event_id}`;
  if (event.cursor) return `cursor:${event.cursor}`;
  return `fallback:${event.timestamp ?? ""}:${event.event_type ?? ""}`;
}

function parseSessionSlides(session: unknown): SlideDraft[] {
  if (!session || typeof session !== "object") return [];
  const outline = (session as { outline?: { nodes?: unknown } }).outline;
  const nodes = outline?.nodes;
  if (!Array.isArray(nodes)) return [];
  const slides: SlideDraft[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node || typeof node !== "object") continue;
    const current = node as {
      id?: unknown;
      order?: unknown;
      title?: unknown;
      key_points?: unknown;
      estimated_minutes?: unknown;
    };
    const keyPoints = Array.isArray(current.key_points)
      ? current.key_points
          .map((item) => normalizeText(item))
          .filter(Boolean)
      : [];
    slides.push({
      id: normalizeText(current.id) || `slide-${index + 1}`,
      order:
        typeof current.order === "number" && current.order > 0
          ? current.order
          : index + 1,
      title: normalizeText(current.title) || `第 ${index + 1} 页`,
      keyPoints,
      estimatedMinutes:
        typeof current.estimated_minutes === "number"
          ? current.estimated_minutes
          : undefined,
    });
  }
  return slides.sort((left, right) => left.order - right.order);
}

function buildOutlinePayloadFromSlides(
  slides: SlideDraft[],
  version: number,
  summary: string
): OutlineDocument {
  return {
    version: Math.max(version, 1),
    nodes: slides.map((slide, index) => ({
      id: slide.id,
      order: index + 1,
      title: slide.title.trim() || `第 ${index + 1} 页`,
      key_points: slide.keyPoints
        .map((point) => point.trim())
        .filter(Boolean),
      estimated_minutes:
        typeof slide.estimatedMinutes === "number"
          ? slide.estimatedMinutes
          : null,
    })),
    summary,
  };
}

function serializeComparableOutline(outline: OutlineDocument | null | undefined) {
  const nodes = Array.isArray(outline?.nodes) ? outline.nodes : [];
  return JSON.stringify(
    nodes.map((node, index) => ({
      id: normalizeText(node.id) || `slide-${index + 1}`,
      order:
        typeof node.order === "number" && node.order > 0 ? node.order : index + 1,
      title: normalizeText(node.title),
      key_points: Array.isArray(node.key_points)
        ? node.key_points.map((item) => normalizeText(item)).filter(Boolean)
        : [],
      estimated_minutes:
        typeof node.estimated_minutes === "number" ? node.estimated_minutes : null,
    }))
  );
}

export function OutlineEditorPanel({
  topic = "课程大纲",
  isBootstrapping = false,
  onBack,
  onConfirm,
  onPreview,
}: OutlineEditorPanelProps) {
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
  const expectedPages = Number(generationSession?.options?.pages || 0);
  const currentRunId =
    activeRunId || generationSession?.current_run?.run_id || null;

  const [phase, setPhase] = useState<PanelPhase>("preamble_streaming");
  const [preambleCollapsed, setPreambleCollapsed] = useState(false);
  const [streamLogs, setStreamLogs] = useState<StreamLog[]>([]);
  const [outlineStreamText, setOutlineStreamText] = useState("");
  const [slides, setSlides] = useState<SlideDraft[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const processedEventKeysRef = useRef<Set<string>>(new Set());
  const lastSessionIdRef = useRef<string>("");

  const { events } = useGenerationEvents({
    sessionId: sessionId || null,
  });

  useEffect(() => {
    if (sessionId === lastSessionIdRef.current) return;
    lastSessionIdRef.current = sessionId;
    processedEventKeysRef.current.clear();
    setStreamLogs([]);
    setOutlineStreamText("");
    setErrorMessage(null);
    setPreambleCollapsed(false);
    const sessionSlides = parseSessionSlides(generationSession);
    setSlides(sessionSlides);
    if (sessionSlides.length > 0 && sessionState === "AWAITING_OUTLINE_CONFIRM") {
      setPhase("editing");
      setPreambleCollapsed(true);
      return;
    }
    setPhase("preamble_streaming");
  }, [generationSession, sessionId, sessionState]);

  useEffect(() => {
    const sessionSlides = parseSessionSlides(generationSession);
    if (sessionSlides.length > 0 && sessionState === "AWAITING_OUTLINE_CONFIRM") {
      setSlides(sessionSlides);
      setPhase("editing");
      setPreambleCollapsed(true);
    }
    if (sessionState === "FAILED") {
      const message =
        generationSession?.session?.error_message ||
        generationSession?.session?.errorMessage ||
        generationSession?.session?.state_reason ||
        "大纲生成失败";
      setErrorMessage(message);
    }
  }, [generationSession, sessionState]);

  useEffect(() => {
    for (const event of events) {
      const key = resolveEventKey(event as never);
      if (processedEventKeysRef.current.has(key)) continue;
      processedEventKeysRef.current.add(key);

      const payload = (event.payload ?? {}) as {
        run_id?: string;
        progress_message?: string;
        section_payload?: {
          stream_channel?: string;
          diego_event_type?: string;
          token?: string;
        };
      };
      const eventRunId =
        typeof payload.run_id === "string" ? payload.run_id : null;
      if (currentRunId && eventRunId && currentRunId !== eventRunId) continue;
      if (event.event_type !== "progress.updated") continue;

      const sectionPayload =
        payload.section_payload && typeof payload.section_payload === "object"
          ? payload.section_payload
          : null;
      const streamChannel = sectionPayload?.stream_channel as
        | DiegoStreamChannel
        | undefined;
      if (
        streamChannel !== "diego.preamble" &&
        streamChannel !== "diego.outline.token"
      ) {
        continue;
      }

      if (streamChannel === "diego.preamble") {
        const message =
          normalizeText(payload.progress_message) ||
          normalizeText(sectionPayload?.diego_event_type) ||
          "处理中";
        setStreamLogs((prev) => {
          const next: StreamLog[] = [
            ...prev,
            {
              id: key,
              ts: event.timestamp,
              eventType: normalizeText(sectionPayload?.diego_event_type),
              message,
            },
          ];
          return next.slice(-120);
        });
        continue;
      }

      const token =
        normalizeText(sectionPayload?.token) ||
        normalizeText(payload.progress_message);
      if (!token) continue;
      setPhase("outline_streaming");
      setPreambleCollapsed(true);
      setOutlineStreamText((prev) => `${prev}${token}`);
    }
  }, [currentRunId, events]);

  const outlineIncomplete = expectedPages > 0 && slides.length < expectedPages;
  const canGoPreview = [
    "GENERATING_CONTENT",
    "RENDERING",
    "SUCCESS",
  ].includes(sessionState);
  const canConfirm =
    phase === "editing" &&
    slides.length > 0 &&
    !isConfirming &&
    !isBootstrapping &&
    !canGoPreview;

  const handleSlideFieldChange = (
    slideId: string,
    updates: Partial<SlideDraft>
  ) => {
    if (phase !== "editing" || isConfirming) return;
    setSlides((prev) =>
      prev.map((slide) =>
        slide.id === slideId ? { ...slide, ...updates } : slide
      )
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
    if (phase === "preamble_streaming") return "Diego 正在分析需求并准备大纲…";
    if (phase === "outline_streaming") return "Diego 正在流式生成大纲…";
    return "大纲已完成，可直接编辑并确认开始生成";
  }, [phase]);

  const logTitle =
    phase === "preamble_streaming" ? "生成过程" : "前置过程（已折叠）";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900">大纲生成与确认</h3>
            <p className="mt-1 truncate text-xs text-zinc-500">{topic}</p>
            <p className="mt-1 text-xs text-zinc-400">{phaseText}</p>
          </div>
          <div className="flex items-center gap-2">
            {onBack ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="h-8 text-xs text-zinc-600"
              >
                返回配置
              </Button>
            ) : null}
            {canGoPreview ? (
              <Button
                size="sm"
                onClick={() => onPreview?.()}
                className="h-8 text-xs"
              >
                <Play className="mr-1 h-3.5 w-3.5" />
                进入实时生成
              </Button>
            ) : null}
            {!canGoPreview ? (
              <Button
                size="sm"
                onClick={() => void handleConfirm()}
                disabled={!canConfirm || outlineIncomplete}
                className="h-8 text-xs"
              >
                {isConfirming ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1 h-3.5 w-3.5" />
                )}
                确认开始生成
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2">
        <button
          type="button"
          className="flex w-full items-center justify-between text-xs text-zinc-600"
          onClick={() => setPreambleCollapsed((prev) => !prev)}
        >
          <span>
            {logTitle}
            <span className="ml-2 text-zinc-400">({streamLogs.length})</span>
          </span>
          {preambleCollapsed ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </button>
        {!preambleCollapsed ? (
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded border border-zinc-200 bg-white p-2">
            {streamLogs.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                等待 Diego 返回过程信息…
              </div>
            ) : (
              streamLogs.map((item) => (
                <div key={item.id} className="text-xs leading-5 text-zinc-600">
                  <span className="mr-2 text-zinc-400">
                    {new Date(item.ts).toLocaleTimeString()}
                  </span>
                  <span>{item.message}</span>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {errorMessage ? (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {errorMessage}
          </div>
        ) : null}

        {phase !== "editing" ? (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500">大纲流式输出</div>
            <Textarea
              value={outlineStreamText}
              readOnly
              placeholder="等待 Diego 开始返回大纲 token..."
              className="min-h-[320px] resize-none border-zinc-200 bg-white font-mono text-xs leading-6"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              大纲已完成，当前为可编辑状态。
            </div>
            {outlineIncomplete ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                大纲页数尚未达到预期：{slides.length}/{expectedPages} 页。
              </div>
            ) : null}
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                className="rounded-xl border border-zinc-200 bg-white p-3"
              >
                <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                  <Pencil className="h-3.5 w-3.5" />
                  第 {index + 1} 页
                </div>
                <Input
                  value={slide.title}
                  onChange={(event) =>
                    handleSlideFieldChange(slide.id, {
                      title: event.target.value,
                    })
                  }
                  className="mb-2 h-9 text-sm"
                />
                <Textarea
                  value={slide.keyPoints.join("\n")}
                  onChange={(event) =>
                    handleSlideFieldChange(slide.id, {
                      keyPoints: event.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean),
                    })
                  }
                  className="min-h-[96px] resize-y text-xs leading-6"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
