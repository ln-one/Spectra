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
    swatches: ["#1e3a8a", "#2563eb", "#dbeafe"],
  },
  {
    id: "forest-emerald",
    name: "学习通绿白",
    description: "教学软件常见风格：柔和护眼，阅读友好",
    swatches: ["#166534", "#22c55e", "#dcfce7"],
  },
  {
    id: "sunset-amber",
    name: "慕课橙白",
    description: "教学软件常见风格：活力清晰，展示感强",
    swatches: ["#9a3412", "#f97316", "#ffedd5"],
  },
  {
    id: "graphite-blue",
    name: "石墨蓝灰",
    description: "现代工作台风格，干净高对比",
    swatches: ["#334155", "#3b82f6", "#e2e8f0"],
  },
  {
    id: "lavender-slate",
    name: "雾紫云母",
    description: "轻创意风格，细腻但不过分跳脱",
    swatches: ["#6d28d9", "#a855f7", "#f3e8ff"],
  },
  {
    id: "rose-wine",
    name: "玫瑰绯红",
    description: "叙事导向风格，适合人文类内容",
    swatches: ["#9f1239", "#f43f5e", "#ffe4e6"],
  },
  {
    id: "teal-mint",
    name: "湖青薄荷",
    description: "现代轻盈风格，适合知识卡片和速览",
    swatches: ["#0f766e", "#14b8a6", "#ccfbf1"],
  },
  {
    id: "sand-ochre",
    name: "砂岩米金",
    description: "温暖克制，适合讲义排版与打印预览",
    swatches: ["#92400e", "#eab308", "#fef9c3"],
  },
  {
    id: "ink-sky",
    name: "晴空墨蓝",
    description: "信息密度高时更清晰，图表阅读友好",
    swatches: ["#0f172a", "#0ea5e9", "#e0f2fe"],
  },
] as const;

export type ThemePresetId = (typeof THEME_PRESETS)[number]["id"];
