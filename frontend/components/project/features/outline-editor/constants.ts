export const VISUAL_THEMES = [
  {
    id: "tech-blue",
    name: "科技蓝调",
    color: "#3b82f6",
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    id: "academic",
    name: "学术极简",
    color: "#6b7280",
    gradient: "from-gray-500 to-slate-600",
  },
  {
    id: "rainbow",
    name: "活力彩虹",
    color: "#ec4899",
    gradient: "from-pink-500 to-purple-500",
  },
  {
    id: "nature",
    name: "自然绿意",
    color: "#10b981",
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    id: "sunset",
    name: "日落暖橙",
    color: "#f97316",
    gradient: "from-orange-500 to-amber-500",
  },
  {
    id: "ocean",
    name: "深海蓝",
    color: "#0ea5e9",
    gradient: "from-sky-500 to-blue-600",
  },
];

export const IMAGE_STYLES = [
  { value: "flat", label: "扁平插画", icon: "FL" },
  { value: "3d", label: "3D 渲染", icon: "3D" },
  { value: "realistic", label: "写实照片", icon: "PH" },
  { value: "minimal", label: "极简线条", icon: "LN" },
  { value: "watercolor", label: "水彩风格", icon: "WC" },
];

export const DETAIL_LEVELS = [
  { value: "brief", label: "简略", desc: "核心要点", icon: "◽" },
  { value: "standard", label: "标准", desc: "适中展开", icon: "◾" },
  { value: "detailed", label: "详细", desc: "深度讲解", icon: "◼" },
] as const;

export const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9", description: "宽屏" },
  { value: "4:3", label: "4:3", description: "标准" },
  { value: "1:1", label: "1:1", description: "正方形" },
] as const;

export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.05 },
  },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 350, damping: 28 },
  },
};

export const slideCardVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 30 },
  },
  exit: {
    opacity: 0,
    x: 16,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};
