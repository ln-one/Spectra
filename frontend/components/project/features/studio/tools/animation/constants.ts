import type { WorkflowStepItem } from "@/components/project/shared";
import type {
  AnimationPlacementSlot,
  AnimationRhythm,
  AnimationStylePack,
  AnimationVisualType,
} from "./types";

export const ANIMATION_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "需求",
    description: "先描述你要演示的教学内容和最想突出的重点。",
    caption: "需求描述",
  },
  {
    id: "generate",
    title: "规格",
    description: "按动画规格生成独立 GIF，可选提前指定后续插入用的 PPT。",
    caption: "规格确认",
  },
  {
    id: "preview",
    title: "结果",
    description: "预览 GIF、执行 refine，并决定是否插入 PPT。",
    caption: "结果处理",
  },
];

export const ANIMATION_RHYTHM_OPTIONS: Array<{
  value: AnimationRhythm;
  label: string;
  description: string;
}> = [
  {
    value: "slow",
    label: "慢速讲解",
    description: "更适合解释关键步骤和因果关系。",
  },
  {
    value: "balanced",
    label: "均衡节奏",
    description: "默认方案，兼顾完整性和观看效率。",
  },
  {
    value: "fast",
    label: "快速演示",
    description: "更适合强调结论、流程或整体变化。",
  },
];

export const ANIMATION_STYLE_PACK_OPTIONS: Array<{
  value: AnimationStylePack;
  label: string;
  description: string;
}> = [
  {
    value: "teaching_ppt_cartoon",
    label: "卡通课堂",
    description: "高对比色块与圆角风格，适合低龄科普主题。",
  },
  {
    value: "teaching_ppt_fresh_green",
    label: "清新绿意",
    description: "浅绿与白底的清爽风格，适合自然科学和过程讲解。",
  },
  {
    value: "teaching_ppt_deep_blue",
    label: "科技深蓝",
    description: "蓝灰科技风格，适合网络、工程与系统类主题。",
  },
  {
    value: "teaching_ppt_warm_orange",
    label: "暖阳橙调",
    description: "暖色叙事风格，适合故事化讲解与概念导入。",
  },
  {
    value: "teaching_ppt_minimal_gray",
    label: "极简灰阶",
    description: "中性灰极简风格，适合结构化推导与重点突出。",
  },
];

export const ANIMATION_STYLE_PACK_SWATCHES: Record<
  AnimationStylePack,
  { background: string; accent: string; text: string }
> = {
  teaching_ppt_cartoon: {
    background: "#f3c453",
    accent: "#1f7a5c",
    text: "#17334e",
  },
  teaching_ppt_fresh_green: {
    background: "#f5f8f3",
    accent: "#16a34a",
    text: "#166534",
  },
  teaching_ppt_deep_blue: {
    background: "#dfeaf6",
    accent: "#2f6da5",
    text: "#0f2f4f",
  },
  teaching_ppt_warm_orange: {
    background: "#f7e9d8",
    accent: "#ce7a32",
    text: "#8d4c1f",
  },
  teaching_ppt_minimal_gray: {
    background: "#eef1f4",
    accent: "#5c7389",
    text: "#2f3f50",
  },
};

export const ANIMATION_SLOT_OPTIONS: Array<{
  value: AnimationPlacementSlot;
  label: string;
}> = [
  { value: "bottom-right", label: "右下角" },
  { value: "right-panel", label: "右侧栏" },
  { value: "bottom-panel", label: "底部栏" },
];

export const ANIMATION_VISUAL_TYPE_OPTIONS: Array<{
  value: AnimationVisualType;
  label: string;
  description: string;
}> = [
  {
    value: "structure_breakdown",
    label: "结构拆解",
    description: "适合分层结构、模块组成、部件关系。",
  },
  {
    value: "process_flow",
    label: "过程演示",
    description: "适合步骤推进、机制流程、形成过程。",
  },
  {
    value: "relationship_change",
    label: "关系变化",
    description: "适合变量变化、趋势拐点、因果关系。",
  },
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}

export function getRhythmLabel(value: AnimationRhythm): string {
  return (
    ANIMATION_RHYTHM_OPTIONS.find((item) => item.value === value)?.label ??
    value
  );
}

export function getVisualTypeLabel(value?: string | null): string {
  if (!value) return "自动判断";
  return (
    ANIMATION_VISUAL_TYPE_OPTIONS.find((item) => item.value === value)?.label ??
    value
  );
}

export function getStylePackLabel(value?: string | null): string {
  if (!value) return "卡通课堂";
  return (
    ANIMATION_STYLE_PACK_OPTIONS.find((item) => item.value === value)?.label ??
    value
  );
}
