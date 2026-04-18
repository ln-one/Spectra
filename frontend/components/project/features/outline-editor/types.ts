import type { components } from "@/lib/sdk/types";

export type OutlineDocument = components["schemas"]["OutlineDocument"];

export interface OutlineEditorConfig {
  detailLevel: "brief" | "standard" | "detailed";
  visualTheme: string;
  imageStyle: string;
  keywords: string[];
}

export interface SlideCard {
  id: string;
  order: number;
  title: string;
  keyPoints: string[];
  estimatedMinutes?: number;
}

export interface OutlineEditorPanelProps {
  variant?: "default" | "compact";
  topic?: string;
  isBootstrapping?: boolean;
  initialOutline?: OutlineDocument;
  onBack?: () => void;
  onConfirm?: (outline: OutlineDocument, config: OutlineEditorConfig) => void;
  onPreview?: () => void;
}

// ---------------------------------------------------------------------------
// Internal types used by the streaming outline panel (OutlineEditorPanel.tsx)
// ---------------------------------------------------------------------------

export type DiegoPageType = "cover" | "toc" | "section" | "content" | "summary";
export type DiegoStreamChannel = "diego.preamble" | "diego.outline.token";

export type SlideDraft = {
  id: string;
  order: number;
  title: string;
  keyPoints: string[];
  estimatedMinutes?: number;
  pageType: DiegoPageType;
  layoutHint: string;
};

export type StreamLogTone = "info" | "success" | "warn" | "error";
export type StreamLog = {
  id: string;
  ts: string;
  title: string;
  detail?: string;
  tone: StreamLogTone;
};

export type DetailSection = {
  title: string;
  lines: string[];
};

export type SessionEventLike = {
  event_id?: string;
  cursor?: string;
  timestamp: string;
  event_type?: string;
  state?: string;
  payload?: unknown;
};

export type OutlineRunCachePayload = {
  sessionId: string;
  runId: string;
  phase: PanelPhase;
  preambleCollapsed: boolean;
  streamLogs: StreamLog[];
  outlineStreamText: string;
  slides: SlideDraft[];
  analysisPageCount: number;
  updatedAt: string;
};

export type PanelPhase = "preamble_streaming" | "outline_streaming" | "editing";

export type ParsedOutlineNode = {
  title?: string;
  bullets?: string[];
  pageType?: DiegoPageType;
  layoutHint?: string;
};
