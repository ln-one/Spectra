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
    description: "先选文档类型，再补充教学目标和适用对象。",
    caption: "准备参数",
  },
  {
    id: "generate",
    title: "生成",
    description: "确认参数后开始生成文档。",
    caption: "开始生成",
  },
  {
    id: "preview",
    title: "预览",
    description: "在面板内阅读文档，并继续微调。",
    caption: "查看结果",
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
    helper: "按 A/B/C 层级安排课堂任务。",
  },
  {
    value: "student_handout",
    label: "学生讲义",
    helper: "生成可直接发给学生的课堂讲义。",
  },
  {
    value: "post_class_quiz",
    label: "课后测验题",
    helper: "课后巩固与拓展练习。",
  },
  {
    value: "lab_guide",
    label: "实验指导书",
    helper: "强调步骤、注意事项与复盘。",
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

export const GRADE_BAND_OPTIONS: Array<{ value: WordGradeBand; label: string }> = [
  { value: "primary", label: "小学" },
  { value: "middle", label: "初中" },
  { value: "high", label: "高中" },
  { value: "college", label: "大学" },
];

export const DIFFICULTY_LAYER_OPTIONS: Array<{
  value: WordDifficultyLayer;
  label: string;
}> = [
  { value: "A", label: "A 层（基础巩固）" },
  { value: "B", label: "B 层（综合应用）" },
  { value: "C", label: "C 层（探究提升）" },
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}

export function getVariantLabel(variant: WordDocumentVariant): string {
  return (
    DOCUMENT_VARIANTS.find((item) => item.value === variant)?.label ?? "分层教案"
  );
}

export function getTeachingModelLabel(value: WordTeachingModel): string {
  return (
    TEACHING_MODE_OPTIONS.find((item) => item.value === value)?.label ?? "探究式"
  );
}

export function getGradeBandLabel(value: WordGradeBand): string {
  return GRADE_BAND_OPTIONS.find((item) => item.value === value)?.label ?? "高中";
}

