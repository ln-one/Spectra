export const PAGE_PRESETS = [8, 12, 16, 20, 24];

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

export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
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
