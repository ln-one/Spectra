export const PAGE_PRESETS = [8, 12, 16, 20, 24];

export const VISUAL_POLICIES = [
  { id: "auto", name: "自动图片添加" },
  { id: "media_required", name: "强制图片添加" },
  { id: "basic_graphics_only", name: "仅基础图形" },
] as const;

export const OUTLINE_STYLES = [
  {
    id: "structured",
    name: "结构清晰型",
    desc: "总-分-总，强调逻辑层次",
    tone: "严谨、清晰、循序渐进",
  },
  {
    id: "story",
    name: "叙事引导型",
    desc: "用情境和故事引入知识点",
    tone: "生动、有代入感、循序渐进",
  },
  {
    id: "problem",
    name: "问题驱动型",
    desc: "以问题链推进学习",
    tone: "启发式、探究式、重思考",
  },
  {
    id: "workshop",
    name: "实操工作坊型",
    desc: "案例 + 练习 + 复盘",
    tone: "实战导向、步骤明确、可落地",
  },
] as const;

export const VISUAL_STYLES = [
  {
    id: "free",
    name: "自由风格",
    coverImage: "/images/styles/free.svg",
  },
  {
    id: "academic",
    name: "学术",
    coverImage: "/images/styles/academic.svg",
  },
  {
    id: "minimal",
    name: "极简",
    coverImage: "/images/styles/minimal.svg",
  },
  {
    id: "professional",
    name: "专业",
    coverImage: "/images/styles/professional.svg",
  },
  {
    id: "botanical",
    name: "植境",
    coverImage: "/images/styles/botanical.svg",
  },
  {
    id: "wabi",
    name: "侘寂",
    coverImage: "/images/styles/wabi.svg",
  },
  {
    id: "memphis",
    name: "孟菲斯",
    coverImage: "/images/styles/memphis.svg",
  },
  {
    id: "constructivism",
    name: "构成主义",
    coverImage: "/images/styles/constructivism.svg",
  },
  {
    id: "brutalist",
    name: "新粗野主义",
    coverImage: "/images/styles/brutalist.svg",
  },
  {
    id: "8bit",
    name: "8-bit",
    coverImage: "/images/styles/8bit.svg",
  },
  {
    id: "electro",
    name: "流行电子",
    coverImage: "/images/styles/electro.svg",
  },
  {
    id: "geometric",
    name: "几何粗体",
    coverImage: "/images/styles/geometric.svg",
  },
  {
    id: "morandi",
    name: "莫兰迪",
    coverImage: "/images/styles/morandi.svg",
  },
  {
    id: "nordic",
    name: "北欧研究",
    coverImage: "/images/styles/nordic.svg",
  },
  {
    id: "fluid",
    name: "感性流动",
    coverImage: "/images/styles/fluid.svg",
  },
  {
    id: "cinema",
    name: "影院极简",
    coverImage: "/images/styles/cinema.svg",
  },
  {
    id: "coolblue",
    name: "理性蓝调",
    coverImage: "/images/styles/coolblue.svg",
  },
  {
    id: "warmvc",
    name: "暖调创投",
    coverImage: "/images/styles/warmvc.svg",
  },
  {
    id: "modernacademic",
    name: "当代学术",
    coverImage: "/images/styles/modernacademic.svg",
  },
  {
    id: "curatorial",
    name: "学术策展",
    coverImage: "/images/styles/curatorial.svg",
  },
] as const;

export const TEMPLATE_CARDS = [
  {
    id: "tpl-1",
    name: "海洋保护行动",
    coverImage: "/images/templates/tpl-1.svg",
  },
  {
    id: "tpl-2",
    name: "文创品牌炼金术",
    coverImage: "/images/templates/tpl-2.svg",
  },
  {
    id: "tpl-3",
    name: "潮流玩具品牌商业计划",
    coverImage: "/images/templates/tpl-3.svg",
  },
  {
    id: "tpl-4",
    name: "大数据驱动的疾病监测系统",
    coverImage: "/images/templates/tpl-4.svg",
  },
  {
    id: "tpl-5",
    name: "Luminara 2025品牌年度汇报",
    coverImage: "/images/templates/tpl-5.svg",
  },
  {
    id: "tpl-6",
    name: "童梦奇航亲子冒险企划",
    coverImage: "/images/templates/tpl-6.svg",
  },
  {
    id: "tpl-7",
    name: "艺术品牌策划全景解析",
    coverImage: "/images/templates/tpl-7.svg",
  },
  {
    id: "tpl-8",
    name: "非遗文化传承研究",
    coverImage: "/images/templates/tpl-8.svg",
  },
] as const;

export const LAYOUT_MODES = [
  { id: "smart", name: "智能布局", outlineStyle: "structured" },
  { id: "classic", name: "经典模板", outlineStyle: "story" },
] as const;

export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 28 },
  },
};
