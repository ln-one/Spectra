import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewApi } from "@/lib/sdk/preview";
import { generateApi, type GenerationEvent, type SessionRun } from "@/lib/sdk/generate";
import { ApiError } from "@/lib/sdk/client";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/hooks/use-toast";
import type { components } from "@/lib/sdk/types";
import {
  parseEventPayloadObject,
  resolveEventLog,
} from "@/components/project/features/outline-editor/utils";
import { useShallow } from "zustand/react/shallow";

type Slide = components["schemas"]["Slide"] & {
  rendered_previews?: RenderedPreviewFrame[];
};

type RenderedPreviewFrame = {
  index: number;
  slide_id: string;
  format?: "svg" | string | null;
  svg_data_url?: string | null;
  preview?: SvgPreviewManifest | null;
  status?: string | null;
  split_index: number;
  split_count: number;
  width?: number | null;
  height?: number | null;
};

type RenderedPreview = {
  format?: string;
  page_count?: number;
  pages?: RenderedPreviewFrame[];
};

type DiegoPreviewContext = {
  provider: "diego";
  run_id?: string;
  palette?: string;
  style?: string;
  style_dna_id?: string;
  effective_template_style?: string;
  source_event_seq?: number;
  theme?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    light?: string;
    bg?: string;
  };
  fonts?: {
    title?: string;
    body?: string;
  };
};

type SvgPreviewManifest = {
  index?: number | null;
  slide_id?: string | null;
  format?: "svg" | string | null;
  svg_data_url?: string | null;
  width?: number | null;
  height?: number | null;
};

export type AuthorityPreviewBlock = {
  block_id: string;
  kind: "heading" | "paragraph" | "bullet_list" | "image";
  text?: string;
  items?: string[];
  src?: string;
  alt?: string;
};

export type AuthorityPreviewFrame = {
  slide_id: string;
  index: number;
  split_index: number;
  split_count: number;
  status?: string;
  format?: "svg" | string | null;
  svg_data_url?: string | null;
  html_preview?: string | null;
  preview?: SvgPreviewManifest | null;
  width?: number | null;
  height?: number | null;
};

export type AuthorityPreviewSlide = {
  slide_id: string;
  index: number;
  title?: string;
  status?: string;
  layout_kind?: string;
  render_version?: number | null;
  format?: "svg" | string | null;
  svg_data_url?: string | null;
  html_preview?: string | null;
  preview?: SvgPreviewManifest | null;
  width?: number | null;
  height?: number | null;
  frames?: AuthorityPreviewFrame[];
  editable_block_ids?: string[];
  blocks?: AuthorityPreviewBlock[];
};

export type AuthorityPreview = {
  provider: "pagevra" | "diego";
  run_id?: string | null;
  render_version?: number | null;
  viewport?: {
    width?: number | null;
    height?: number | null;
  };
  compile_context_version?: number | null;
  compile_context?: DiegoPreviewContext | null;
  theme?: DiegoPreviewContext["theme"];
  fonts?: DiegoPreviewContext["fonts"];
  slides: AuthorityPreviewSlide[];
};

export type PreviewPreambleLog = {
  id: string;
  title: string;
  detail?: string;
  tone?: "info" | "success" | "warn" | "error";
  ts?: string;
};

type SessionIdentity = {
  session?: {
    session_id?: string;
  } | null;
} | null;

type RawPayload = Record<string, unknown>;
const RUN_TITLE_POLL_INTERVAL_MS = 2500;
const BAD_RUN_TITLE_RE = /[A-Za-z]{4,}_[A-Za-z0-9_]+/;

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

