import type { WorkflowStepItem } from "@/components/project/shared";
import type { SpeechTone } from "./types";

export const SPEAKER_NOTES_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "配置",
    description: "先选择要配套的课件，再设置说课风格。",
    caption: "准备参数",
  },
  {
    id: "generate",
    title: "生成",
    description: "确认参数后生成逐页讲稿。",
    caption: "开始生成",
  },
  {
    id: "preview",
    title: "预览",
    description: "在面板里用提词器视图查看并微调。",
    caption: "提词器模式",
  },
];

export const SPEECH_TONE_OPTIONS: Array<{
  value: SpeechTone;
  label: string;
  description: string;
}> = [
  {
    value: "calm",
    label: "温和讲解",
    description: "语速平稳，适合知识梳理和推导。",
  },
  {
    value: "energetic",
    label: "课堂带动",
    description: "更有节奏感，适合互动活跃场景。",
  },
  {
    value: "professional",
    label: "正式汇报",
    description: "表达更严谨，适合公开课和说课评审。",
  },
];

export const ACTION_HINT_STYLE = "bg-violet-100 text-violet-700";

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}

export function getToneLabel(value: SpeechTone): string {
  return (
    SPEECH_TONE_OPTIONS.find((item) => item.value === value)?.label ??
    "温和讲解"
  );
}
