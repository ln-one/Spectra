import type { CSSProperties } from "react";
import {
  getThemePresetDefinition,
  THEME_PRESET_SET,
  type ProjectStyleVariant,
  type ProjectThemeDefinition,
  type ThemePresetId,
} from "@/components/project/features/header/theme";

export const PROJECT_THEME_STORAGE_KEY = "spectra:project-theme";
export const DEFAULT_PROJECT_THEME_PRESET: ThemePresetId = "mist-zinc";

type ThemeStyleAttrs = {
  "data-project-theme": ThemePresetId;
  "data-project-style": ProjectStyleVariant;
};

function getStyleSurfaceVars(
  styleVariant: ProjectStyleVariant
): Record<string, string> {
  if (styleVariant === "ocean-cyan") {
    return {
      "--project-control-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 74%, transparent)",
      "--project-control-bg-hover":
        "color-mix(in srgb, var(--project-surface) 66%, transparent)",
      "--project-control-border":
        "color-mix(in srgb, var(--project-border-strong) 68%, rgba(255,255,255,0.55))",
      "--project-control-text": "var(--project-text-primary)",
      "--project-control-muted": "var(--project-text-muted)",
      "--project-menu-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 72%, rgba(255,255,255,0.4))",
      "--project-menu-border":
        "color-mix(in srgb, var(--project-border) 74%, rgba(255,255,255,0.5))",
      "--project-menu-shadow": "0 28px 56px -34px rgba(8, 64, 82, 0.5)",
      "--project-overlay": "rgba(5, 22, 35, 0.3)",
      "--project-success": "var(--project-accent)",
      "--project-success-soft":
        "color-mix(in srgb, var(--project-accent) 14%, white)",
      "--project-danger": "#dc2626",
      "--project-danger-soft": "rgba(220, 38, 38, 0.12)",
    };
  }

  if (styleVariant === "teal-mint") {
    return {
      "--project-control-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 82%, #edfffa)",
      "--project-control-bg-hover":
        "color-mix(in srgb, var(--project-surface-muted) 72%, #dafbf3)",
      "--project-control-border":
        "color-mix(in srgb, var(--project-border-strong) 72%, #7ad7ca)",
      "--project-control-text": "var(--project-text-primary)",
      "--project-control-muted": "var(--project-text-muted)",
      "--project-menu-bg":
        "color-mix(in srgb, var(--project-surface) 92%, #e3fbf7)",
      "--project-menu-border":
        "color-mix(in srgb, var(--project-border) 78%, #8bded2)",
      "--project-menu-shadow": "0 26px 48px -34px rgba(13, 148, 136, 0.42)",
      "--project-overlay": "rgba(7, 55, 51, 0.28)",
      "--project-success": "#059669",
      "--project-success-soft": "rgba(5, 150, 105, 0.14)",
      "--project-danger": "#dc2626",
      "--project-danger-soft": "rgba(220, 38, 38, 0.12)",
    };
  }

  if (styleVariant === "ink-sky") {
    return {
      "--project-control-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 94%, #e8f2ff)",
      "--project-control-bg-hover":
        "color-mix(in srgb, var(--project-surface-muted) 88%, #d8e8ff)",
      "--project-control-border":
        "color-mix(in srgb, var(--project-border-strong) 82%, #3768d8)",
      "--project-control-text": "var(--project-text-primary)",
      "--project-control-muted": "var(--project-text-muted)",
      "--project-menu-bg":
        "color-mix(in srgb, var(--project-surface) 95%, #e8f2ff)",
      "--project-menu-border":
        "color-mix(in srgb, var(--project-border) 82%, #6ea1ff)",
      "--project-menu-shadow": "0 22px 38px -30px rgba(29, 78, 216, 0.46)",
      "--project-overlay": "rgba(8, 22, 58, 0.32)",
      "--project-success": "#2563eb",
      "--project-success-soft": "rgba(37, 99, 235, 0.16)",
      "--project-danger": "#ef4444",
      "--project-danger-soft": "rgba(239, 68, 68, 0.14)",
    };
  }

  if (styleVariant === "forest-emerald") {
    return {
      "--project-control-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 96%, #f6edd8)",
      "--project-control-bg-hover":
        "color-mix(in srgb, var(--project-surface-muted) 95%, #efe2c6)",
      "--project-control-border":
        "color-mix(in srgb, var(--project-border-strong) 78%, #8c6a3f)",
      "--project-control-text": "var(--project-text-primary)",
      "--project-control-muted": "var(--project-caption)",
      "--project-menu-bg":
        "color-mix(in srgb, var(--project-surface) 95%, #f7ecd3)",
      "--project-menu-border":
        "color-mix(in srgb, var(--project-border) 76%, #9a774a)",
      "--project-menu-shadow": "0 20px 30px -24px rgba(121, 81, 28, 0.4)",
      "--project-overlay": "rgba(66, 37, 8, 0.24)",
      "--project-success": "var(--project-accent)",
      "--project-success-soft":
        "color-mix(in srgb, var(--project-accent) 18%, white)",
      "--project-danger": "#b91c1c",
      "--project-danger-soft": "rgba(185, 28, 28, 0.12)",
    };
  }

  if (styleVariant === "sand-ochre") {
    return {
      "--project-control-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 94%, #fff3d9)",
      "--project-control-bg-hover":
        "color-mix(in srgb, var(--project-surface-muted) 93%, #f8eccf)",
      "--project-control-border":
        "color-mix(in srgb, var(--project-border-strong) 76%, #9d7c49)",
      "--project-control-text": "var(--project-text-primary)",
      "--project-control-muted": "var(--project-caption)",
      "--project-menu-bg":
        "color-mix(in srgb, var(--project-surface) 95%, #f6ebd1)",
      "--project-menu-border":
        "color-mix(in srgb, var(--project-border) 74%, #b89a68)",
      "--project-menu-shadow": "0 18px 26px -22px rgba(128, 86, 30, 0.36)",
      "--project-overlay": "rgba(67, 44, 16, 0.24)",
      "--project-success": "#b26124",
      "--project-success-soft": "rgba(178, 97, 36, 0.16)",
      "--project-danger": "#b91c1c",
      "--project-danger-soft": "rgba(185, 28, 28, 0.12)",
    };
  }

  if (styleVariant === "sunset-amber") {
    return {
      "--project-control-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 92%, #fff1e1)",
      "--project-control-bg-hover":
        "color-mix(in srgb, var(--project-surface-muted) 86%, #ffe3c4)",
      "--project-control-border":
        "color-mix(in srgb, var(--project-border-strong) 78%, #db7a32)",
      "--project-control-text": "var(--project-text-primary)",
      "--project-control-muted": "var(--project-caption)",
      "--project-menu-bg":
        "color-mix(in srgb, var(--project-surface) 93%, #ffe7cb)",
      "--project-menu-border":
        "color-mix(in srgb, var(--project-border) 80%, #e6965a)",
      "--project-menu-shadow": "0 22px 34px -26px rgba(194, 65, 12, 0.42)",
      "--project-overlay": "rgba(84, 33, 7, 0.28)",
      "--project-success": "#e66a1a",
      "--project-success-soft": "rgba(230, 106, 26, 0.16)",
      "--project-danger": "#dc2626",
      "--project-danger-soft": "rgba(220, 38, 38, 0.12)",
    };
  }

  if (styleVariant === "graphite-blue") {
    return {
      "--project-control-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 92%, #0f172a)",
      "--project-control-bg-hover":
        "color-mix(in srgb, var(--project-surface-muted) 85%, #0f172a)",
      "--project-control-border": "var(--project-border-strong)",
      "--project-control-text": "var(--project-text-primary)",
      "--project-control-muted": "var(--project-text-muted)",
      "--project-menu-bg":
        "color-mix(in srgb, var(--project-surface) 90%, #0b1020)",
      "--project-menu-border": "var(--project-border-strong)",
      "--project-menu-shadow": "10px 10px 0 -4px rgba(15, 23, 42, 0.68)",
      "--project-overlay": "rgba(2, 6, 23, 0.42)",
      "--project-success": "var(--project-accent)",
      "--project-success-soft":
        "color-mix(in srgb, var(--project-accent) 22%, white)",
      "--project-danger": "#ef4444",
      "--project-danger-soft": "rgba(239, 68, 68, 0.14)",
    };
  }

  if (styleVariant === "lavender-slate") {
    return {
      "--project-control-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 90%, #f4edff)",
      "--project-control-bg-hover":
        "color-mix(in srgb, var(--project-surface-muted) 86%, #ece2ff)",
      "--project-control-border":
        "color-mix(in srgb, var(--project-border-strong) 78%, #8d66da)",
      "--project-control-text": "var(--project-text-primary)",
      "--project-control-muted": "var(--project-text-muted)",
      "--project-menu-bg":
        "color-mix(in srgb, var(--project-surface) 92%, #f3eaff)",
      "--project-menu-border":
        "color-mix(in srgb, var(--project-border) 78%, #a07be3)",
      "--project-menu-shadow": "0 22px 36px -28px rgba(109, 40, 217, 0.4)",
      "--project-overlay": "rgba(40, 16, 86, 0.28)",
      "--project-success": "#7a45d1",
      "--project-success-soft": "rgba(122, 69, 209, 0.16)",
      "--project-danger": "#dc2626",
      "--project-danger-soft": "rgba(220, 38, 38, 0.12)",
    };
  }

  if (styleVariant === "rose-wine") {
    return {
      "--project-control-bg":
        "color-mix(in srgb, var(--project-surface-elevated) 90%, #ffe9f0)",
      "--project-control-bg-hover":
        "color-mix(in srgb, var(--project-surface-muted) 86%, #ffd9e6)",
      "--project-control-border":
        "color-mix(in srgb, var(--project-border-strong) 78%, #cc4f82)",
      "--project-control-text": "var(--project-text-primary)",
      "--project-control-muted": "var(--project-text-muted)",
      "--project-menu-bg":
        "color-mix(in srgb, var(--project-surface) 92%, #ffe7ef)",
      "--project-menu-border":
        "color-mix(in srgb, var(--project-border) 78%, #d96a98)",
      "--project-menu-shadow": "0 22px 34px -28px rgba(190, 24, 93, 0.38)",
      "--project-overlay": "rgba(86, 15, 45, 0.28)",
      "--project-success": "#cc3d79",
      "--project-success-soft": "rgba(204, 61, 121, 0.16)",
      "--project-danger": "#dc2626",
      "--project-danger-soft": "rgba(220, 38, 38, 0.12)",
    };
  }

  return {
    "--project-control-bg": "#ffffff",
    "--project-control-bg-hover": "#fafafa",
    "--project-control-border": "rgba(228,228,231,0.85)",
    "--project-control-text": "#3f3f46",
    "--project-control-muted": "#71717a",
    "--project-menu-bg": "rgba(255,255,255,0.95)",
    "--project-menu-border": "rgba(228,228,231,0.85)",
    "--project-menu-shadow": "0 12px 28px -20px rgba(15, 23, 42, 0.18)",
    "--project-overlay": "rgba(2, 6, 23, 0.1)",
    "--project-success": "#10b981",
    "--project-success-soft": "rgba(16, 185, 129, 0.12)",
    "--project-danger": "#dc2626",
    "--project-danger-soft": "rgba(220, 38, 38, 0.12)",
  };
}