function readStringField(payload: RawPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(payload: RawPayload, key: string): number | null {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function readRunIdFromTrace(payload: RawPayload): string | null {
  const trace = payload.run_trace;
  if (!trace || typeof trace !== "object") return null;
  const runId = (trace as { run_id?: unknown }).run_id;
  if (typeof runId === "string" && runId.trim()) return runId.trim();
  const traceRun = (trace as { run?: { run_id?: unknown } }).run;
  if (
    traceRun &&
    typeof traceRun === "object" &&
    typeof traceRun.run_id === "string" &&
    traceRun.run_id.trim()
  ) {
    return traceRun.run_id.trim();
  }
  return null;
}

function readRunIdFromPayload(payload: RawPayload): string | null {
  return readStringField(payload, "run_id") || readRunIdFromTrace(payload);
}

function resolvePptUrlFromSnapshot(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const direct =
    readStringField(source, "ppt_url") ||
    readStringField(source, "pptUrl");
  if (direct) return direct;

  const session =
    source.session && typeof source.session === "object"
      ? (source.session as Record<string, unknown>)
      : null;
  if (session) {
    const sessionDirect =
      readStringField(session, "ppt_url") ||
      readStringField(session, "pptUrl");
    if (sessionDirect) return sessionDirect;

    const sessionResult =
      session.result && typeof session.result === "object"
        ? (session.result as Record<string, unknown>)
        : null;
    if (sessionResult) {
      const sessionResultUrl =
        readStringField(sessionResult, "ppt_url") ||
        readStringField(sessionResult, "pptUrl");
      if (sessionResultUrl) return sessionResultUrl;
    }
  }

  const result =
    source.result && typeof source.result === "object"
      ? (source.result as Record<string, unknown>)
      : null;
  if (result) {
    const resultUrl =
      readStringField(result, "ppt_url") ||
      readStringField(result, "pptUrl");
    if (resultUrl) return resultUrl;
  }

  const currentRun =
    source.current_run && typeof source.current_run === "object"
      ? (source.current_run as Record<string, unknown>)
      : null;
  if (currentRun) {
    const outputUrls =
      currentRun.output_urls && typeof currentRun.output_urls === "object"
        ? (currentRun.output_urls as Record<string, unknown>)
        : null;
    if (outputUrls) {
      return readStringField(outputUrls, "pptx");
    }
  }

  return null;
}

function normalizeTheme(value: unknown): DiegoPreviewContext["theme"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as RawPayload;
  const theme: DiegoPreviewContext["theme"] = {};
  for (const key of ["primary", "secondary", "accent", "light", "bg"] as const) {
    const parsed = readStringField(source, key);
    if (parsed) theme[key] = parsed;
  }
  return Object.keys(theme).length > 0 ? theme : undefined;
}

function normalizeFonts(value: unknown): DiegoPreviewContext["fonts"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as RawPayload;
  const fonts: DiegoPreviewContext["fonts"] = {};
  const title = readStringField(source, "title");
  const body = readStringField(source, "body");
  if (title) fonts.title = title;
  if (body) fonts.body = body;
  return Object.keys(fonts).length > 0 ? fonts : undefined;
}

function normalizeDiegoPreviewContext(
  value: unknown,
  runIdFallback: string | null
): DiegoPreviewContext | null {
  if (!value || typeof value !== "object") return null;
  const source = value as RawPayload;
  const normalized: DiegoPreviewContext = {
    provider: "diego",
  };

  const runId = readStringField(source, "run_id") || runIdFallback || undefined;
  if (runId) normalized.run_id = runId;
  const palette = readStringField(source, "palette");
  if (palette) normalized.palette = palette;
  const style = readStringField(source, "style");
  if (style) normalized.style = style;
  const styleDnaId = readStringField(source, "style_dna_id");
  if (styleDnaId) normalized.style_dna_id = styleDnaId;
  const templateStyle = readStringField(source, "effective_template_style");
  if (templateStyle) normalized.effective_template_style = templateStyle;
  const sourceSeq = readNumberField(source, "source_event_seq");
  if (sourceSeq !== null) normalized.source_event_seq = sourceSeq;

  normalized.theme = normalizeTheme(source.theme);
  normalized.fonts = normalizeFonts(source.fonts);

  return normalized;
}

function buildDiegoContextUpdateFromEvent(
  eventType: string,
  rawPayload: RawPayload,
  runId: string | null,
  seq: number | null
): DiegoPreviewContext | null {
  if (
    eventType !== "plan.completed" &&
    eventType !== "requirements.analyzed" &&
    eventType !== "requirements.analyzing.completed"
  ) {
    return null;
  }

  const update: DiegoPreviewContext = {
    provider: "diego",
    ...(runId ? { run_id: runId } : {}),
    ...(seq !== null ? { source_event_seq: seq } : {}),
  };

  if (eventType === "plan.completed") {
    const palette = readStringField(rawPayload, "palette");
    const style = readStringField(rawPayload, "style");
    const styleDnaId = readStringField(rawPayload, "style_dna_id");
    if (palette) update.palette = palette;
    if (style) update.style = style;
    if (styleDnaId) update.style_dna_id = styleDnaId;
    update.theme = normalizeTheme(rawPayload.theme);
    update.fonts = normalizeFonts(rawPayload.fonts);
    return update;
  }

  const palette = readStringField(rawPayload, "palette_name");
  const style =
    readStringField(rawPayload, "style_recipe") ||
    readStringField(rawPayload, "style_intent");
  const styleDnaId = readStringField(rawPayload, "style_dna_id");
  const templateStyle = readStringField(rawPayload, "effective_template_style");
  if (palette) update.palette = palette;
  if (style) update.style = style;
  if (styleDnaId) update.style_dna_id = styleDnaId;
  if (templateStyle) update.effective_template_style = templateStyle;
  return update;
}

function mergeDiegoPreviewContext(
  current: DiegoPreviewContext | null,
  update: DiegoPreviewContext | null,
  runIdFallback: string | null
): DiegoPreviewContext | null {
  if (!current && !update && !runIdFallback) return null;
  const base: DiegoPreviewContext = {
    provider: "diego",
    ...(current ?? {}),
  };
  if (runIdFallback && !base.run_id) {
    base.run_id = runIdFallback;
  }
  if (!update) return base;

  const merged: DiegoPreviewContext = {
    ...base,
    ...update,
    provider: "diego",
  };

  if (base.theme || update.theme) {
    merged.theme = {
      ...(base.theme ?? {}),
      ...(update.theme ?? {}),
    };
  }
  if (base.fonts || update.fonts) {
    merged.fonts = {
      ...(base.fonts ?? {}),
      ...(update.fonts ?? {}),
    };
  }
  if (typeof base.source_event_seq === "number" || typeof update.source_event_seq === "number") {
    merged.source_event_seq = Math.max(
      base.source_event_seq ?? 0,
      update.source_event_seq ?? 0
    );
  }
  return merged;
}

function buildSlidesContentMarkdown(slides: Slide[]): string {
  const sections = [...slides]
    .sort((a, b) => a.index - b.index)
    .map((slide) => {
      const title = (slide.title || `Slide ${slide.index + 1}`).trim();
      const body = (slide.content || "").trim();
      if (!body) return `## ${title}`;
      return `## ${title}\n\n${body}`;
    });
  return sections.join("\n\n---\n\n").trim();
}

function normalizeAuthorityBlocks(value: unknown): AuthorityPreviewBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: AuthorityPreviewBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const blockId = readStringField(record, "block_id");
    const kindRaw = readStringField(record, "kind");
    if (!blockId || !kindRaw) continue;
    const kind = kindRaw as AuthorityPreviewBlock["kind"];
    if (!["heading", "paragraph", "bullet_list", "image"].includes(kind)) {
      continue;
    }
    blocks.push({
      block_id: blockId,
      kind,
      ...(typeof record.text === "string" && record.text.trim()
        ? { text: record.text.trim() }
        : {}),
      ...(Array.isArray(record.items)
        ? {
            items: record.items
              .map((entry) => String(entry || "").trim())
              .filter(Boolean),
          }
        : {}),
      ...(typeof record.src === "string" && record.src.trim()
        ? { src: record.src.trim() }
        : {}),
      ...(typeof record.alt === "string" && record.alt.trim()
        ? { alt: record.alt.trim() }
        : {}),
    });
  }
  return blocks;
}

