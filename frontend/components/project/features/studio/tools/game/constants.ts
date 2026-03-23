import type { WorkflowStepItem } from "@/components/project/shared";

export const GAME_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "配置",
    description: "让知识库先推荐适合的游戏主题和交互方向。",
    caption: "明确意图",
  },
  {
    id: "generate",
    title: "生成",
    description: "把目标交给后端模型生成真实 HTML 游戏。",
    caption: "开始生成",
  },
  {
    id: "preview",
    title: "预览",
    description: "只展示后端真实游戏，不再渲染前端假沙箱。",
    caption: "实时试玩",
  },
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}
