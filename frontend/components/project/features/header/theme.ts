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
