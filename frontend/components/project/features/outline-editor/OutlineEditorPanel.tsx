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

type DiegoPageType = "cover" | "toc" | "section" | "content" | "summary";
type DiegoStreamChannel = "diego.preamble" | "diego.outline.token";

const PAGE_TYPE_OPTIONS: Array<{ value: DiegoPageType; label: string }> = [
  { value: "cover", label: "封面" },
  { value: "toc", label: "目录" },
  { value: "section", label: "章节过渡" },
  { value: "content", label: "内容" },
  { value: "summary", label: "总结" },
];

const LAYOUT_OPTIONS_BY_PAGE_TYPE: Record<DiegoPageType, string[]> = {
  cover: ["cover-asymmetric", "cover-center"],
  toc: ["toc-list", "toc-grid", "toc-sidebar", "toc-cards"],
  section: ["section-center", "section-accent-block", "section-split"],
  content: [
    "content-two-column",
    "content-icon-rows",
    "content-comparison",
    "content-timeline",
    "content-stat-callout",
    "content-showcase",
  ],
  summary: [
    "summary-takeaways",
    "summary-cta",
    "summary-thankyou",
    "summary-split",
  ],
};

const DEFAULT_LAYOUT_BY_PAGE_TYPE: Record<DiegoPageType, string> = {
  cover: "cover-asymmetric",
  toc: "toc-list",
  section: "section-center",
  content: "content-two-column",
  summary: "summary-takeaways",
};

const STATE_LABELS: Record<string, string> = {
  IDLE: "待启动",
  CONFIGURING: "配置中",
  ANALYZING: "分析中",
  DRAFTING_OUTLINE: "大纲生成中",
  AWAITING_OUTLINE_CONFIRM: "大纲待确认",
  GENERATING_CONTENT: "课件生成中",
  RENDERING: "课件渲染中",
  SUCCESS: "已完成",
  FAILED: "失败",
};

const DIEGO_EVENT_PREFIXES = [
  "requirements.",
  "outline.",
  "slide.",
  "compile.",
  "run.",
  "plan.",
  "qa.",
  "repair.",
  "slot.",
  "chart.",
  "artifact.",
  "research.",
  "template.",
  "llm.",
];

type SlideDraft = {
  id: string;
  order: number;
  title: string;
  keyPoints: string[];
  estimatedMinutes?: number;
  pageType: DiegoPageType;
  layoutHint: string;
};

type StreamLogTone = "info" | "success" | "warn" | "error";
type StreamLog = {
  id: string;
  ts: string;
  title: string;
  detail?: string;
  tone: StreamLogTone;
};

type PanelPhase = "preamble_streaming" | "outline_streaming" | "editing";
type ParsedOutlineNode = {
  title?: string;
  bullets?: string[];
  pageType?: DiegoPageType;
  layoutHint?: string;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePageType(
  value: unknown,
  fallback: DiegoPageType = "content"
): DiegoPageType {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "cover") return "cover";
  if (normalized === "toc") return "toc";
  if (normalized === "section") return "section";
  if (normalized === "content") return "content";
  if (normalized === "summary") return "summary";
  return fallback;
}

function normalizeLayoutHint(value: unknown, pageType: DiegoPageType): string {
  const normalized = normalizeText(value).toLowerCase();
  const allowed = LAYOUT_OPTIONS_BY_PAGE_TYPE[pageType];
  if (normalized && allowed.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_LAYOUT_BY_PAGE_TYPE[pageType];
}

function defaultPageTypeForOrder(order: number, total: number): DiegoPageType {
  if (order === 1) return "cover";
  if (order === 2 && total >= 4) return "toc";
  if (order === total) return "summary";
  if (order > 2 && order % 4 === 0) return "section";
  return "content";
}

function defaultSlideTitle(order: number): string {
  return `第 ${order} 页`;
}

function createEmptySlide(order: number, total: number): SlideDraft {
  const pageType = defaultPageTypeForOrder(order, total);
  return {
    id: `slide-${order}`,
    order,
    title: defaultSlideTitle(order),
    keyPoints: [],
    pageType,
    layoutHint: DEFAULT_LAYOUT_BY_PAGE_TYPE[pageType],
  };
}

function ensureSlidesCount(slides: SlideDraft[], targetCount: number): SlideDraft[] {
  if (!Number.isFinite(targetCount) || targetCount <= 0) return slides;
  const sorted = [...slides].sort((left, right) => left.order - right.order);
  const next: SlideDraft[] = [];
  for (let order = 1; order <= targetCount; order += 1) {
    const current = sorted[order - 1];
    if (current) {
      const pageType = normalizePageType(
        current.pageType,
        defaultPageTypeForOrder(order, targetCount)
      );
      next.push({
        ...current,
        id: current.id || `slide-${order}`,
        order,
        pageType,
        layoutHint: normalizeLayoutHint(current.layoutHint, pageType),
        title: normalizeText(current.title) || defaultSlideTitle(order),
      });
      continue;
    }
    next.push(createEmptySlide(order, targetCount));
  }
  return next;
}

function decodeJsonString(raw: string): string {
  return raw
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\")
    .trim();
}

function extractQuotedList(raw: string): string[] {
  const values: string[] = [];
  const regex = /"((?:\\.|[^"\\])*)"/g;
  for (const match of raw.matchAll(regex)) {
    const decoded = decodeJsonString(match[1] || "");
    if (decoded) values.push(decoded);
  }
  return values;
}