function normalizeAuthorityFrames(value: unknown): AuthorityPreviewFrame[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const rawPreview = item.preview;
      const preview =
        rawPreview && typeof rawPreview === "object"
          ? (rawPreview as Record<string, unknown>)
          : {};
      const index = readNumberField(item, "index") ?? readNumberField(preview, "index") ?? 0;
      const slideId =
        readStringField(item, "slide_id") ||
        readStringField(preview, "slide_id") ||
        `slide-${index}`;
      const svgDataUrl =
        readStringField(item, "svg_data_url") ||
        readStringField(preview, "svg_data_url");
      return {
        slide_id: slideId,
        index,
        split_index: readNumberField(item, "split_index") ?? 0,
        split_count: readNumberField(item, "split_count") ?? 1,
        format: "svg",
        svg_data_url: svgDataUrl,
        preview: svgDataUrl
          ? {
              index,
              slide_id: slideId,
              format: "svg",
              svg_data_url: svgDataUrl,
              width: readNumberField(item, "width") ?? readNumberField(preview, "width"),
              height: readNumberField(item, "height") ?? readNumberField(preview, "height"),
            }
          : null,
        ...(readStringField(item, "status")
          ? { status: readStringField(item, "status") || undefined }
          : {}),
        ...(typeof readNumberField(item, "width") === "number"
          ? { width: readNumberField(item, "width") }
          : typeof readNumberField(preview, "width") === "number"
            ? { width: readNumberField(preview, "width") }
            : {}),
        ...(typeof readNumberField(item, "height") === "number"
          ? { height: readNumberField(item, "height") }
          : typeof readNumberField(preview, "height") === "number"
            ? { height: readNumberField(preview, "height") }
            : {}),
      };
    })
    .filter((frame) => typeof frame.svg_data_url === "string" && frame.svg_data_url.startsWith("data:image/svg+xml"))
    .sort((left, right) => {
      const slideDiff = left.index - right.index;
      if (slideDiff !== 0) return slideDiff;
      return left.split_index - right.split_index;
    });
}

function buildHtmlAuthorityPreview(
  slides: Slide[],
  renderedPreview: RenderedPreview | null | undefined,
  runId: string | null,
  renderVersion: number | null,
  context: DiegoPreviewContext | null
): AuthorityPreview {
  const renderedPages = normalizeAuthorityFrames(renderedPreview?.pages);
  const framesByKey = new Map<string, AuthorityPreviewFrame[]>();
  renderedPages.forEach((frame) => {
    const key = `${frame.slide_id}:${frame.index}`;
    framesByKey.set(key, [...(framesByKey.get(key) ?? []), frame]);
  });
  const slideMap = new Map<string, AuthorityPreviewSlide>();
  slides.forEach((slide) => {
    const slideId = slide.id || `slide-${slide.index}`;
    const key = `${slideId}:${slide.index}`;
    const frames = framesByKey.get(key) ?? [];
    const firstFrame = frames[0];
    slideMap.set(key, {
      slide_id: slideId,
      index: slide.index,
      title: String(slide.title || "").trim() || undefined,
      status: firstFrame?.status || (frames.length > 0 ? "ready" : "pending"),
      render_version: renderVersion,
      format: firstFrame ? "svg" : null,
      svg_data_url: firstFrame?.svg_data_url,
      preview: firstFrame?.preview,
      width: firstFrame?.width ?? renderedPages[0]?.width ?? 1280,
      height: firstFrame?.height ?? renderedPages[0]?.height ?? 720,
      frames,
      editable_block_ids: [],
      blocks: [],
    });
  });
  renderedPages.forEach((frame) => {
    const key = `${frame.slide_id}:${frame.index}`;
    if (slideMap.has(key)) return;
    slideMap.set(key, {
      slide_id: frame.slide_id,
      index: frame.index,
      title: `Slide ${frame.index + 1}`,
      status: frame.status || "ready",
      render_version: renderVersion,
      format: "svg",
      svg_data_url: frame.svg_data_url,
      preview: frame.preview,
      width: frame.width ?? renderedPages[0]?.width ?? 1280,
      height: frame.height ?? renderedPages[0]?.height ?? 720,
      frames: framesByKey.get(key) ?? [frame],
      editable_block_ids: [],
      blocks: [],
    });
  });
  const normalizedSlides = [...slideMap.values()].sort((a, b) => a.index - b.index);
  const viewportWidth =
    renderedPages.find((frame) => typeof frame.width === "number")?.width ?? 1280;
  const viewportHeight =
    renderedPages.find((frame) => typeof frame.height === "number")?.height ?? 720;
  return {
    provider: "pagevra",
    run_id: runId,
    render_version: renderVersion,
    viewport: { width: viewportWidth, height: viewportHeight },
    compile_context_version: context?.source_event_seq ?? null,
    compile_context: context,
    theme: context?.theme,
    fonts: context?.fonts,
    slides: normalizedSlides,
  };
}

