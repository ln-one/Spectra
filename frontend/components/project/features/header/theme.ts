import { STYLE_COMPONENT_TOKENS } from "./theme-component-tokens";
import { THEME_COLOR_TOKENS } from "./theme-color-tokens";

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

export const THEME_PRESET_DEFINITIONS = Array.from(
  PRESET_DEFINITION_MAP.values()
);
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
