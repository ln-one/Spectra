import type { WorkflowStepItem } from "@/components/project/shared";
import type {
  WordDifficultyLayer,
  WordDocumentVariant,
  WordGradeBand,
  WordTeachingModel,
} from "./types";

export const WORD_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "配置",
    description: "根据知识库推荐补齐文档目标、对象和输出要求。",
    caption: "准备参数",
  },
  {
    id: "generate",
    title: "生成",
    description: "确认配置后交给后端生成正式文档。",
    caption: "开始生成",
  },
  {
    id: "preview",
    title: "预览",
    description: "只查看后端真实预览结果，不再展示前端草稿。",
    caption: "实时预览",
  },
];

export const DOCUMENT_VARIANTS: Array<{
  value: WordDocumentVariant;
  label: string;
  helper: string;
}> = [
  {
    value: "layered_lesson_plan",
    label: "分层教案",
    helper: "适合 A/B/C 分层任务、课堂节奏和差异化指导。",
  },
  {
    value: "student_handout",
    label: "学生讲义",
    helper: "聚焦学生可直接阅读和打印使用的课堂材料。",
  },
  {
    value: "post_class_quiz",
    label: "课后测验",
    helper: "围绕课堂重点生成巩固题、变式题和讲评点。",
  },
  {
    value: "lab_guide",
    label: "实验指导书",
    helper: "强调实验步骤、风险提醒和复盘要求。",
  },
];

export const TEACHING_MODE_OPTIONS: Array<{
  value: WordTeachingModel;
  label: string;
}> = [
  { value: "inquiry", label: "探究式" },
  { value: "scaffolded", label: "脚手架式" },
  { value: "project_based", label: "项目式" },
];

export const GRADE_BAND_OPTIONS: Array<{
  value: WordGradeBand;
  label: string;
}> = [
  { value: "primary", label: "小学" },
  { value: "middle", label: "初中" },
  { value: "high", label: "高中" },
  { value: "college", label: "大学" },
];

export const DIFFICULTY_LAYER_OPTIONS: Array<{
  value: WordDifficultyLayer;
  label: string;
}> = [
  { value: "A", label: "A 层：基础巩固" },
  { value: "B", label: "B 层：综合应用" },
  { value: "C", label: "C 层：探究提升" },
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}

export function getVariantLabel(variant: WordDocumentVariant): string {
  return DOCUMENT_VARIANTS.find((item) => item.value === variant)?.label ?? "分层教案";
}

export function getTeachingModelLabel(value: WordTeachingModel): string {
  return TEACHING_MODE_OPTIONS.find((item) => item.value === value)?.label ?? "探究式";
}

export function getGradeBandLabel(value: WordGradeBand): string {
  return GRADE_BAND_OPTIONS.find((item) => item.value === value)?.label ?? "高中";
}
