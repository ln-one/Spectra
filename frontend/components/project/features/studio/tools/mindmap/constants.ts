import type { WorkflowStepItem } from "@/components/project/shared";
import type { MindmapFocus, MindmapOption } from "./types";

export const MINDMAP_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "配置",
    description: "先确定主题、层级和讲解方向。",
    caption: "准备内容",
  },
  {
    id: "generate",
    title: "生成",
    description: "确认参数后生成导图。",
    caption: "开始生成",
  },
  {
    id: "preview",
    title: "预览",
    description: "在面板里查看导图并继续细化节点。",
    caption: "查看结果",
  },
];

export const DEPTH_OPTIONS: MindmapOption[] = [
  { value: "2", label: "2 层（快速总览）" },
  { value: "3", label: "3 层（课堂常用）" },
  { value: "4", label: "4 层（深入讲解）" },
];

export const FOCUS_OPTIONS: MindmapOption<MindmapFocus>[] = [
  { value: "concept", label: "概念关系" },
  { value: "process", label: "步骤流程" },
  { value: "comparison", label: "对比辨析" },
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}
