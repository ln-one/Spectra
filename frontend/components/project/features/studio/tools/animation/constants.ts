import type { WorkflowStepItem } from "@/components/project/shared";
import type { AnimationPlacementSlot, AnimationRhythm } from "./types";

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

export const ANIMATION_SLOT_OPTIONS: Array<{
  value: AnimationPlacementSlot;
  label: string;
}> = [
  { value: "bottom-right", label: "右下角" },
  { value: "right-panel", label: "右侧栏" },
  { value: "bottom-panel", label: "底部栏" },
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}

export function getRhythmLabel(value: AnimationRhythm): string {
  return (
    ANIMATION_RHYTHM_OPTIONS.find((item) => item.value === value)?.label ?? value
  );
}
