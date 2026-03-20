import type { CSSProperties } from "react";
import type { ThemePresetId } from "@/components/project/features/header/theme";

export const PROJECT_THEME_STORAGE_KEY = "spectra:project-theme";

type ProjectThemePalette = {
  bgBase: string;
  bgGradientStart: string;
  bgGradientEnd: string;
  bgGlow: string;
  rayColor: string;
  headingColor: string;
  captionColor: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentText: string;
};

export const PROJECT_THEME_PALETTES: Record<ThemePresetId, ProjectThemePalette> =
  {
    "mist-zinc": {
      bgBase: "#f4f4f5",
      bgGradientStart: "rgba(244, 244, 245, 0.98)",
      bgGradientEnd: "rgba(228, 228, 231, 0.96)",
      bgGlow: "rgba(180, 200, 255, 0.14)",
      rayColor: "rgba(200, 220, 255, 0.12)",
      headingColor: "#27272a",
      captionColor: "#71717a",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#f8fafc",
      border: "rgba(228,228,231,0.85)",
      borderStrong: "rgba(161,161,170,0.45)",
      textPrimary: "#27272a",
      textMuted: "#71717a",
      accent: "#18181b",
      accentHover: "#3f3f46",
      accentText: "#fafafa",
    },
    "ocean-cyan": {
      bgBase: "#eef4ff",
      bgGradientStart: "rgba(246, 250, 255, 0.98)",
      bgGradientEnd: "rgba(219, 234, 254, 0.92)",
      bgGlow: "rgba(37, 99, 235, 0.16)",
      rayColor: "rgba(147, 197, 253, 0.22)",
      headingColor: "#1e3a8a",
      captionColor: "#1d4ed8",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#eff6ff",
      border: "rgba(191,219,254,0.9)",
      borderStrong: "rgba(59,130,246,0.45)",
      textPrimary: "#1e3a8a",
      textMuted: "#3b82f6",
      accent: "#2563eb",
      accentHover: "#1d4ed8",
      accentText: "#eff6ff",
    },
    "forest-emerald": {
      bgBase: "#eefcf4",
      bgGradientStart: "rgba(245, 255, 249, 0.98)",
      bgGradientEnd: "rgba(220, 252, 231, 0.9)",
      bgGlow: "rgba(34, 197, 94, 0.14)",
      rayColor: "rgba(134, 239, 172, 0.2)",
      headingColor: "#166534",
      captionColor: "#166534",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#f0fdf4",
      border: "rgba(187,247,208,0.9)",
      borderStrong: "rgba(34,197,94,0.42)",
      textPrimary: "#166534",
      textMuted: "#166534",
      accent: "#16a34a",
      accentHover: "#15803d",
      accentText: "#f0fdf4",
    },
    "sunset-amber": {
      bgBase: "#fff8f0",
      bgGradientStart: "rgba(255, 249, 242, 0.98)",
      bgGradientEnd: "rgba(255, 237, 213, 0.92)",
      bgGlow: "rgba(249, 115, 22, 0.16)",
      rayColor: "rgba(253, 186, 116, 0.2)",
      headingColor: "#9a3412",
      captionColor: "#9a3412",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#fff7ed",
      border: "rgba(253,186,116,0.85)",
      borderStrong: "rgba(249,115,22,0.46)",
      textPrimary: "#9a3412",
      textMuted: "#9a3412",
      accent: "#ea580c",
      accentHover: "#f97316",
      accentText: "#fff7ed",
    },
    "graphite-blue": {
      bgBase: "#f1f5f9",
      bgGradientStart: "rgba(248, 250, 252, 0.98)",
      bgGradientEnd: "rgba(226, 232, 240, 0.9)",
      bgGlow: "rgba(59, 130, 246, 0.12)",
      rayColor: "rgba(148, 163, 184, 0.18)",
      headingColor: "#334155",
      captionColor: "#475569",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#f8fafc",
      border: "rgba(203,213,225,0.9)",
      borderStrong: "rgba(100,116,139,0.42)",
      textPrimary: "#334155",
      textMuted: "#64748b",
      accent: "#3b82f6",
      accentHover: "#2563eb",
      accentText: "#eff6ff",
    },
    "lavender-slate": {
      bgBase: "#f8f5ff",
      bgGradientStart: "rgba(250, 246, 255, 0.98)",
      bgGradientEnd: "rgba(243, 232, 255, 0.9)",
      bgGlow: "rgba(168, 85, 247, 0.14)",
      rayColor: "rgba(196, 181, 253, 0.2)",
      headingColor: "#6d28d9",
      captionColor: "#7e22ce",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#faf5ff",
      border: "rgba(216,180,254,0.85)",
      borderStrong: "rgba(168,85,247,0.4)",
      textPrimary: "#6d28d9",
      textMuted: "#7e22ce",
      accent: "#9333ea",
      accentHover: "#a855f7",
      accentText: "#f5f3ff",
    },
    "rose-wine": {
      bgBase: "#fff4f7",
      bgGradientStart: "rgba(255, 246, 249, 0.98)",
      bgGradientEnd: "rgba(255, 228, 236, 0.9)",
      bgGlow: "rgba(244, 63, 94, 0.15)",
      rayColor: "rgba(251, 113, 133, 0.2)",
      headingColor: "#9f1239",
      captionColor: "#9f1239",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#fff1f2",
      border: "rgba(253,164,175,0.82)",
      borderStrong: "rgba(244,63,94,0.4)",
      textPrimary: "#9f1239",
      textMuted: "#9f1239",
      accent: "#e11d48",
      accentHover: "#f43f5e",
      accentText: "#fff1f2",
    },
    "teal-mint": {
      bgBase: "#f2fffc",
      bgGradientStart: "rgba(243, 255, 251, 0.98)",
      bgGradientEnd: "rgba(204, 251, 241, 0.9)",
      bgGlow: "rgba(20, 184, 166, 0.15)",
      rayColor: "rgba(94, 234, 212, 0.2)",
      headingColor: "#0f766e",
      captionColor: "#0f766e",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#f0fdfa",
      border: "rgba(153,246,228,0.88)",
      borderStrong: "rgba(20,184,166,0.42)",
      textPrimary: "#0f766e",
      textMuted: "#0f766e",
      accent: "#0d9488",
      accentHover: "#14b8a6",
      accentText: "#ecfeff",
    },
    "sand-ochre": {
      bgBase: "#fffcf4",
      bgGradientStart: "rgba(255, 252, 242, 0.98)",
      bgGradientEnd: "rgba(254, 249, 195, 0.88)",
      bgGlow: "rgba(234, 179, 8, 0.14)",
      rayColor: "rgba(253, 224, 71, 0.18)",
      headingColor: "#92400e",
      captionColor: "#a16207",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#fefce8",
      border: "rgba(253,224,71,0.78)",
      borderStrong: "rgba(234,179,8,0.4)",
      textPrimary: "#92400e",
      textMuted: "#a16207",
      accent: "#ca8a04",
      accentHover: "#eab308",
      accentText: "#fffbeb",
    },
    "ink-sky": {
      bgBase: "#f3f8ff",
      bgGradientStart: "rgba(245, 250, 255, 0.98)",
      bgGradientEnd: "rgba(224, 242, 254, 0.9)",
      bgGlow: "rgba(14, 165, 233, 0.14)",
      rayColor: "rgba(125, 211, 252, 0.18)",
      headingColor: "#0f172a",
      captionColor: "#0369a1",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#ffffff",
      surfaceMuted: "#f0f9ff",
      border: "rgba(186,230,253,0.9)",
      borderStrong: "rgba(56,189,248,0.42)",
      textPrimary: "#0f172a",
      textMuted: "#0369a1",
      accent: "#0284c7",
      accentHover: "#0ea5e9",
      accentText: "#f0f9ff",
    },
  };