function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseOutlineNodesFromStream(raw: string): ParsedOutlineNode[] {
  const cleaned = stripCodeFence(raw);
  if (!cleaned) return [];

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try {
      const parsed = JSON.parse(candidate) as {
        nodes?: Array<{
          title?: unknown;
          bullets?: unknown;
          page_type?: unknown;
          layout_hint?: unknown;
        }>;
      };
      if (Array.isArray(parsed.nodes)) {
        return parsed.nodes.map((node) => {
          const pageType = normalizePageType(node.page_type);
          return {
            title: normalizeText(node.title),
            bullets: Array.isArray(node.bullets)
              ? node.bullets.map((item) => normalizeText(item)).filter(Boolean)
              : [],
            pageType,
            layoutHint: normalizeLayoutHint(node.layout_hint, pageType),
          };
        });
      }
    } catch {
      // continue with partial parser
    }
  }

  const nodesAnchor = cleaned.indexOf("\"nodes\"");
  if (nodesAnchor < 0) return [];
  const nodesText = cleaned.slice(nodesAnchor);
  const chunks = nodesText.split(/\{\s*"title"\s*:/).slice(1);
  const parsedNodes: ParsedOutlineNode[] = [];
  for (const chunk of chunks) {
    const section = `{"title":${chunk}`;
    const titleMatch = section.match(/"title"\s*:\s*"([^"]*)/);
    const bulletsBlock = section.match(/"bullets"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
    const pageTypeMatch = section.match(/"page_type"\s*:\s*"([^"]*)/);
    const layoutHintMatch = section.match(/"layout_hint"\s*:\s*"([^"]*)/);
    const pageType = normalizePageType(pageTypeMatch?.[1]);
    parsedNodes.push({
      title: titleMatch?.[1] ? decodeJsonString(titleMatch[1]) : undefined,
      bullets: bulletsBlock?.[1] ? extractQuotedList(bulletsBlock[1]) : undefined,
      pageType,
      layoutHint: layoutHintMatch?.[1]
        ? normalizeLayoutHint(decodeJsonString(layoutHintMatch[1]), pageType)
        : undefined,
    });
  }
  return parsedNodes;
}

