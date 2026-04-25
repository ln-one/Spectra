import type { WorkflowStepItem } from "@/components/project/shared";
import type { LessonPlanDetailLevel, LessonPlanGradeBand } from "./types";

export const WORD_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "配置",
    description: "补齐课题、目标和课堂要求，准备生成教案。",
    caption: "准备教案",
  },
  {
    id: "generate",
    title: "生成",
    description: "确认配置后，根据当前来源生成教案。",
    caption: "开始生成",
  },
  {
    id: "preview",
    title: "工作台",
    description: "查看、编辑、沉淀和导出教案。",
    caption: "继续打磨",
  },
];

export const DETAIL_LEVEL_OPTIONS: Array<{
  value: LessonPlanDetailLevel;
  label: string;
  helper: string;
}> = [
  {
    value: "brief",
    label: "简版",
    helper: "适合快速备课，输出精炼的目标、过程与作业。",
  },
  {
    value: "standard",
    label: "标准",
    helper: "默认推荐，平衡课堂流程、任务和检测。",
  },
  {
    value: "detailed",
    label: "详细",
    helper: "适合公开课或精细备课，展开更多步骤与评价任务。",
  },
];

export const GRADE_BAND_OPTIONS: Array<{
  value: LessonPlanGradeBand;
  label: string;
}> = [
  { value: "primary", label: "小学" },
  { value: "middle", label: "初中" },
  { value: "high", label: "高中" },
  { value: "college", label: "大学" },
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}

export function getDetailLevelLabel(value: LessonPlanDetailLevel): string {
  return (
    DETAIL_LEVEL_OPTIONS.find((item) => item.value === value)?.label ?? "标准"
  );
}

export function getGradeBandLabel(value: LessonPlanGradeBand): string {
  return (
    GRADE_BAND_OPTIONS.find((item) => item.value === value)?.label ?? "高中"
  );
}