export function isThemePreset(value: string | null): value is ThemePresetId {
  return !!value && value in PROJECT_THEME_PALETTES;
}

export function getProjectTheme(themeId: ThemePresetId): ProjectThemePalette {
  return PROJECT_THEME_PALETTES[themeId];
}

export function getProjectThemeStyle(
  themeId: ThemePresetId
): CSSProperties {
  const activeTheme = getProjectTheme(themeId);
  return {
    "--project-bg-base": activeTheme.bgBase,
    "--project-bg-start": activeTheme.bgGradientStart,
    "--project-bg-end": activeTheme.bgGradientEnd,
    "--project-bg-glow": activeTheme.bgGlow,
    "--project-heading": activeTheme.headingColor,
    "--project-caption": activeTheme.captionColor,
    "--project-surface": activeTheme.surface,
    "--project-surface-elevated": activeTheme.surfaceElevated,
    "--project-surface-muted": activeTheme.surfaceMuted,
    "--project-border": activeTheme.border,
    "--project-border-strong": activeTheme.borderStrong,
    "--project-text-primary": activeTheme.textPrimary,
    "--project-text-muted": activeTheme.textMuted,
    "--project-accent": activeTheme.accent,
    "--project-accent-hover": activeTheme.accentHover,
    "--project-accent-text": activeTheme.accentText,
  } as CSSProperties;
}