function mergeParsedNodesIntoSlides(
  currentSlides: SlideDraft[],
  parsedNodes: ParsedOutlineNode[],
  targetCount: number
): SlideDraft[] {
  const desiredCount = Math.max(
    targetCount,
    parsedNodes.length,
    currentSlides.length
  );
  const base = ensureSlidesCount(currentSlides, desiredCount);
  return base.map((slide, index) => {
    const parsed = parsedNodes[index];
    if (!parsed) return slide;
    const pageType = parsed.pageType || slide.pageType;
    return {
      ...slide,
      title: parsed.title || slide.title,
      keyPoints:
        Array.isArray(parsed.bullets) && parsed.bullets.length > 0
          ? parsed.bullets
          : slide.keyPoints,
      pageType,
      layoutHint:
        parsed.layoutHint || normalizeLayoutHint(slide.layoutHint, pageType),
    };
  });
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

function clipText(value: unknown, max = 120): string {
  const text = normalizeText(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function resolveHttpStatusHint(reason: unknown): string {
  const text = normalizeText(reason);
  if (!text) return "";
  const match = text.match(/Server error '(\d{3})[^']*'/i);
  if (match?.[1]) return `HTTP ${match[1]}`;
  const fallback = text.match(/(\d{3})/);
  return fallback?.[1] ? `HTTP ${fallback[1]}` : clipText(text, 64);
}

function resolveEventLog(
  eventType: string,
  payload: Record<string, unknown>
): Omit<StreamLog, "id" | "ts"> {
  if (eventType === "llm.request.timeout") {
    const phase = normalizeText(payload.phase) || "unknown";
    const attempt = Number(payload.attempt || 0);
    const maxAttempts = Number(payload.max_attempts || 0);
    const reason = resolveHttpStatusHint(payload.reason);
    return {
      title: "模型请求超时",
      detail: `${phase} · 第 ${attempt || 0}/${maxAttempts || 0} 次${
        reason ? ` · ${reason}` : ""
      }`,
      tone: "warn",
    };
  }
  if (eventType === "llm.request.retry") {
    const phase = normalizeText(payload.phase) || "unknown";
    const attempt = Number(payload.attempt || 0);
    const maxAttempts = Number(payload.max_attempts || 0);
    const delay = Number(payload.next_delay_sec || 0);
    const reason = resolveHttpStatusHint(payload.reason);
    return {
      title: "准备重试",
      detail: `${phase} · 第 ${attempt || 0}/${maxAttempts || 0} 次${
        delay > 0 ? ` · ${delay.toFixed(1)}s 后` : ""
      }${reason ? ` · ${reason}` : ""}`,
      tone: "warn",
    };
  }
  if (eventType === "requirements.analyzing.started") {
    const pages = Number(payload.target_slide_count || 0);
    const hasRag = Boolean(payload.has_rag);
    return {
      title: "开始需求分析",
      detail: `${pages > 0 ? `目标 ${pages} 页` : "页数待定"}${
        hasRag ? " · 启用 RAG" : ""
      }`,
      tone: "info",
    };
  }
  if (
    eventType === "requirements.analyzing.completed" ||
    eventType === "requirements.analyzed"
  ) {
    const details: string[] = [];
    const pageCount = Number(payload.page_count_fixed || 0);
    if (pageCount > 0) details.push(`页数 ${pageCount}`);
    const styleName = normalizeText(payload.style_reference_name);
    if (styleName) details.push(`风格 ${styleName}`);
    const audience = clipText(payload.audience, 48);
    if (audience) details.push(`受众 ${audience}`);
    const purpose = clipText(payload.purpose, 72);
    if (purpose) details.push(`目标 ${purpose}`);
    const tone = clipText(payload.tone, 44);
    if (tone) details.push(`语气 ${tone}`);
    return {
      title: "需求分析结果",
      detail: details.join(" · "),
      tone: "success",
    };
  }
  if (eventType === "outline.completed") {
    const sections = Number(payload.sections || 0);
    const version = Number(payload.version || 0);
    return {
      title: "大纲生成完成",
      detail: `${version > 0 ? `v${version}` : ""}${
        sections > 0 ? `${version > 0 ? " · " : ""}${sections} 节` : ""
      }`,
      tone: "success",
    };
  }
  if (eventType === "research.completed") {
    const details: string[] = [];
    const audience = clipText(payload.audience, 48);
    const purpose = clipText(payload.purpose, 72);
    const tone = clipText(payload.tone, 44);
    if (audience) details.push(`受众 ${audience}`);
    if (purpose) details.push(`目标 ${purpose}`);
    if (tone) details.push(`语气 ${tone}`);
    return {
      title: "研究上下文完成",
      detail: details.join(" · "),
      tone: "info",
    };
  }
  if (eventType === "outline.repair.started") {
    return { title: "开始修复大纲", tone: "warn" };
  }
  if (eventType === "outline.repair.completed") {
    return { title: "大纲修复完成", tone: "success" };
  }
  if (eventType === "outline.repair.failed") {
    return { title: "大纲修复失败", detail: "系统将继续重试", tone: "error" };
  }
  if (eventType === "plan.completed") {
    return { title: "结构规划完成", tone: "success" };
  }
  return {
    title: clipText(payload.progress_message, 96) || eventType,
    tone: "info",
  };
}

function parseSessionSlides(session: unknown): SlideDraft[] {
  if (!session || typeof session !== "object") return [];
  const outline = (session as { outline?: { nodes?: unknown } }).outline;
  const nodes = outline?.nodes;
  if (!Array.isArray(nodes)) return [];

  const total = nodes.length;
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
      page_type?: unknown;
      layout_hint?: unknown;
    };
    const order =
      typeof current.order === "number" && current.order > 0
        ? current.order
        : index + 1;
    const pageType = normalizePageType(
      current.page_type,
      defaultPageTypeForOrder(order, total)
    );
    slides.push({
      id: normalizeText(current.id) || `slide-${order}`,
      order,
      title: normalizeText(current.title) || defaultSlideTitle(order),
      keyPoints: Array.isArray(current.key_points)
        ? current.key_points.map((item) => normalizeText(item)).filter(Boolean)
        : [],
      estimatedMinutes:
        typeof current.estimated_minutes === "number"
          ? current.estimated_minutes
          : undefined,
      pageType,
      layoutHint: normalizeLayoutHint(current.layout_hint, pageType),
    });
  }
  return slides.sort((left, right) => left.order - right.order);
}

function resolveExpectedPages(options: unknown): number {
  if (!options || typeof options !== "object") return 0;
  const sessionOptions = options as {
    pages?: unknown;
    target_slide_count?: unknown;
    page_count?: unknown;
  };
  const raw =
    sessionOptions.pages ??
    sessionOptions.target_slide_count ??
    sessionOptions.page_count;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
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
      title: slide.title.trim() || defaultSlideTitle(index + 1),
      key_points: slide.keyPoints.map((point) => point.trim()).filter(Boolean),
      estimated_minutes:
        typeof slide.estimatedMinutes === "number"
          ? slide.estimatedMinutes
          : undefined,
      page_type: slide.pageType,
      layout_hint: slide.layoutHint,
    })) as OutlineDocument["nodes"],
    summary,
  };
}

