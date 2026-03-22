import type { WorkflowStepItem } from "@/components/project/shared";
import type { AnimationSceneOption } from "./types";

export const ANIMATION_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "配置",
    description: "先选择动画场景并设置参数。",
    caption: "准备参数",
  },
  {
    id: "generate",
    title: "生成",
    description: "确认参数后生成演示动画。",
    caption: "开始生成",
  },
  {
    id: "preview",
    title: "预览",
    description: "在面板里查看代码区和渲染区效果。",
    caption: "查看与微调",
  },
];

export const ANIMATION_SCENE_OPTIONS: AnimationSceneOption[] = [
  {
    value: "particle_orbit",
    label: "粒子公转演示",
    description: "适合讲解轨道、速度和路径变化。",
  },
  {
    value: "bubble_sort",
    label: "冒泡排序动画",
    description: "适合讲解每轮比较和交换过程。",
  },
  {
    value: "magnetic_field",
    label: "磁感线变化",
    description: "适合演示方向、强度和场分布。",
  },
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}