function normalizeAuthorityPreview(
  value: unknown,
  slides: Slide[],
  renderedPreview: RenderedPreview | null | undefined,
  runId: string | null,
  renderVersion: number | null,
  context: DiegoPreviewContext | null
): AuthorityPreview {
  if (!value || typeof value !== "object") {
    return buildHtmlAuthorityPreview(
      slides,
      renderedPreview,
      runId,
      renderVersion,
      context
    );
  }
  const source = value as Record<string, unknown>;
  const normalizedSlides = Array.isArray(source.slides)
    ? source.slides
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => {
          const frames = normalizeAuthorityFrames(item.frames);
          const rawPreview = item.preview;
          const preview =
            rawPreview && typeof rawPreview === "object"
              ? (rawPreview as Record<string, unknown>)
              : {};
          const index = readNumberField(item, "index") ?? readNumberField(preview, "index") ?? 0;
          const slideId =
            readStringField(item, "slide_id") ||
            readStringField(preview, "slide_id") ||
            `slide-${index}`;
          const svgDataUrl =
            readStringField(item, "svg_data_url") ||
            readStringField(preview, "svg_data_url") ||
            frames[0]?.svg_data_url ||
            null;
          const normalizedPreview: SvgPreviewManifest | null = svgDataUrl
            ? {
                index,
                slide_id: slideId,
                format: "svg",
                svg_data_url: svgDataUrl,
                width: readNumberField(item, "width") ?? readNumberField(preview, "width") ?? frames[0]?.width,
                height: readNumberField(item, "height") ?? readNumberField(preview, "height") ?? frames[0]?.height,
              }
            : null;
          return {
            slide_id: slideId,
            index,
            ...(readStringField(item, "title")
              ? { title: readStringField(item, "title") || undefined }
              : {}),
            ...(readStringField(item, "status")
              ? { status: readStringField(item, "status") || undefined }
              : {}),
            ...(readStringField(item, "layout_kind")
              ? { layout_kind: readStringField(item, "layout_kind") || undefined }
              : {}),
            render_version:
              readNumberField(item, "render_version") ?? renderVersion ?? undefined,
            format: svgDataUrl ? "svg" : null,
            svg_data_url: svgDataUrl,
            preview: normalizedPreview,
            ...(typeof readNumberField(item, "width") === "number"
              ? { width: readNumberField(item, "width") }
              : typeof readNumberField(preview, "width") === "number"
                ? { width: readNumberField(preview, "width") }
                : typeof frames[0]?.width === "number"
                  ? { width: frames[0]?.width }
                  : {}),
            ...(typeof readNumberField(item, "height") === "number"
              ? { height: readNumberField(item, "height") }
              : typeof readNumberField(preview, "height") === "number"
                ? { height: readNumberField(preview, "height") }
                : typeof frames[0]?.height === "number"
                  ? { height: frames[0]?.height }
                  : {}),
            frames: frames.length > 0 ? frames : normalizedPreview ? [{
              slide_id: slideId,
              index,
              split_index: 0,
              split_count: 1,
              status: readStringField(item, "status") || "ready",
              format: "svg",
              svg_data_url: svgDataUrl,
              preview: normalizedPreview,
              width: normalizedPreview.width,
              height: normalizedPreview.height,
            }] : [],
            editable_block_ids: Array.isArray(item.editable_block_ids)
              ? item.editable_block_ids
                  .map((entry) => String(entry || "").trim())
                  .filter(Boolean)
              : [],
            blocks: normalizeAuthorityBlocks(item.blocks),
          };
        })
        .filter((slide) => typeof slide.svg_data_url === "string" && slide.svg_data_url.startsWith("data:image/svg+xml"))
        .sort((left, right) => left.index - right.index)
    : [];
  if (normalizedSlides.length === 0) {
    return buildHtmlAuthorityPreview(
      slides,
      renderedPreview,
      runId,
      renderVersion,
      context
    );
  }
  const viewportRaw =
    source.viewport && typeof source.viewport === "object"
      ? (source.viewport as Record<string, unknown>)
      : {};
  return {
    provider: "pagevra",
    run_id: readStringField(source, "run_id") || runId,
    render_version: readNumberField(source, "render_version") ?? renderVersion,
    viewport: {
      width: readNumberField(viewportRaw, "width") ?? 1280,
      height: readNumberField(viewportRaw, "height") ?? 720,
    },
    compile_context_version:
      readNumberField(source, "compile_context_version") ?? context?.source_event_seq ?? null,
    compile_context:
      normalizeDiegoPreviewContext(source.compile_context, runId) ?? context ?? null,
    theme: normalizeTheme(source.theme) ?? context?.theme,
    fonts: normalizeFonts(source.fonts) ?? context?.fonts,
    slides: normalizedSlides,
  };
}