function serializeComparableOutline(
  outline: OutlineDocument | null | undefined
): string {
  const nodes = Array.isArray(outline?.nodes) ? outline.nodes : [];
  return JSON.stringify(
    nodes.map((node, index) => {
      const current = node as {
        id?: unknown;
        order?: unknown;
        title?: unknown;
        key_points?: unknown;
        estimated_minutes?: unknown;
        page_type?: unknown;
        layout_hint?: unknown;
      };
      const order =
        typeof current.order === "number" && current.order > 0
          ? current.order
          : index + 1;
      const pageType = normalizePageType(
        current.page_type,
        defaultPageTypeForOrder(order, nodes.length || order)
      );
      return {
        id: normalizeText(current.id) || `slide-${order}`,
        order,
        title: normalizeText(current.title),
        key_points: Array.isArray(current.key_points)
          ? current.key_points.map((item) => normalizeText(item)).filter(Boolean)
          : [],
        estimated_minutes:
          typeof current.estimated_minutes === "number"
            ? current.estimated_minutes
            : null,
        page_type: pageType,
        layout_hint: normalizeLayoutHint(current.layout_hint, pageType),
      };
    })
  );
}

function isSlideContentReady(slide: SlideDraft): boolean {
  return Boolean(normalizeText(slide.title)) && slide.keyPoints.length > 0;
}

