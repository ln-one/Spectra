import type { WorkflowStepItem } from "@/components/project/shared";
import type { QuizDifficulty, QuizQuestionType } from "./types";

export const QUIZ_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "配置",
    description: "先设定考察范围和题目风格。",
    caption: "准备参数",
  },
  {
    id: "generate",
    title: "生成",
    description: "确认参数并生成随堂小测。",
    caption: "开始生成",
  },
  {
    id: "preview",
    title: "预览",
    description: "在面板里一题一题试做并看解析。",
    caption: "闪卡试玩",
  },
];

export const DIFFICULTY_OPTIONS: Array<{
  value: QuizDifficulty;
  label: string;
  description: string;
}> = [
  { value: "easy", label: "基础巩固", description: "先检查基本概念是否掌握。" },
  { value: "medium", label: "课堂标准", description: "兼顾概念理解和应用判断。" },
  { value: "hard", label: "易错强化", description: "重点考察辨析和迁移能力。" },
];

export const QUESTION_TYPE_OPTIONS: Array<{
  value: QuizQuestionType;
  label: string;
}> = [
  { value: "single", label: "单选题" },
  { value: "multiple", label: "多选题" },
  { value: "judge", label: "判断题" },
];

export const STYLE_TAGS = [
  "加入幽默干扰项",
  "优先考易错点",
  "题干更生活化",
  "减少计算量",
  "强调课堂互动",
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}

export function getDifficultyLabel(value: QuizDifficulty): string {
  return (
    DIFFICULTY_OPTIONS.find((item) => item.value === value)?.label ?? "课堂标准"
  );
}

export function getQuestionTypeLabel(value: QuizQuestionType): string {
  return (
    QUESTION_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? "单选题"
  );
}