export function isThemePreset(value: string | null): value is ThemePresetId {
  return !!value && THEME_PRESET_SET.has(value as ThemePresetId);
}

export function resolveProjectThemePreset(value: string | null): ThemePresetId {
  return isThemePreset(value) ? value : DEFAULT_PROJECT_THEME_PRESET;
}

export function getProjectTheme(
  themeId: ThemePresetId
): ProjectThemeDefinition {
  return getThemePresetDefinition(themeId);
}

export function getProjectThemeAttributes(
  themeId: ThemePresetId
): ThemeStyleAttrs {
  const theme = getProjectTheme(themeId);
  return {
    "data-project-theme": theme.id,
    "data-project-style": theme.styleVariant,
  };
}

export function getProjectThemeStyle(themeId: ThemePresetId): CSSProperties {
  const activeTheme = getProjectTheme(themeId);
  const { colorTokens, componentTokens } = activeTheme;

  return {
    "--project-bg-base": colorTokens.bgBase,
    "--project-bg-start": colorTokens.bgGradientStart,
    "--project-bg-end": colorTokens.bgGradientEnd,
    "--project-bg-glow": colorTokens.bgGlow,
    "--project-heading": colorTokens.headingColor,
    "--project-caption": colorTokens.captionColor,
    "--project-surface": colorTokens.surface,
    "--project-surface-elevated": colorTokens.surfaceElevated,
    "--project-surface-muted": colorTokens.surfaceMuted,
    "--project-border": colorTokens.border,
    "--project-border-strong": colorTokens.borderStrong,
    "--project-text-primary": colorTokens.textPrimary,
    "--project-text-muted": colorTokens.textMuted,
    "--project-accent": colorTokens.accent,
    "--project-accent-hover": colorTokens.accentHover,
    "--project-accent-text": colorTokens.accentText,

    "--project-panel-radius": componentTokens.panelRadius,
    "--project-panel-border-width": componentTokens.panelBorderWidth,
    "--project-panel-shadow": componentTokens.panelShadow,
    "--project-panel-blur": componentTokens.panelBlur,
    "--project-menu-radius": componentTokens.menuRadius,
    "--project-control-radius": componentTokens.controlRadius,
    "--project-chip-radius": componentTokens.chipRadius,
    "--project-input-radius": componentTokens.inputRadius,
    "--project-header-height": componentTokens.headerHeight,
    "--project-control-height": componentTokens.controlHeight,
    "--project-heading-weight": componentTokens.titleWeight,
    "--project-heading-tracking": componentTokens.titleTracking,

    "--project-logo-start": colorTokens.accent,
    "--project-logo-end": colorTokens.headingColor,
    "--project-logo-text": colorTokens.accentText,

    ...getStyleSurfaceVars(activeTheme.styleVariant),
  } as CSSProperties;
}