function extractPreviewPreambleLogs(events: GenerationEvent[]): PreviewPreambleLog[] {
  const collected: PreviewPreambleLog[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const id = resolveEventKey(event);
    if (seen.has(id)) continue;
    seen.add(id);

    const eventType = String(event.event_type || "").trim();
    if (!eventType) continue;

    const payloadObject = parseEventPayloadObject(event.payload);
    const payload = payloadObject as {
      progress_message?: string;
      section_payload?: {
        diego_event_type?: string;
        raw_payload?: Record<string, unknown>;
      };
    };

    const sectionPayload =
      payload.section_payload && typeof payload.section_payload === "object"
        ? payload.section_payload
        : null;

    const diegoEventType = sectionPayload?.diego_event_type || eventType;
    const rawPayload = (sectionPayload?.raw_payload && typeof sectionPayload.raw_payload === "object")
      ? sectionPayload.raw_payload
      : (payload as Record<string, unknown>);

    // Only collect whitelisted event types to avoid internal noise and raw JSON display
    if (
      diegoEventType === "outline.token" ||
      diegoEventType === "slide.token" ||
      diegoEventType === "compile.token"
    ) {
      continue;
    }

    if (
      diegoEventType !== "requirements.analyzing.started" &&
      diegoEventType !== "requirements.analyzing.completed" &&
      diegoEventType !== "requirements.analyzed" &&
      diegoEventType !== "plan.completed" &&
      diegoEventType !== "outline.completed" &&
      diegoEventType !== "research.completed" &&
      diegoEventType !== "outline.repair.started" &&
      diegoEventType !== "outline.repair.completed" &&
      diegoEventType !== "outline.repair.failed" &&
      diegoEventType !== "llm.request.timeout" &&
      diegoEventType !== "llm.request.retry" &&
      diegoEventType !== "rag.retrieval.started" &&
      diegoEventType !== "rag.retrieval.completed" &&
      diegoEventType !== "rag.retrieval.failed" &&
      // Also allow generic progress updates ONLY if they have a non-empty progress_message
      !(eventType === "progress.updated" && typeof payload.progress_message === "string" && payload.progress_message.trim())
    ) {
      continue;
    }

    const normalized = resolveEventLog(diegoEventType, rawPayload);
    // Double check that we aren't showing the raw eventType or a JSON-like string as the title
    if (!normalized.title || normalized.title === eventType || normalized.title.startsWith("{")) {
      continue;
    }

    // Content-based de-duplication: skip if the last added log has the same title and detail
    const last = collected[collected.length - 1];
    if (last && last.title === normalized.title && last.detail === normalized.detail) {
      continue;
    }

    collected.push({
      id,
      title: normalized.title,
      detail: normalized.detail,
      tone: normalized.tone,
      ts: event.timestamp,
    });
  }
  return collected;
}

function hasRenderablePreviewFrame(
  page: RenderedPreviewFrame | null | undefined
): boolean {
  if (!page) return false;
  return Boolean(
    typeof page.svg_data_url === "string" &&
      page.svg_data_url.startsWith("data:image/svg+xml")
  );
}

function isGeneratingState(state: string | null | undefined): boolean {
  return (
    state === "DRAFTING_OUTLINE" ||
    state === "AWAITING_OUTLINE_CONFIRM" ||
    state === "GENERATING_CONTENT" ||
    state === "RENDERING"
  );
}

function isBadRunTitle(value: string | null | undefined): boolean {
  const title = String(value || "").trim();
  if (!title) return true;
  const lowered = title.toLowerCase();
  return (
    BAD_RUN_TITLE_RE.test(title) ||
    lowered.includes("generation_mode") ||
    lowered.includes("style_preset") ||
    lowered.includes("visual_policy")
  );
}

export function resolveActivePreviewRunId({
  activeSessionId,
  runIdFromQuery,
  storeActiveSessionId,
  storeActiveRunId,
  generationSession,
}: {
  activeSessionId: string | null;
  runIdFromQuery: string | null;
  storeActiveSessionId: string | null;
  storeActiveRunId: string | null;
  generationSession: SessionIdentity;
}): string | null {
  void activeSessionId;
  void storeActiveSessionId;
  void storeActiveRunId;
  void generationSession;
  return runIdFromQuery ? runIdFromQuery : null;
}

export function shouldAdoptStudioArtifactForPptPreview(
  payload: Record<string, unknown>
): boolean {
  const cardId = readStringField(payload, "card_id");
  const artifactType = readStringField(payload, "artifact_type");
  if (cardId === "courseware_ppt") return true;
  if (artifactType === "pptx") return true;
  return false;
}

