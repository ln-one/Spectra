import type { SourceReference } from "@/lib/sdk/chat";

export type CitationSourceType =
  | "document"
  | "web"
  | "video"
  | "audio"
  | "ai_generated";

export interface CitationViewModel {
  index: number;
  chunkId: string;
  sourceType: CitationSourceType;
  filename: string;
  pageNumber?: number;
  timestamp?: number;
  score?: number;
  contentPreview?: string;
}

type LooseCitation = SourceReference & {
  score?: number;
  content_preview?: string;
  preview_text?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function asSourceType(value: unknown): CitationSourceType {
  if (
    value === "document" ||
    value === "web" ||
    value === "video" ||
    value === "audio" ||
    value === "ai_generated"
  ) {
    return value;
  }
  return "document";
}

export function toCitationViewModel(
  citation: unknown,
  index: number
): CitationViewModel | null {
  const record = asRecord(citation);
  if (!record) return null;

  const chunkId = asString(record.chunk_id);
  if (!chunkId) return null;

  const filename = asString(record.filename) ?? "未知来源";
  const sourceType = asSourceType(record.source_type);
  const pageNumber = asNumber(record.page_number);
  const timestamp = asNumber(record.timestamp);

  return {
    index,
    chunkId,
    filename,
    sourceType,
    pageNumber,
    timestamp,
    score: asNumber((record as LooseCitation).score),
    contentPreview:
      asString((record as LooseCitation).content_preview) ??
      asString((record as LooseCitation).preview_text),
  };
}

export function toCitationViewModels(citations: unknown): CitationViewModel[] {
  if (!Array.isArray(citations)) return [];
  return citations
    .map((item, index) => toCitationViewModel(item, index))
    .filter((item): item is CitationViewModel => item !== null);
}
