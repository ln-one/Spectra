export const THEME_PRESETS = [
  {
    id: "mist-zinc",
    name: "经典锌灰",
    description: "还原旧版默认视觉，稳重耐看",
    swatches: ["#3f3f46", "#71717a", "#e4e4e7"],
  },
  {
    id: "ocean-cyan",
    name: "课堂蓝白",
    description: "教学软件常见风格：清晰、专业、低干扰",
    swatches: ["#0b3a5e", "#0b7fc5", "#d8ecfb"],
  },
  {
    id: "forest-emerald",
    name: "学习通绿白",
    description: "教学软件常见风格：柔和护眼，阅读友好",
    swatches: ["#124a2d", "#0f9a68", "#dcf3e7"],
  },
  {
    id: "sunset-amber",
    name: "慕课橙白",
    description: "教学软件常见风格：活力清晰，展示感强",
    swatches: ["#7a3213", "#e66a1a", "#fde7d4"],
  },
  {
    id: "graphite-blue",
    name: "石墨蓝灰",
    description: "现代工作台风格，干净高对比",
    swatches: ["#1f2a3a", "#2f6fde", "#dfe7f1"],
  },
  {
    id: "lavender-slate",
    name: "雾紫云母",
    description: "轻创意风格，细腻但不过分跳脱",
    swatches: ["#4b1f90", "#7a45d1", "#eae5f9"],
  },
  {
    id: "rose-wine",
    name: "玫瑰绯红",
    description: "叙事导向风格，适合人文类内容",
    swatches: ["#811a42", "#cc3d79", "#fce2ec"],
  },
  {
    id: "teal-mint",
    name: "湖青薄荷",
    description: "现代轻盈风格，适合知识卡片和速览",
    swatches: ["#124b46", "#0c8f83", "#d8f4f0"],
  },
  {
    id: "sand-ochre",
    name: "砂岩米金",
    description: "温暖克制，适合讲义排版与打印预览",
    swatches: ["#73340f", "#b26124", "#f4e8c9"],
  },
  {
    id: "ink-sky",
    name: "晴空墨蓝",
    description: "信息密度高时更清晰，图表阅读友好",
    swatches: ["#121b2d", "#2d55c7", "#dbe8f9"],
  },
] as const;

export type ThemePresetId = (typeof THEME_PRESETS)[number]["id"];

export type ProjectStyleVariant = ThemePresetId;