export function useGeneratePreviewState({
  projectId,
  sessionIdFromQuery,
  runIdFromQuery,
  artifactIdFromQuery,
}: {
  projectId: string;
  sessionIdFromQuery: string | null;
  runIdFromQuery: string | null;
  artifactIdFromQuery: string | null;
}) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([]);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(
    artifactIdFromQuery
  );
  const [currentRenderVersion, setCurrentRenderVersion] = useState<number | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [previewBlockedReason, setPreviewBlockedReason] = useState<string | null>(
    null
  );
  const [slidesContentMarkdown, setSlidesContentMarkdown] = useState("");
  const [sessionFailureMessage, setSessionFailureMessage] = useState<
    string | null
  >(null);
  const [previewSessionState, setPreviewSessionState] = useState<string | null>(
    null
  );
  const [diegoPreviewContext, setDiegoPreviewContext] =
    useState<DiegoPreviewContext | null>(null);
  const [authorityPreview, setAuthorityPreview] =
    useState<AuthorityPreview | null>(null);
  const [previewOutline, setPreviewOutline] = useState<Record<string, unknown> | null>(
    null
  );
  const [previewPreambleLogs, setPreviewPreambleLogs] = useState<
    PreviewPreambleLog[]
  >([]);
  const [currentPptUrl, setCurrentPptUrl] = useState<string | null>(null);

  const processedEventKeysRef = useRef<Set<string>>(new Set());

  const {
    generationSession,
    generationHistory,
    fetchGenerationHistory,
    exportArtifact,
    setActiveSessionId,
  } = useProjectStore(
    useShallow((state) => ({
      generationSession: state.generationSession,
      generationHistory: state.generationHistory,
      fetchGenerationHistory: state.fetchGenerationHistory,
      exportArtifact: state.exportArtifact,
      setActiveSessionId: state.setActiveSessionId,
    }))
  );

  const activeSessionId =
    sessionIdFromQuery ||
    generationSession?.session.session_id ||
    (generationHistory.length > 0 ? generationHistory[0].id : null);
  const activeRunId = runIdFromQuery?.trim() || null;

  useEffect(() => {
    if (!activeSessionId) return;
    setActiveSessionId(activeSessionId);
  }, [activeSessionId, setActiveSessionId]);

  useEffect(() => {
    if (!projectId) return;
    fetchGenerationHistory(projectId);
  }, [fetchGenerationHistory, projectId]);

  useEffect(() => {
    if (artifactIdFromQuery) {
      setCurrentArtifactId(artifactIdFromQuery);
    }
  }, [artifactIdFromQuery]);

  useEffect(() => {
    setCurrentArtifactId(artifactIdFromQuery ?? null);
    setCurrentPptUrl(null);
  }, [activeRunId, artifactIdFromQuery]);

  const loadSessionRuns = useCallback(async () => {
    if (!activeSessionId) {
      setSessionRuns([]);
      return;
    }
    try {
      const response = await generateApi.listRuns(activeSessionId, {
        limit: 50,
      });
      const runs = response?.data?.runs ?? [];
      setSessionRuns(runs);
    } catch {
      setSessionRuns([]);
    }
  }, [activeSessionId]);

  const loadSlides = useCallback(async () => {
    if (!activeSessionId) {
      setSlides([]);
      setSlidesContentMarkdown("");
      setPreviewBlockedReason("未找到可预览的会话。");
      setSessionFailureMessage(null);
      setPreviewSessionState(null);
      setAuthorityPreview(null);
      setPreviewOutline(null);
      setPreviewPreambleLogs([]);
      setCurrentPptUrl(null);
      setIsLoading(false);
      return;
    }
    if (!activeRunId) {
      setSlides([]);
      setSlidesContentMarkdown("");
      setPreviewBlockedReason("请选择一个 Diego run 后再加载预览。");
      setSessionFailureMessage(null);
      setPreviewSessionState(null);
      setAuthorityPreview(null);
      setPreviewOutline(null);
      setPreviewPreambleLogs([]);
      setCurrentPptUrl(null);
      setCurrentArtifactId(artifactIdFromQuery ?? null);
      setDiegoPreviewContext((current) =>
        mergeDiegoPreviewContext(current, null, null)
      );
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setPreviewBlockedReason(null);

      const [response, sessionSnapshotResponse, eventListResponse] =
        await Promise.all([
          previewApi.getSessionPreview(activeSessionId, {
            run_id: activeRunId,
            artifact_id: currentArtifactId ?? undefined,
          }),
          generateApi
            .getSessionSnapshot(activeSessionId, { run_id: activeRunId })
            .catch(() => null),
          generateApi
            .listEvents(activeSessionId, {
              run_id: activeRunId,
              limit: 200,
            })
            .catch(() => null),
        ]);
      const previewData = (response.data ?? null) as {
        slides?: Slide[];
        rendered_preview?: RenderedPreview | null;
        diego_preview_context?: unknown;
        authority_preview?: unknown;
      } | null;

      if (!response.success || !previewData?.slides) {
        setSlides([]);
        setSlidesContentMarkdown("");
        setPreviewBlockedReason("当前 run 暂无可展示预览。");
        setAuthorityPreview(null);
        return;
      }

      const renderedPreview = previewData.rendered_preview as
        | RenderedPreview
        | undefined;
      const renderedPages = ((renderedPreview?.pages ?? []) as RenderedPreviewFrame[])
        .filter(
          (page) =>
            page &&
            typeof page.index === "number" &&
            hasRenderablePreviewFrame(page)
        )
        .sort((a, b) => {
          const indexDiff = a.index - b.index;
          if (indexDiff !== 0) return indexDiff;
          return (a.split_index ?? 0) - (b.split_index ?? 0);
        });

      const pagesBySlideId = new Map<string, RenderedPreviewFrame[]>();
      const pagesByIndex = new Map<number, RenderedPreviewFrame[]>();
      for (const page of renderedPages) {
        if (page.slide_id) {
          const existing = pagesBySlideId.get(page.slide_id) ?? [];
          existing.push(page);
          pagesBySlideId.set(page.slide_id, existing);
        }
        const existingByIndex = pagesByIndex.get(page.index) ?? [];
        existingByIndex.push(page);
        pagesByIndex.set(page.index, existingByIndex);
      }

      const nextSlides = previewData.slides
        .map((slide) => {
          const matchedPages =
            (slide.id ? pagesBySlideId.get(slide.id) : undefined) ??
            pagesByIndex.get(slide.index) ??
            [];
          const primaryPage = matchedPages[0];
          return {
            ...slide,
            ...(primaryPage?.svg_data_url
              ? { thumbnail_url: primaryPage.svg_data_url }
              : {}),
            ...(matchedPages.length > 0
              ? { rendered_previews: matchedPages }
              : {}),
          };
        })
        .sort((a, b) => a.index - b.index);

      const payload = previewData as RawPayload;
      const incomingSlidesContent = payload.slides_content_markdown;
      const markdown =
        typeof incomingSlidesContent === "string" && incomingSlidesContent.trim()
          ? incomingSlidesContent
          : buildSlidesContentMarkdown(nextSlides);
      const incomingSessionState = payload.session_state;
      if (typeof incomingSessionState === "string" && incomingSessionState) {
        setPreviewSessionState(incomingSessionState);
      }
      const incomingContext = normalizeDiegoPreviewContext(
        previewData.diego_preview_context,
        activeRunId
      );
      setDiegoPreviewContext((current) =>
        mergeDiegoPreviewContext(current, incomingContext, activeRunId)
      );
      setSlides(nextSlides);
      setSlidesContentMarkdown(markdown);
      setCurrentArtifactId(response.data.artifact_id ?? null);
      setCurrentRenderVersion(response.data.render_version ?? null);
      setAuthorityPreview(
        normalizeAuthorityPreview(
          previewData.authority_preview,
          nextSlides,
          renderedPreview,
          activeRunId,
          response.data.render_version ?? null,
          incomingContext
        )
      );
      const snapshotData = (sessionSnapshotResponse?.data ?? null) as
        | { outline?: Record<string, unknown> | null }
        | null;
      setCurrentPptUrl(resolvePptUrlFromSnapshot(sessionSnapshotResponse?.data ?? null));
      setPreviewOutline(
        snapshotData?.outline && typeof snapshotData.outline === "object"
          ? snapshotData.outline
          : null
      );
      setPreviewPreambleLogs(
        extractPreviewPreambleLogs(
          ((eventListResponse?.data?.events ?? []) as GenerationEvent[]) || []
        )
      );
      setPreviewBlockedReason(
        nextSlides.length === 0 ? "当前 run 暂无可展示预览。" : null
      );
    } catch (error) {
      const shouldPreserveExistingPreview =
        error instanceof ApiError && error.status === 409;
      if (error instanceof ApiError && error.status === 409) {
        const reason =
          typeof error.details?.reason === "string"
            ? error.details.reason
            : null;
        if (reason === "run_not_ready") {
          setPreviewBlockedReason("当前 run 仍在生成中，请稍后刷新。");
        } else {
          setPreviewBlockedReason(error.message || "预览版本冲突，请稍后重试。");
        }
      } else if (error instanceof ApiError && error.status === 404) {
        setPreviewBlockedReason("该 run 不存在或不属于当前会话。");
      } else if (error instanceof ApiError) {
        setPreviewBlockedReason(error.message);
      } else {
        setPreviewBlockedReason("预览加载失败，请稍后重试。");
      }
      if (!shouldPreserveExistingPreview) {
        setSlides([]);
        setSlidesContentMarkdown("");
        setAuthorityPreview(null);
        setCurrentPptUrl(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeRunId, activeSessionId, currentArtifactId, artifactIdFromQuery]);

  const { events } = useGenerationEvents({
    sessionId: activeSessionId && activeRunId ? activeSessionId : null,
    runId: activeRunId,
  });

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const snapshotSessionState =
    (generationSession as { session?: { state?: string } } | null)?.session
      ?.state ?? null;
  const sessionState = previewSessionState || snapshotSessionState;
  const isSessionGenerating = isGeneratingState(sessionState || latestEvent?.state);

  useEffect(() => {
    processedEventKeysRef.current.clear();
    setSessionFailureMessage(null);
    setPreviewSessionState(null);
    setDiegoPreviewContext((current) =>
      mergeDiegoPreviewContext(current, null, activeRunId)
    );
    void Promise.all([loadSessionRuns(), loadSlides()]);
  }, [activeRunId, activeSessionId, loadSessionRuns, loadSlides]);

  useEffect(() => {
    const currentRun = sessionRuns.find((run) => run.run_id === activeRunId) || null;
    const needsTitleRefresh = Boolean(
      activeSessionId &&
        activeRunId &&
        currentRun &&
        (
          currentRun.run_title_source === "pending" ||
          isBadRunTitle(currentRun.run_title)
        )
    );
    if (!needsTitleRefresh) return;
    const timer = window.setInterval(() => {
      void loadSessionRuns();
    }, RUN_TITLE_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeRunId, activeSessionId, loadSessionRuns, sessionRuns]);

  useEffect(() => {
    if (!activeRunId) return;
    for (const event of events) {
      const key = resolveEventKey(event as never);
      if (processedEventKeysRef.current.has(key)) continue;
      processedEventKeysRef.current.add(key);

      const eventType = event.event_type as string;
      const payload = (event.payload ?? {}) as RawPayload;
      const eventRunId = readRunIdFromPayload(payload);
      if (eventRunId && eventRunId !== activeRunId) {
        continue;
      }

      const sectionPayload =
        payload.section_payload && typeof payload.section_payload === "object"
          ? (payload.section_payload as RawPayload)
          : null;
      const diegoEventType =
        typeof sectionPayload?.diego_event_type === "string"
          ? sectionPayload.diego_event_type
          : eventType;
      const rawPayload =
        sectionPayload?.raw_payload && typeof sectionPayload.raw_payload === "object"
          ? (sectionPayload.raw_payload as RawPayload)
          : null;
      const diegoSeq = sectionPayload ? readNumberField(sectionPayload, "diego_seq") : null;

      if (rawPayload) {
        const update = buildDiegoContextUpdateFromEvent(
          diegoEventType,
          rawPayload,
          activeRunId,
          diegoSeq
        );
        if (update) {
          setDiegoPreviewContext((current) =>
            mergeDiegoPreviewContext(current, update, activeRunId)
          );
        }
      }

      if (
        eventType === "ppt.slide.generated" ||
        diegoEventType === "slide.generated"
      ) {
        const slideNo = readNumberField(rawPayload || payload, "slide_no");
        const source = rawPayload || payload;
        const rawPreview = source.preview;
        const preview =
          rawPreview && typeof rawPreview === "object"
            ? (rawPreview as RawPayload)
            : {};
        const svgDataUrl =
          readStringField(source, "svg_data_url") ||
          readStringField(preview, "svg_data_url");
        const isFinal = (rawPayload || payload).is_final === true;

        if (slideNo !== null && svgDataUrl?.startsWith("data:image/svg+xml") && isFinal) {
          const frame: RenderedPreviewFrame = {
            index: slideNo - 1,
            slide_id:
              readStringField(source, "slide_id") ||
              readStringField(preview, "slide_id") ||
              `slide-${slideNo}`,
            format: "svg",
            svg_data_url: svgDataUrl,
            preview: {
              index: slideNo - 1,
              slide_id:
                readStringField(source, "slide_id") ||
                readStringField(preview, "slide_id") ||
                `slide-${slideNo}`,
              format: "svg",
              svg_data_url: svgDataUrl,
              width: readNumberField(source, "preview_width") ?? readNumberField(preview, "width"),
              height: readNumberField(source, "preview_height") ?? readNumberField(preview, "height"),
            },
            status: readStringField(source, "status") || "ready",
            split_index: 0,
            split_count: 1,
            width: readNumberField(source, "preview_width") ?? readNumberField(preview, "width"),
            height: readNumberField(source, "preview_height") ?? readNumberField(preview, "height"),
          };
          setSlides(prev => {
            const updated = [...prev];
            const existingIndex = updated.findIndex(s => s.index === slideNo - 1);
            if (existingIndex >= 0) {
              updated[existingIndex] = {
                ...updated[existingIndex],
                thumbnail_url: svgDataUrl,
                rendered_previews: [frame],
              };
            } else {
              updated.push({
                id: `slide-${slideNo}`,
                index: slideNo - 1,
                title: `Slide ${slideNo}`,
                content: "",
                sources: [],
                thumbnail_url: svgDataUrl,
                rendered_previews: [frame],
              });
            }
            return updated.sort((a, b) => a.index - b.index);
          });
          continue;
        }
      }

      if (
        eventType === "ppt.slide.generated" ||
        eventType === "ppt.completed" ||
        diegoEventType === "slide.generated" ||
        diegoEventType === "compile.completed"
      ) {
        void loadSlides();
        continue;
      }
      if (diegoEventType === "run.failed" || diegoEventType === "slide.failed") {
        const failedMessage =
          readStringField(payload, "progress_message") ||
          readStringField(payload, "error_message") ||
          readStringField(payload, "state_reason") ||
          diegoEventType;
        setSessionFailureMessage(failedMessage);
        void loadSlides();
        continue;
      }
      if (eventType === "state.changed" && event.state) {
        setPreviewSessionState(event.state);
      }
      if (eventType === "task.completed" || event.state === "SUCCESS") {
        void loadSlides();
      }
    }
  }, [activeRunId, events, loadSlides]);

  useEffect(() => {
    if (!activeRunId || !isSessionGenerating) return;
    const timer = window.setInterval(() => {
      void loadSlides();
    }, 30000);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeRunId, isSessionGenerating, loadSlides]);

  const handleResume = useCallback(async () => {
    if (!activeSessionId || isResuming) return;
    try {
      setIsResuming(true);
      await generateApi.sendCommand(activeSessionId, {
        command: {
          command_type: "RESUME_SESSION",
        },
      });
      await fetchGenerationHistory(projectId);
      await Promise.all([loadSessionRuns(), loadSlides()]);
      toast({
        title: "会话恢复成功",
        description: "已触发恢复并刷新 Diego 预览。",
      });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "恢复会话失败，请稍后重试";
      toast({
        title: "恢复会话失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsResuming(false);
    }
  }, [
    activeSessionId,
    fetchGenerationHistory,
    isResuming,
    loadSessionRuns,
    loadSlides,
    projectId,
  ]);

  const handleExport = useCallback(async () => {
    if (!activeSessionId || !activeRunId || isExporting) return;
    try {
      setIsExporting(true);

      const exportArtifactId =
        sessionRuns.find((run) => run.run_id === activeRunId)?.artifact_id ||
        currentArtifactId ||
        null;
      if (exportArtifactId) {
        await exportArtifact(exportArtifactId);
        return;
      }

      toast({
        title: "导出失败",
        description: "当前 run 尚未绑定可导出的 PPTX 产物",
        variant: "destructive",
      });
    } catch (error) {
      toast({
        title: "导出失败",
        description: error instanceof Error ? error.message : "导出异常",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    activeSessionId,
    activeRunId,
    isExporting,
    exportArtifact,
    sessionRuns,
    currentArtifactId,
  ]);

  const currentRunDetail = useMemo(() => {
    return sessionRuns.find(run => run.run_id === activeRunId) || null;
  }, [sessionRuns, activeRunId]);

  const generationModeLabel = useMemo(() => {
    if (!currentRunDetail) return "PPT";
    if (currentRunDetail.tool_type === "ppt_scratch") return "智能布局";
    if (currentRunDetail.tool_type === "ppt_template") return "经典模板";
    return "PPT";
  }, [currentRunDetail]);

  const runTitle = useMemo(() => {
    const currentRunTitle = currentRunDetail?.run_title?.trim() || "";
    if (currentRunTitle && !isBadRunTitle(currentRunTitle)) {
      return currentRunTitle;
    }
    const sessionTitle = generationHistory
      .find((item) => item.id === activeSessionId)
      ?.title?.trim();
    if (sessionTitle) {
      return sessionTitle;
    }
    if (currentRunTitle) {
      return currentRunTitle;
    }
    return "未命名演示文稿";
  }, [activeSessionId, currentRunDetail, generationHistory]);

  return useMemo(
    () => ({
      slides,
      sessionRuns,
      isLoading,
      isExporting,
      isResuming,
      previewBlockedReason,
      isSessionGenerating,
      generationSession,
      sessionState,
      sessionFailureMessage,
      slidesContentMarkdown,
      authorityPreview,
      previewOutline,
      previewPreambleLogs,
      activeSessionId,
      activeRunId,
      currentArtifactId,
      currentRenderVersion,
      diegoPreviewContext,
      currentRunDetail,
      generationModeLabel,
      runTitle,
      handleExport,
      handleResume,
      loadSlides,
      loadSessionRuns,
      currentPptUrl,
    }),
    [
      slides,
      sessionRuns,
      isLoading,
      isExporting,
      isResuming,
      previewBlockedReason,
      isSessionGenerating,
      generationSession,
      sessionState,
      sessionFailureMessage,
      slidesContentMarkdown,
      authorityPreview,
      previewOutline,
      previewPreambleLogs,
      activeSessionId,
      activeRunId,
      currentArtifactId,
      currentRenderVersion,
      diegoPreviewContext,
      currentRunDetail,
      generationModeLabel,
      runTitle,
      handleExport,
      handleResume,
      loadSlides,
      loadSessionRuns,
      currentPptUrl,
    ]
  );
}
