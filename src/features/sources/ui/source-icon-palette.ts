import type { ArtifactTone } from "@/features/artifacts/ui/artifact-presentation";
import type { SourceVisualFamily } from "../presentation";

export const SOURCE_ICON_PALETTE = {
  pdf: {
    light: { foreground: "#be123c", background: "#ffe4e6" },
    dark: { foreground: "#fda4af", background: "#3f121e" },
  },
  document: {
    light: { foreground: "#1d4ed8", background: "#dbeafe" },
    dark: { foreground: "#93c5fd", background: "#172554" },
  },
  presentation: {
    light: { foreground: "#c2410c", background: "#ffedd5" },
    dark: { foreground: "#fdba74", background: "#431407" },
  },
  spreadsheet: {
    light: { foreground: "#0f766e", background: "#ccfbf1" },
    dark: { foreground: "#5eead4", background: "#134e4a" },
  },
  text: {
    light: { foreground: "#0369a1", background: "#e0f2fe" },
    dark: { foreground: "#7dd3fc", background: "#0c4a6e" },
  },
  table: {
    light: { foreground: "#15803d", background: "#dcfce7" },
    dark: { foreground: "#86efac", background: "#14532d" },
  },
  structured: {
    light: { foreground: "#7e22ce", background: "#f3e8ff" },
    dark: { foreground: "#d8b4fe", background: "#3b0764" },
  },
  code: {
    light: { foreground: "#475569", background: "#e2e8f0" },
    dark: { foreground: "#cbd5e1", background: "#1e293b" },
  },
  captions: {
    light: { foreground: "#0e7490", background: "#cffafe" },
    dark: { foreground: "#67e8f9", background: "#164e63" },
  },
  notebook: {
    light: { foreground: "#b45309", background: "#fef3c7" },
    dark: { foreground: "#fcd34d", background: "#451a03" },
  },
  image: {
    light: { foreground: "#047857", background: "#d1fae5" },
    dark: { foreground: "#6ee7b7", background: "#064e3b" },
  },
  audio: {
    light: { foreground: "#a21caf", background: "#fae8ff" },
    dark: { foreground: "#f0abfc", background: "#4a044e" },
  },
  video: {
    light: { foreground: "#4338ca", background: "#e0e7ff" },
    dark: { foreground: "#a5b4fc", background: "#1e1b4b" },
  },
  workspace: {
    light: { foreground: "#5b6ee1", background: "#eef0ff" },
    dark: { foreground: "#8ea2ff", background: "#202747" },
  },
  neutral: {
    light: { foreground: "#52525b", background: "#e4e4e7" },
    dark: { foreground: "#d4d4d8", background: "#27272a" },
  },
} as const satisfies Record<
  SourceVisualFamily,
  {
    light: { foreground: string; background: string };
    dark: { foreground: string; background: string };
  }
>;

/**
 * Artifact sources keep their studio tone after becoming graph nodes. The
 * foreground values intentionally match the source-list tone tokens so the
 * same source has the same visual identity in both views.
 */
export const ARTIFACT_TONE_PALETTE = {
  orange: {
    light: { foreground: "#c2410c", background: "#ffedd5" },
    dark: { foreground: "#fb923c", background: "#431407" },
  },
  blue: {
    light: { foreground: "#2563eb", background: "#dbeafe" },
    dark: { foreground: "#60a5fa", background: "#172554" },
  },
  teal: {
    light: { foreground: "#0f766e", background: "#ccfbf1" },
    dark: { foreground: "#2dd4bf", background: "#134e4a" },
  },
  rose: {
    light: { foreground: "#be123c", background: "#ffe4e6" },
    dark: { foreground: "#fb7185", background: "#3f121e" },
  },
  violet: {
    light: { foreground: "#7c3aed", background: "#f3e8ff" },
    dark: { foreground: "#a78bfa", background: "#2e1065" },
  },
  green: {
    light: { foreground: "#15803d", background: "#dcfce7" },
    dark: { foreground: "#4ade80", background: "#14532d" },
  },
} as const satisfies Record<
  ArtifactTone,
  {
    light: { foreground: string; background: string };
    dark: { foreground: string; background: string };
  }
>;