export type ProjectThemeColorTokens = {
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

export type ProjectThemeComponentTokens = {
  panelRadius: string;
  panelBorderWidth: string;
  panelShadow: string;
  panelBlur: string;
  menuRadius: string;
  controlRadius: string;
  chipRadius: string;
  inputRadius: string;
  headerHeight: string;
  controlHeight: string;
  titleWeight: string;
  titleTracking: string;
};

type ThemePresetMeta = (typeof THEME_PRESETS)[number];

export type ProjectThemeDefinition = ThemePresetMeta & {
  styleVariant: ProjectStyleVariant;
  colorTokens: ProjectThemeColorTokens;
  componentTokens: ProjectThemeComponentTokens;
};

const THEME_STYLE_BY_PRESET: Record<ThemePresetId, ProjectStyleVariant> = {
  "mist-zinc": "mist-zinc",
  "ocean-cyan": "ocean-cyan",
  "teal-mint": "teal-mint",
  "ink-sky": "ink-sky",
  "forest-emerald": "forest-emerald",
  "sand-ochre": "sand-ochre",
  "sunset-amber": "sunset-amber",
  "graphite-blue": "graphite-blue",
  "lavender-slate": "lavender-slate",
  "rose-wine": "rose-wine",
};

const STYLE_COMPONENT_TOKENS: Record<
  ProjectStyleVariant,
  ProjectThemeComponentTokens
> = {
  "mist-zinc": {
    panelRadius: "1rem",
    panelBorderWidth: "1px",
    panelShadow: "0 10px 15px -3px rgba(2, 6, 23, 0.08), 0 4px 6px -4px rgba(2, 6, 23, 0.05)",
    panelBlur: "20px",
    menuRadius: "1rem",
    controlRadius: "999px",
    chipRadius: "0.625rem",
    inputRadius: "0.75rem",
    headerHeight: "4rem",
    controlHeight: "2.25rem",
    titleWeight: "700",
    titleTracking: "-0.025em",
  },
  "ocean-cyan": {
    panelRadius: "1.5rem",
    panelBorderWidth: "1px",
    panelShadow: "0 34px 58px -38px rgba(14, 116, 144, 0.48)",
    panelBlur: "30px",
    menuRadius: "1.35rem",
    controlRadius: "999px",
    chipRadius: "999px",
    inputRadius: "1rem",
    headerHeight: "4.1rem",
    controlHeight: "2.4rem",
    titleWeight: "700",
    titleTracking: "-0.018em",
  },
  "teal-mint": {
    panelRadius: "1.4rem",
    panelBorderWidth: "1px",
    panelShadow: "0 30px 48px -34px rgba(15, 118, 110, 0.42)",
    panelBlur: "24px",
    menuRadius: "1.25rem",
    controlRadius: "0.95rem",
    chipRadius: "0.95rem",
    inputRadius: "1rem",
    headerHeight: "4.1rem",
    controlHeight: "2.34rem",
    titleWeight: "720",
    titleTracking: "0.006em",
  },
  "ink-sky": {
    panelRadius: "0.9rem",
    panelBorderWidth: "1.5px",
    panelShadow: "0 20px 36px -26px rgba(30, 64, 175, 0.46)",
    panelBlur: "12px",
    menuRadius: "0.9rem",
    controlRadius: "0.75rem",
    chipRadius: "0.72rem",
    inputRadius: "0.78rem",
    headerHeight: "4.1rem",
    controlHeight: "2.32rem",
    titleWeight: "760",
    titleTracking: "-0.004em",
  },
  "forest-emerald": {
    panelRadius: "0.5rem",
    panelBorderWidth: "1.5px",
    panelShadow: "0 16px 26px -22px rgba(92, 58, 22, 0.28)",
    panelBlur: "2px",
    menuRadius: "0.6rem",
    controlRadius: "0.55rem",
    chipRadius: "0.45rem",
    inputRadius: "0.5rem",
    headerHeight: "4.15rem",
    controlHeight: "2.28rem",
    titleWeight: "780",
    titleTracking: "0.035em",
  },
  "sand-ochre": {
    panelRadius: "0.55rem",
    panelBorderWidth: "1.5px",
    panelShadow: "0 12px 24px -20px rgba(128, 86, 30, 0.34)",
    panelBlur: "3px",
    menuRadius: "0.62rem",
    controlRadius: "0.56rem",
    chipRadius: "0.5rem",
    inputRadius: "0.55rem",
    headerHeight: "4.12rem",
    controlHeight: "2.26rem",
    titleWeight: "760",
    titleTracking: "0.028em",
  },
  "sunset-amber": {
    panelRadius: "1rem",
    panelBorderWidth: "1.25px",
    panelShadow: "0 18px 32px -24px rgba(194, 65, 12, 0.42)",
    panelBlur: "10px",
    menuRadius: "1rem",
    controlRadius: "0.95rem",
    chipRadius: "0.88rem",
    inputRadius: "0.9rem",
    headerHeight: "4.08rem",
    controlHeight: "2.34rem",
    titleWeight: "750",
    titleTracking: "0.01em",
  },
  "graphite-blue": {
    panelRadius: "0.4rem",
    panelBorderWidth: "2px",
    panelShadow: "10px 10px 0 -4px rgba(15, 23, 42, 0.72)",
    panelBlur: "0px",
    menuRadius: "0.45rem",
    controlRadius: "0.45rem",
    chipRadius: "0.35rem",
    inputRadius: "0.4rem",
    headerHeight: "4.15rem",
    controlHeight: "2.35rem",
    titleWeight: "800",
    titleTracking: "0.02em",
  },
  "lavender-slate": {
    panelRadius: "1.15rem",
    panelBorderWidth: "1.5px",
    panelShadow: "0 22px 34px -26px rgba(109, 40, 217, 0.4)",
    panelBlur: "12px",
    menuRadius: "1.1rem",
    controlRadius: "0.9rem",
    chipRadius: "0.85rem",
    inputRadius: "0.92rem",
    headerHeight: "4.1rem",
    controlHeight: "2.34rem",
    titleWeight: "760",
    titleTracking: "0.012em",
  },
  "rose-wine": {
    panelRadius: "1.2rem",
    panelBorderWidth: "1.5px",
    panelShadow: "0 24px 36px -28px rgba(190, 24, 93, 0.36)",
    panelBlur: "10px",
    menuRadius: "1.05rem",
    controlRadius: "1rem",
    chipRadius: "0.9rem",
    inputRadius: "0.96rem",
    headerHeight: "4.1rem",
    controlHeight: "2.34rem",
    titleWeight: "770",
    titleTracking: "0.008em",
  },
};

const THEME_COLOR_TOKENS: Record<ThemePresetId, ProjectThemeColorTokens> = {
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
    bgBase: "#ebf4fb",
    bgGradientStart: "rgba(243, 250, 255, 0.98)",
    bgGradientEnd: "rgba(216, 236, 251, 0.93)",
    bgGlow: "rgba(2, 132, 199, 0.15)",
    rayColor: "rgba(147, 197, 253, 0.22)",
    headingColor: "#0b3a5e",
    captionColor: "#0369a1",
    surface: "rgba(255,255,255,0.95)",
    surfaceElevated: "#ffffff",
    surfaceMuted: "#eef8ff",
    border: "rgba(186, 230, 253, 0.82)",
    borderStrong: "rgba(3, 105, 161, 0.36)",
    textPrimary: "#114463",
    textMuted: "#0e7490",
    accent: "#0b7fc5",
    accentHover: "#0369a1",
    accentText: "#f0f9ff",
  },
  "forest-emerald": {
    bgBase: "#edf8f2",
    bgGradientStart: "rgba(244, 252, 247, 0.98)",
    bgGradientEnd: "rgba(220, 243, 231, 0.93)",
    bgGlow: "rgba(5, 150, 105, 0.14)",
    rayColor: "rgba(110, 231, 183, 0.2)",
    headingColor: "#124a2d",
    captionColor: "#166534",
    surface: "rgba(255,255,255,0.95)",
    surfaceElevated: "#ffffff",
    surfaceMuted: "#eefaf3",
    border: "rgba(187, 247, 208, 0.8)",
    borderStrong: "rgba(22, 101, 52, 0.34)",
    textPrimary: "#124a2d",
    textMuted: "#166534",
    accent: "#0f9a68",
    accentHover: "#047857",
    accentText: "#ecfdf5",
  },
  "sunset-amber": {
    bgBase: "#fdf4ec",
    bgGradientStart: "rgba(255, 248, 241, 0.98)",
    bgGradientEnd: "rgba(253, 231, 212, 0.93)",
    bgGlow: "rgba(249, 115, 22, 0.14)",
    rayColor: "rgba(253, 186, 116, 0.21)",
    headingColor: "#7a3213",
    captionColor: "#9a3412",
    surface: "rgba(255,255,255,0.95)",
    surfaceElevated: "#ffffff",
    surfaceMuted: "#fff6ed",
    border: "rgba(254, 215, 170, 0.86)",
    borderStrong: "rgba(194, 65, 12, 0.36)",
    textPrimary: "#7a3213",
    textMuted: "#9a3412",
    accent: "#e66a1a",
    accentHover: "#c2410c",
    accentText: "#fff7ed",
  },
  "graphite-blue": {
    bgBase: "#edf1f7",
    bgGradientStart: "rgba(244, 247, 252, 0.98)",
    bgGradientEnd: "rgba(223, 231, 241, 0.93)",
    bgGlow: "rgba(59, 130, 246, 0.1)",
    rayColor: "rgba(148, 163, 184, 0.2)",
    headingColor: "#1f2a3a",
    captionColor: "#334155",
    surface: "rgba(255,255,255,0.95)",
    surfaceElevated: "#ffffff",
    surfaceMuted: "#f5f7fb",
    border: "rgba(203, 213, 225, 0.82)",
    borderStrong: "rgba(71, 85, 105, 0.34)",
    textPrimary: "#1f2a37",
    textMuted: "#475569",
    accent: "#2f6fde",
    accentHover: "#1d4ed8",
    accentText: "#eff6ff",
  },
  "lavender-slate": {
    bgBase: "#f4f2fb",
    bgGradientStart: "rgba(248, 246, 253, 0.98)",
    bgGradientEnd: "rgba(234, 229, 249, 0.94)",
    bgGlow: "rgba(124, 58, 237, 0.14)",
    rayColor: "rgba(196, 181, 253, 0.22)",
    headingColor: "#4b1f90",
    captionColor: "#5b21b6",
    surface: "rgba(255,255,255,0.95)",
    surfaceElevated: "#ffffff",
    surfaceMuted: "#f5f2ff",
    border: "rgba(221, 214, 254, 0.82)",
    borderStrong: "rgba(109, 40, 217, 0.32)",
    textPrimary: "#4b1f90",
    textMuted: "#6d28d9",
    accent: "#7a45d1",
    accentHover: "#6d28d9",
    accentText: "#f5f3ff",
  },
  "rose-wine": {
    bgBase: "#fdf1f5",
    bgGradientStart: "rgba(255, 246, 249, 0.98)",
    bgGradientEnd: "rgba(252, 226, 236, 0.93)",
    bgGlow: "rgba(190, 24, 93, 0.13)",
    rayColor: "rgba(251, 113, 133, 0.21)",
    headingColor: "#811a42",
    captionColor: "#9d174d",
    surface: "rgba(255,255,255,0.95)",
    surfaceElevated: "#ffffff",
    surfaceMuted: "#fff1f4",
    border: "rgba(252, 165, 165, 0.76)",
    borderStrong: "rgba(190, 24, 93, 0.34)",
    textPrimary: "#811a42",
    textMuted: "#9d174d",
    accent: "#cc3d79",
    accentHover: "#be185d",
    accentText: "#fff1f2",
  },
  "teal-mint": {
    bgBase: "#edf8f7",
    bgGradientStart: "rgba(242, 252, 249, 0.98)",
    bgGradientEnd: "rgba(216, 244, 240, 0.93)",
    bgGlow: "rgba(13, 148, 136, 0.14)",
    rayColor: "rgba(94, 234, 212, 0.21)",
    headingColor: "#124b46",
    captionColor: "#0f766e",
    surface: "rgba(255,255,255,0.95)",
    surfaceElevated: "#ffffff",
    surfaceMuted: "#eefbf8",
    border: "rgba(153, 246, 228, 0.8)",
    borderStrong: "rgba(15, 118, 110, 0.34)",
    textPrimary: "#124b46",
    textMuted: "#0f766e",
    accent: "#0c8f83",
    accentHover: "#0f766e",
    accentText: "#ecfeff",
  },
  "sand-ochre": {
    bgBase: "#f8f4e9",
    bgGradientStart: "rgba(251, 247, 236, 0.98)",
    bgGradientEnd: "rgba(244, 232, 201, 0.92)",
    bgGlow: "rgba(180, 83, 9, 0.13)",
    rayColor: "rgba(250, 204, 21, 0.18)",
    headingColor: "#73340f",
    captionColor: "#92400e",
    surface: "rgba(255,255,255,0.95)",
    surfaceElevated: "#ffffff",
    surfaceMuted: "#fff8ea",
    border: "rgba(253, 230, 138, 0.74)",
    borderStrong: "rgba(161, 98, 7, 0.32)",
    textPrimary: "#73340f",
    textMuted: "#a16207",
    accent: "#b26124",
    accentHover: "#92400e",
    accentText: "#fffbeb",
  },
  "ink-sky": {
    bgBase: "#edf3fa",
    bgGradientStart: "rgba(242, 247, 254, 0.98)",
    bgGradientEnd: "rgba(219, 232, 249, 0.93)",
    bgGlow: "rgba(37, 99, 235, 0.14)",
    rayColor: "rgba(147, 197, 253, 0.22)",
    headingColor: "#121b2d",
    captionColor: "#1e3a8a",
    surface: "rgba(255,255,255,0.95)",
    surfaceElevated: "#ffffff",
    surfaceMuted: "#edf3ff",
    border: "rgba(191, 219, 254, 0.82)",
    borderStrong: "rgba(37, 99, 235, 0.34)",
    textPrimary: "#121b2d",
    textMuted: "#1d4ed8",
    accent: "#2d55c7",
    accentHover: "#1e40af",
    accentText: "#f0f9ff",
  },
};

const PRESET_DEFINITION_MAP = new Map<ThemePresetId, ProjectThemeDefinition>(
  THEME_PRESETS.map((preset) => {
    const styleVariant = THEME_STYLE_BY_PRESET[preset.id];
    return [
      preset.id,
      {
        ...preset,
        styleVariant,
        colorTokens: THEME_COLOR_TOKENS[preset.id],
        componentTokens: STYLE_COMPONENT_TOKENS[styleVariant],
      },
    ];
  })
);

export const THEME_PRESET_DEFINITIONS = Array.from(PRESET_DEFINITION_MAP.values());
export const THEME_PRESET_SET = new Set<ThemePresetId>(
  THEME_PRESET_DEFINITIONS.map((theme) => theme.id)
);

export function getThemePresetDefinition(
  themeId: ThemePresetId
): ProjectThemeDefinition {
  const definition = PRESET_DEFINITION_MAP.get(themeId);
  if (!definition) {
    return PRESET_DEFINITION_MAP.get("mist-zinc") as ProjectThemeDefinition;
  }
  return definition;
}
