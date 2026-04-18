import {
  DEFAULT_LAYOUT_BY_PAGE_TYPE,
  LAYOUT_OPTIONS_BY_PAGE_TYPE,
  OUTLINE_RUN_CACHE_MAX_AGE_MS,
  OUTLINE_RUN_CACHE_PREFIX,
} from "./constants";
import type {
  DiegoPageType,
  DetailSection,
  OutlineDocument,
  OutlineRunCachePayload,
  PanelPhase,
  ParsedOutlineNode,
  SlideDraft,
  StreamLog,
  StreamLogTone,
} from "./types";

// ---------------------------------------------------------------------------
// Text / serialization helpers
// ---------------------------------------------------------------------------

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function clipText(value: unknown, max = 120): string {
  const text = normalizeText(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function decodeJsonString(raw: string): string {
  return raw
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}

export function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function extractQuotedList(raw: string): string[] {
  const values: string[] = [];
  const regex = /"((?:\\.|[^"\\])*)"/g;
  for (const match of raw.matchAll(regex)) {
    const decoded = decodeJsonString(match[1] || "");
    if (decoded) values.push(decoded);
  }
  return values;
}

// ---------------------------------------------------------------------------
// PageType / Layout helpers
// ---------------------------------------------------------------------------

export function normalizePageType(
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

export function normalizeLayoutHint(value: unknown, pageType: DiegoPageType): string {
  const normalized = normalizeText(value).toLowerCase();
  const allowed = LAYOUT_OPTIONS_BY_PAGE_TYPE[pageType];
  if (normalized && allowed.includes(normalized)) {
    return normalized;
  }
  return DEFAULT_LAYOUT_BY_PAGE_TYPE[pageType];
}

export function defaultPageTypeForOrder(order: number, total: number): DiegoPageType {
  if (order === 1) return "cover";
  if (order === 2 && total >= 4) return "toc";
  if (order === total) return "summary";
  if (order > 2 && order % 4 === 0) return "section";
  return "content";
}

export function defaultSlideTitle(order: number): string {
  return `第 ${order} 页`;
}

// ---------------------------------------------------------------------------
// Slide operations
// ---------------------------------------------------------------------------

export function createEmptySlide(order: number, total: number): SlideDraft {
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

export function ensureSlidesCount(slides: SlideDraft[], targetCount: number): SlideDraft[] {
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

export function isSlideContentReady(slide: SlideDraft): boolean {
  return Boolean(normalizeText(slide.title)) && slide.keyPoints.length > 0;
}

// ---------------------------------------------------------------------------
// Outline stream parsing
// ---------------------------------------------------------------------------

export function parseOutlineNodesFromStream(raw: string): ParsedOutlineNode[] {
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

  const nodesAnchor = cleaned.indexOf('"nodes"');
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

export function mergeParsedNodesIntoSlides(
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

export function parseSessionSlides(session: unknown): SlideDraft[] {
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

export function resolveExpectedPages(options: unknown): number {
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

export function buildOutlinePayloadFromSlides(
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

export function serializeComparableOutline(
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

// ---------------------------------------------------------------------------
// Event processing helpers
// ---------------------------------------------------------------------------

export function parseEventPayloadObject(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object") {
    return payload as Record<string, unknown>;
  }
  if (typeof payload !== "string") return {};
  const raw = payload.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function resolveEventKey(event: {
  event_id?: string;
  cursor?: string;
  timestamp?: string;
  event_type?: string;
}): string {
  if (event.event_id) return `id:${event.event_id}`;
  if (event.cursor) return `cursor:${event.cursor}`;
  return `fallback:${event.timestamp ?? ""}:${event.event_type ?? ""}`;
}

export function resolveSessionFailureMessage(
  session: unknown,
  fallback = "大纲生成失败"
): string {
  if (!session || typeof session !== "object") return fallback;
  const payload = session as {
    error_message?: unknown;
    errorMessage?: unknown;
    state_reason?: unknown;
  };
  if (typeof payload.error_message === "string" && payload.error_message.trim()) {
    return payload.error_message;
  }
  if (typeof payload.errorMessage === "string" && payload.errorMessage.trim()) {
    return payload.errorMessage;
  }
  if (typeof payload.state_reason === "string" && payload.state_reason.trim()) {
    return payload.state_reason;
  }
  return fallback;
}

export function resolveHttpStatusHint(reason: unknown): string {
  const text = normalizeText(reason);
  if (!text) return "";
  const match = text.match(/Server error '(\d{3})[^']*'/i);
  if (match?.[1]) return `HTTP ${match[1]}`;
  const fallback = text.match(/(\d{3})/);
  return fallback?.[1] ? `HTTP ${fallback[1]}` : clipText(text, 64);
}

export function resolveEventLog(
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
    const sourceHint = hasRag
      ? "已读取你上传的资料，会优先结合资料生成内容"
      : "未检测到资料上传，将基于你的主题自动组织内容";
    return {
      title: "开始需求分析",
      detail: [
        "【任务设置】",
        `${pages > 0 ? `目标页数：${pages} 页` : "目标页数：待定"}`,
        "【资料策略】",
        `资料使用：${sourceHint}`,
      ].join("\n"),
      tone: "info",
    };
  }
  if (
    eventType === "requirements.analyzing.completed" ||
    eventType === "requirements.analyzed"
  ) {
    const teachingProfile: string[] = [];
    const outputProfile: string[] = [];
    const designProfile: string[] = [];
    const pageCount = Number(payload.page_count_fixed || 0);
    if (pageCount > 0) outputProfile.push(`固定页数：${pageCount} 页`);
    const styleName = normalizeText(payload.style_reference_name);
    if (styleName) outputProfile.push(`推荐风格：${styleName}`);
    const contentMode = normalizeText(payload.content_source_mode);
    if (contentMode) {
      outputProfile.push(
        `内容来源：${contentMode === "model_only" ? "模型生成" : contentMode}`
      );
    }
    const imageMode = normalizeText(payload.image_source_mode);
    if (imageMode) {
      outputProfile.push(
        `配图来源：${imageMode === "pexels" ? "在线素材库（Pexels）" : imageMode}`
      );
    }

    const audience = clipText(payload.audience, 320);
    if (audience) teachingProfile.push(`目标用户：${audience}`);
    const purpose = clipText(payload.purpose, 320);
    if (purpose) teachingProfile.push(`教学目标：${purpose}`);
    const tone = clipText(payload.tone, 220);
    if (tone) teachingProfile.push(`表达语气：${tone}`);

    const styleIntent = clipText(payload.style_intent, 420);
    if (styleIntent) designProfile.push(`视觉方向：${styleIntent}`);
    const visualStrategy = clipText(payload.visual_strategy, 420);
    if (visualStrategy) designProfile.push(`版面策略：${visualStrategy}`);
    const density = clipText(payload.density, 320);
    if (density) designProfile.push(`信息密度：${density}`);

    const sections: string[] = [];
    if (teachingProfile.length) {
      sections.push("【教学定位】", ...teachingProfile);
    }
    if (outputProfile.length) {
      sections.push("【产出设定】", ...outputProfile);
    }
    if (designProfile.length) {
      sections.push("【视觉策略】", ...designProfile);
    }
    const detail = sections.join("\n");
    return {
      title: "需求分析结果",
      detail,
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
    const audience = clipText(payload.audience, 160);
    const purpose = clipText(payload.purpose, 220);
    const tone = clipText(payload.tone, 120);
    if (audience) details.push(`目标用户：${audience}`);
    if (purpose) details.push(`讲解目标：${purpose}`);
    if (tone) details.push(`表达语气：${tone}`);
    return {
      title: "资料梳理完成",
      detail: details.join("\n"),
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

export function parseDetailSections(detail: string): DetailSection[] {
  const normalized = detail
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!normalized.length) return [];

  const sections: DetailSection[] = [];
  let current: DetailSection | null = null;
  for (const line of normalized) {
    if (line.startsWith("【") && line.endsWith("】")) {
      if (current && current.lines.length > 0) {
        sections.push(current);
      }
      current = { title: line.slice(1, -1), lines: [] };
      continue;
    }
    if (!current) {
      current = { title: "详情", lines: [] };
    }
    current.lines.push(line);
  }
  if (current && current.lines.length > 0) {
    sections.push(current);
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

export function buildOutlineRunCacheKey(sessionId: string, runId: string): string {
  return `${OUTLINE_RUN_CACHE_PREFIX}:${sessionId}:${runId}`;
}

export function normalizeCachedStreamLogs(value: unknown): StreamLog[] {
  if (!Array.isArray(value)) return [];
  const tones: StreamLogTone[] = ["info", "success", "warn", "error"];
  const logs: StreamLog[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as {
      id?: unknown;
      ts?: unknown;
      title?: unknown;
      detail?: unknown;
      tone?: unknown;
    };
    const id = normalizeText(raw.id);
    const ts = normalizeText(raw.ts);
    const title = normalizeText(raw.title);
    const detail = normalizeText(raw.detail);
    const toneRaw = normalizeText(raw.tone) as StreamLogTone;
    if (!id || !ts || !title) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const tone = tones.includes(toneRaw) ? toneRaw : "info";
    logs.push({
      id,
      ts,
      title,
      detail: detail || undefined,
      tone,
    });
  }
  return logs.slice(-240);
}

export function appendUniqueStreamLog(prev: StreamLog[], nextLog: StreamLog): StreamLog[] {
  if (prev.some((item) => item.id === nextLog.id)) return prev;
  return [...prev, nextLog].slice(-240);
}

export function seedProcessedKeysFromLogs(logs: StreamLog[]): Set<string> {
  const seeded = new Set<string>();
  for (const log of logs) {
    if (!log.id) continue;
    const stateMarker = ":state:";
    const markerIndex = log.id.indexOf(stateMarker);
    if (markerIndex > 0) {
      seeded.add(log.id.slice(0, markerIndex));
      continue;
    }
    seeded.add(log.id);
  }
  return seeded;
}

export function normalizeCachedSlides(value: unknown): SlideDraft[] {
  if (!Array.isArray(value)) return [];
  const slides: SlideDraft[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object") continue;
    const raw = item as {
      id?: unknown;
      order?: unknown;
      title?: unknown;
      keyPoints?: unknown;
      estimatedMinutes?: unknown;
      pageType?: unknown;
      layoutHint?: unknown;
    };
    const order =
      typeof raw.order === "number" && Number.isFinite(raw.order) && raw.order > 0
        ? Math.round(raw.order)
        : index + 1;
    const pageType = normalizePageType(
      raw.pageType,
      defaultPageTypeForOrder(order, value.length || order)
    );
    const keyPoints = Array.isArray(raw.keyPoints)
      ? raw.keyPoints.map((point) => normalizeText(point)).filter(Boolean)
      : [];
    slides.push({
      id: normalizeText(raw.id) || `slide-${order}`,
      order,
      title: normalizeText(raw.title) || defaultSlideTitle(order),
      keyPoints,
      estimatedMinutes:
        typeof raw.estimatedMinutes === "number" &&
        Number.isFinite(raw.estimatedMinutes)
          ? raw.estimatedMinutes
          : undefined,
      pageType,
      layoutHint: normalizeLayoutHint(raw.layoutHint, pageType),
    });
  }
  return slides.sort((left, right) => left.order - right.order);
}

export function readOutlineRunCache(
  sessionId: string | null,
  runId: string | null
): OutlineRunCachePayload | null {
  if (typeof window === "undefined") return null;
  if (!sessionId || !runId) return null;
  const storageKey = buildOutlineRunCacheKey(sessionId, runId);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OutlineRunCachePayload>;
    const updatedAtText = normalizeText(parsed.updatedAt);
    const updatedAt = new Date(updatedAtText).getTime();
    if (
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt > OUTLINE_RUN_CACHE_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    const phaseRaw = normalizeText(parsed.phase) as PanelPhase;
    const phase: PanelPhase =
      phaseRaw === "outline_streaming" || phaseRaw === "editing"
        ? phaseRaw
        : "preamble_streaming";
    const outlineStreamText = normalizeText(parsed.outlineStreamText).slice(
      -120000
    );
    const analysisPageCount = Number(parsed.analysisPageCount || 0);
    return {
      sessionId,
      runId,
      phase,
      preambleCollapsed: Boolean(parsed.preambleCollapsed),
      streamLogs: normalizeCachedStreamLogs(parsed.streamLogs),
      outlineStreamText,
      slides: normalizeCachedSlides(parsed.slides),
      analysisPageCount:
        Number.isFinite(analysisPageCount) && analysisPageCount > 0
          ? Math.round(analysisPageCount)
          : 0,
      updatedAt: updatedAtText || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeOutlineRunCache(
  sessionId: string,
  runId: string,
  payload: Omit<OutlineRunCachePayload, "sessionId" | "runId" | "updatedAt">
): void {
  if (typeof window === "undefined") return;
  try {
    const storageKey = buildOutlineRunCacheKey(sessionId, runId);
    const serializable: OutlineRunCachePayload = {
      sessionId,
      runId,
      phase: payload.phase,
      preambleCollapsed: payload.preambleCollapsed,
      streamLogs: payload.streamLogs.slice(-240),
      outlineStreamText: payload.outlineStreamText.slice(-120000),
      slides: payload.slides.slice(0, 60),
      analysisPageCount: payload.analysisPageCount,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(serializable));
  } catch {
    // Ignore local storage quota/serialization failures.
  }
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

export function toneClassName(tone: StreamLogTone): string {
  if (tone === "success") return "text-emerald-600";
  if (tone === "warn") return "text-amber-600";
  if (tone === "error") return "text-rose-600";
  return "text-sky-600";
}
