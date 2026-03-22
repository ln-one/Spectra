import type { WorkflowStepItem } from "@/components/project/shared";
import type { GameModeOption } from "./types";

export const GAME_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "配置",
    description: "先说清楚你想练什么，再选游戏类型。",
    caption: "准备玩法",
  },
  {
    id: "generate",
    title: "生成",
    description: "确认规则并生成可玩的小游戏。",
    caption: "开始生成",
  },
  {
    id: "preview",
    title: "预览",
    description: "在当前面板直接试玩，并继续微调。",
    caption: "试玩与调整",
  },
];

export const GAME_MODE_OPTIONS: GameModeOption[] = [
  {
    value: "timeline_sort",
    label: "时间轴排序",
    description: "把关键事件按正确顺序拖拽排序。",
  },
  {
    value: "concept_match",
    label: "概念连线",
    description: "把概念和解释正确连起来。",
  },
  {
    value: "logic_puzzle",
    label: "推理解谜",
    description: "根据线索做判断并闯关。",
  },
];

export const GAME_IDEA_TAGS = [
  "30秒倒计时",
  "两人对战",
  "错题回放",
  "闯关奖励",
  "课堂抢答",
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}