function toneClassName(tone: StreamLogTone): string {
  if (tone === "success") return "text-emerald-600";
  if (tone === "warn") return "text-amber-600";
  if (tone === "error") return "text-rose-600";
  return "text-sky-600";
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
  const expectedPages = resolveExpectedPages(generationSession?.options);
  const currentRunId =
    activeRunId || generationSession?.current_run?.run_id || null;

  const [phase, setPhase] = useState<PanelPhase>("preamble_streaming");
  const [preambleCollapsed, setPreambleCollapsed] = useState(false);
  const [streamLogs, setStreamLogs] = useState<StreamLog[]>([]);
  const [_outlineStreamText, setOutlineStreamText] = useState("");
  const [slides, setSlides] = useState<SlideDraft[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analysisPageCount, setAnalysisPageCount] = useState<number>(0);

  const processedEventKeysRef = useRef<Set<string>>(new Set());
  const processedDiegoSeqRef = useRef<Set<number>>(new Set());
  const lastLoggedStateRef = useRef<string>("");
  const lastRunScopeRef = useRef<string>("");
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const targetPageCountRef = useRef<number>(0);

  const targetPageCount = analysisPageCount || expectedPages;
  const snapshotRunId = generationSession?.current_run?.run_id || null;
  const isSnapshotAlignedToRun =
    !currentRunId || !snapshotRunId || currentRunId === snapshotRunId;

  const { events, isConnected } = useGenerationEvents({
    sessionId: sessionId || null,
  });

  useEffect(() => {
    targetPageCountRef.current = targetPageCount;
  }, [targetPageCount]);

  useEffect(() => {
    const runScopeKey = `${sessionId || "no-session"}:${currentRunId || "no-run"}`;
    if (runScopeKey === lastRunScopeRef.current) return;
    lastRunScopeRef.current = runScopeKey;
    processedEventKeysRef.current.clear();
    processedDiegoSeqRef.current.clear();
    lastLoggedStateRef.current = "";
    setStreamLogs([]);
    setOutlineStreamText("");
    setErrorMessage(null);
    setPreambleCollapsed(false);
    setAnalysisPageCount(0);

    const canSeedFromSnapshot =
      isSnapshotAlignedToRun &&
      (sessionState === "AWAITING_OUTLINE_CONFIRM" ||
        sessionState === "GENERATING_CONTENT" ||
        sessionState === "RENDERING" ||
        sessionState === "SUCCESS");
    const sessionSlides = canSeedFromSnapshot
      ? parseSessionSlides(generationSession)
      : [];
    const baselineCount = sessionSlides.length || expectedPages || 0;
    setSlides(ensureSlidesCount(sessionSlides, baselineCount));

    if (canSeedFromSnapshot && sessionState === "AWAITING_OUTLINE_CONFIRM") {
      setPhase("editing");
      setPreambleCollapsed(true);
      return;
    }
    setPhase("preamble_streaming");
  }, [
    currentRunId,
    expectedPages,
    generationSession,
    isSnapshotAlignedToRun,
    sessionId,
    sessionState,
  ]);

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
      const sessionErrorFields = generationSession?.session as
        | {
            error_message?: unknown;
            errorMessage?: unknown;
            state_reason?: unknown;
          }
        | null
        | undefined;
      const message =
        (typeof sessionErrorFields?.error_message === "string" &&
          sessionErrorFields.error_message) ||
        (typeof sessionErrorFields?.errorMessage === "string" &&
          sessionErrorFields.errorMessage) ||
        (typeof sessionErrorFields?.state_reason === "string" &&
          sessionErrorFields.state_reason) ||
        "大纲生成失败";
      setErrorMessage(message);
    }
  }, [generationSession, isSnapshotAlignedToRun, sessionState, targetPageCount]);

  useEffect(() => {
    if (targetPageCount <= 0) return;
    setSlides((prev) => ensureSlidesCount(prev, targetPageCount));
  }, [targetPageCount]);

  useEffect(() => {
    for (const event of events) {
      const key = resolveEventKey(event as never);
      if (processedEventKeysRef.current.has(key)) continue;
      processedEventKeysRef.current.add(key);

      const payload = (event.payload ?? {}) as {
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
        if (!eventRunId || currentRunId !== eventRunId) continue;
      }

      const diegoSeq = Number(sectionPayload?.diego_seq || 0);
      if (diegoSeq > 0) {
        if (processedDiegoSeqRef.current.has(diegoSeq)) continue;
        processedDiegoSeqRef.current.add(diegoSeq);
      }

      const eventType = normalizeText(event.event_type);
      const diegoEventType = normalizeText(sectionPayload?.diego_event_type) || eventType;
      const isDiegoEvent =
        eventType === "progress.updated" ||
        Boolean(normalizeText(sectionPayload?.diego_event_type)) ||
        DIEGO_EVENT_PREFIXES.some((prefix) => diegoEventType.startsWith(prefix));
      if (!isDiegoEvent) continue;

      const state = normalizeText((event as { state?: string }).state);
      if (state && state !== lastLoggedStateRef.current) {
        lastLoggedStateRef.current = state;
        setStreamLogs((prev) => {
          const next: StreamLog[] = [
            ...prev,
            {
              id: `${key}:state:${state}`,
              ts: event.timestamp,
              title: "状态更新",
              detail: STATE_LABELS[state] || state,
              tone: state === "FAILED" ? "error" : "info",
            },
          ];
          return next.slice(-240);
        });
      }

      const streamChannelRaw = normalizeText(sectionPayload?.stream_channel);
      const streamChannel = streamChannelRaw as DiegoStreamChannel | undefined;

      if (
        diegoEventType === "outline.token" ||
        (eventType === "outline.token" && streamChannel !== "diego.preamble")
      ) {
        const token =
          normalizeText(sectionPayload?.token) ||
          normalizeText(payload.progress_message);
        if (!token) continue;
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
        continue;
      }

      if (
        streamChannelRaw &&
        streamChannel !== "diego.preamble" &&
        streamChannel !== "diego.outline.token"
      ) {
        continue;
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
        const fixedPageCount = Number(rawPayload.page_count_fixed || 0);
        if (fixedPageCount > 0) {
          setAnalysisPageCount((prev) =>
            prev === fixedPageCount ? prev : fixedPageCount
          );
          setSlides((current) => ensureSlidesCount(current, fixedPageCount));
        }
      }

      const normalized = resolveEventLog(diegoEventType, rawPayload);
      if (!normalized.title) continue;

      setStreamLogs((prev) => {
        const next: StreamLog[] = [
          ...prev,
          {
            id: key,
            ts: event.timestamp,
            title: normalized.title,
            detail: normalized.detail,
            tone: normalized.tone,
          },
        ];
        return next.slice(-240);
      });
    }
  }, [currentRunId, events, expectedPages]);

  useEffect(() => {
    const node = logContainerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [streamLogs]);

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

  const logTitle = preambleCollapsed ? "前置过程（已折叠）" : "前置过程";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900">
              大纲生成与确认
            </h3>
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
          <div className="relative mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white to-transparent" />
            <div
              ref={logContainerRef}
              className="max-h-44 space-y-2 overflow-y-auto px-3 py-3"
            >
              {streamLogs.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {isConnected
                    ? "正在等待 Diego 返回过程信息..."
                    : "正在连接 Diego 事件流..."}
                </div>
              ) : (
                streamLogs.map((item) => (
                  <div key={item.id} className="rounded-lg bg-zinc-50/70 px-2.5 py-2">
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <span>{new Date(item.ts).toLocaleTimeString()}</span>
                    </div>
                    <div
                      className={`mt-0.5 text-sm font-semibold ${toneClassName(
                        item.tone
                      )}`}
                    >
                      {item.title}
                    </div>
                    {item.detail ? (
                      <div className="mt-0.5 text-xs leading-5 text-zinc-600">
                        {item.detail}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
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
          <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Diego 正在流式生成大纲，卡片内容会实时填充。
            {targetPageCount > 0 ? ` 当前目标页数：${targetPageCount}。` : ""}
          </div>
        ) : (
          <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            大纲已完成，当前为可编辑状态。
          </div>
        )}

        {outlineIncomplete ? (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            大纲尚未完整：已就绪 {readySlidesCount}/{targetPageCount} 页。
          </div>
        ) : null}

        <div className="space-y-3">
          {slides.map((slide, index) => {
            const layoutOptions = LAYOUT_OPTIONS_BY_PAGE_TYPE[slide.pageType];
            return (
              <div
                key={slide.id}
                className="rounded-xl border border-zinc-200 bg-white p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
                  <span className="flex items-center gap-2">
                    <Pencil className="h-3.5 w-3.5" />第 {index + 1} 页
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px]">
                    {isEditable ? "可编辑" : "流式填充中"}
                  </span>
                </div>

                <Input
                  value={slide.title}
                  onChange={(event) =>
                    handleSlideFieldChange(slide.id, {
                      title: event.target.value,
                    })
                  }
                  disabled={!isEditable}
                  className="mb-2 h-9 text-sm"
                />

                <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-zinc-500">页面类型</span>
                    <select
                      value={slide.pageType}
                      disabled={!isEditable}
                      onChange={(event) => {
                        const nextPageType = normalizePageType(
                          event.target.value,
                          slide.pageType
                        );
                        handleSlideFieldChange(slide.id, {
                          pageType: nextPageType,
                          layoutHint: DEFAULT_LAYOUT_BY_PAGE_TYPE[nextPageType],
                        });
                      }}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-50"
                    >
                      {PAGE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-zinc-500">布局提示</span>
                    <select
                      value={slide.layoutHint}
                      disabled={!isEditable}
                      onChange={(event) =>
                        handleSlideFieldChange(slide.id, {
                          layoutHint: normalizeLayoutHint(
                            event.target.value,
                            slide.pageType
                          ),
                        })
                      }
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-50"
                    >
                      {layoutOptions.map((layout) => (
                        <option key={layout} value={layout}>
                          {layout}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

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
                  disabled={!isEditable}
                  placeholder="每行一个要点"
                  className="min-h-[96px] resize-y text-xs leading-6 disabled:cursor-not-allowed disabled:bg-zinc-50"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
