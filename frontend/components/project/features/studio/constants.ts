import {
  ClipboardCheck,
  Clapperboard,
  FileText,
  Gamepad2,
  MonitorPlay,
  Network,
  Projector,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GENERATION_TOOLS } from "@/stores/projectStore";
import type { StudioToolKey, ToolDisplayModel } from "./tools/types";
import { STUDIO_CARD_BY_TOOL } from "./panel/constants";

export const LOCKED_STUDIO_TOOL_TYPES = new Set<StudioToolKey>([
  "summary",
  "handout",
]);

export const TOOL_ICONS: Record<string, LucideIcon> = {
  ppt: MonitorPlay,
  word: FileText,
  mindmap: Network,
  outline: Gamepad2,
  quiz: ClipboardCheck,
  summary: ScrollText,
  animation: Clapperboard,
  handout: Projector,
  game: Gamepad2,
};

export const TOOL_LABELS: Record<string, string> = Object.fromEntries(
  GENERATION_TOOLS.map((tool) => [tool.type, tool.name])
) as Record<string, string>;

export const TOOL_DISPLAY_MODELS: Record<StudioToolKey, ToolDisplayModel> = {
  word: {
    toolId: "word",
    productTitle: "教案",
    productDescription: "围绕统一 Sources 生成、编辑并沉淀教案成果。",
    studioCardId: STUDIO_CARD_BY_TOOL.word,
    actionLabels: {
      preview: "执行预检",
      loadSources: "刷新来源",
      execute: "生成教案",
      refine: "打开对话微调",
    },
    sourceBinding: {
      required: "可选：选中课件后会优先参考课件生成教案。",
      optional: "可选：右侧资料来源会一起参与教案生成。",
      empty: "没有课件也可以先填写课题直接生成。",
    },
  },
  mindmap: {
    toolId: "mindmap",
    productTitle: TOOL_LABELS.mindmap,
    productDescription: "基于真实后端导图成果继续浏览、选择与结构化增补。",
    studioCardId: STUDIO_CARD_BY_TOOL.mindmap,
    actionLabels: {
      preview: "执行预检",
      loadSources: "刷新来源",
      execute: "生成导图",
      refine: "打开对话微调",
    },
    sourceBinding: {
      required: "必选：请先绑定一个来源成果。",
      optional: "可选：绑定已有成果后，导图结构会更贴近当前上下文。",
      empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
    },
  },
  outline: {
    toolId: "outline",
    productTitle: TOOL_LABELS.outline,
    productDescription: "接收真实后端 HTML 游戏结果，统一管理预检、执行与微调入口。",
    studioCardId: STUDIO_CARD_BY_TOOL.outline,
    actionLabels: {
      preview: "执行预检",
      loadSources: "刷新来源",
      execute: "生成互动游戏",
      refine: "打开对话微调",
    },
    sourceBinding: {
      required: "必选：请先绑定一个来源成果。",
      optional: "可选：绑定已有成果后，游戏内容会更贴近当前项目上下文。",
      empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
    },
  },
  quiz: {
    toolId: "quiz",
    productTitle: TOOL_LABELS.quiz,
    productDescription: "把真实后端小测结果放进统一工作台，收敛来源、状态和执行语义。",
    studioCardId: STUDIO_CARD_BY_TOOL.quiz,
    actionLabels: {
      preview: "执行预检",
      loadSources: "刷新来源",
      execute: "生成随堂小测",
      refine: "打开对话微调",
    },
    sourceBinding: {
      required: "必选：请先绑定一个来源成果。",
      optional: "可选：绑定已有成果后，小测题目会更贴近当前项目上下文。",
      empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
    },
  },
  summary: {
    toolId: "summary",
    productTitle: TOOL_LABELS.summary,
    productDescription: "围绕真实说课讲稿成果统一提词器预览、来源绑定和微调入口。",
    studioCardId: STUDIO_CARD_BY_TOOL.summary,
    actionLabels: {
      preview: "执行预检",
      loadSources: "刷新来源",
      execute: "生成说课讲稿",
      refine: "打开对话微调",
    },
    sourceBinding: {
      required: "必选：请绑定一个 PPT 成果作为说课来源。",
      optional: "可选：绑定已有成果后，说课内容会更贴近当前项目上下文。",
      empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
    },
  },
  animation: {
    toolId: "animation",
    productTitle: TOOL_LABELS.animation,
    productDescription: "在统一工作台中管理真实动画成果、版位建议与结果 refine。",
    studioCardId: STUDIO_CARD_BY_TOOL.animation,
    actionLabels: {
      preview: "执行预检",
      loadSources: "刷新来源",
      execute: "生成演示动画",
      refine: "生成新版动画",
    },
    sourceBinding: {
      required: "必选：请先绑定一个来源成果。",
      optional: "可选：绑定已有成果后，动画内容会更贴近当前项目上下文。",
      empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
    },
  },
  handout: {
    toolId: "handout",
    productTitle: TOOL_LABELS.handout,
    productDescription: "围绕真实课堂预演结果统一展示当前轮焦点、追问反馈和二次交互入口。",
    studioCardId: STUDIO_CARD_BY_TOOL.handout,
    actionLabels: {
      preview: "执行预检",
      loadSources: "刷新来源",
      execute: "开始课堂预演",
      refine: "调整追问方向",
    },
    sourceBinding: {
      required: "必选：请先绑定一个来源成果。",
      optional: "可选：绑定已有成果后，预演提问会更贴近当前项目上下文。",
      empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
    },
  },
};

