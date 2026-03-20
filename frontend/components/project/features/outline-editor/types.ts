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