export function getToolDisplayModel(toolId: StudioToolKey): ToolDisplayModel {
  return TOOL_DISPLAY_MODELS[toolId];
}

export const TOOL_COLORS: Record<
  string,
  {
    primary: string;
    secondary: string;
    gradient: string;
    glow: string;
    soft: string;
  }
> = {
  ppt: {
    primary: "#f97316",
    secondary: "#fb923c",
    gradient: "from-[#ff7e2e] via-[#f97316] to-[#ea580c]",
    glow: "rgba(249, 115, 22, 0.15)",
    soft: "rgba(249, 115, 22, 0.05)",
  },
  word: {
    primary: "#3b82f6",
    secondary: "#60a5fa",
    gradient: "from-[#4facfe] via-[#3b82f6] to-[#0061ff]",
    glow: "rgba(59, 130, 246, 0.15)",
    soft: "rgba(59, 130, 246, 0.05)",
  },
  mindmap: {
    primary: "#14b8a6",
    secondary: "#2dd4bf",
    gradient: "from-[#2af598] via-[#14b8a6] to-[#009efd]",
    glow: "rgba(20, 184, 166, 0.15)",
    soft: "rgba(20, 184, 166, 0.05)",
  },
  outline: {
    primary: "#f43f5e",
    secondary: "#fb7185",
    gradient: "from-[#ff5858] via-[#f43f5e] to-[#f093fb]",
    glow: "rgba(244, 63, 94, 0.15)",
    soft: "rgba(244, 63, 94, 0.05)",
  },
  quiz: {
    primary: "#8b5cf6",
    secondary: "#a78bfa",
    gradient: "from-[#a18cd1] via-[#8b5cf6] to-[#fbc2eb]",
    glow: "rgba(139, 92, 246, 0.15)",
    soft: "rgba(139, 92, 246, 0.05)",
  },
  summary: {
    primary: "#0ea5e9",
    secondary: "#38bdf8",
    gradient: "from-[#22c1c3] via-[#0ea5e9] to-[#2dd4bf]",
    glow: "rgba(14, 165, 233, 0.15)",
    soft: "rgba(14, 165, 233, 0.05)",
  },
  animation: {
    primary: "#22c55e",
    secondary: "#4ade80",
    gradient: "from-[#11998e] via-[#22c55e] to-[#38ef7d]",
    glow: "rgba(34, 197, 94, 0.15)",
    soft: "rgba(34, 197, 94, 0.05)",
  },
  handout: {
    primary: "#eab308",
    secondary: "#facc15",
    gradient: "from-[#f6d365] via-[#eab308] to-[#fda085]",
    glow: "rgba(234, 179, 8, 0.15)",
    soft: "rgba(234, 179, 8, 0.05)",
  },
  game: {
    primary: "#ec4899",
    secondary: "#f472b6",
    gradient: "from-[#ff9a9e] via-[#ec4899] to-[#fad0c4]",
    glow: "rgba(236, 72, 153, 0.15)",
    soft: "rgba(236, 72, 153, 0.05)",
  },
};

export const ICON_LAYOUT_TRANSITION = {
  type: "tween" as const,
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

export type StudioTool = GenerationTool;
