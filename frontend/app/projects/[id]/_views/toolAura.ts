import type { CSSProperties } from "react";
import type { ExpandedTool } from "@/stores/projectStore";

export type ProjectActiveTool = Exclude<ExpandedTool, null>;

type ToolAuraAttrs = {
  "data-project-tool": ProjectActiveTool | "none";
  "data-project-tool-active": "true" | "false";
};

const TOOL_AURA_TOKENS: Record<
  ProjectActiveTool,
  { accent: string; glow: string }
> = {
  ppt: { accent: "#f97316", glow: "rgba(249, 115, 22, 0.34)" },
  word: { accent: "#3b82f6", glow: "rgba(59, 130, 246, 0.34)" },
  mindmap: { accent: "#14b8a6", glow: "rgba(20, 184, 166, 0.34)" },
  outline: { accent: "#f43f5e", glow: "rgba(244, 63, 94, 0.34)" },
  quiz: { accent: "#8b5cf6", glow: "rgba(139, 92, 246, 0.34)" },
  summary: { accent: "#0ea5e9", glow: "rgba(14, 165, 233, 0.34)" },
  animation: { accent: "#22c55e", glow: "rgba(34, 197, 94, 0.34)" },
  handout: { accent: "#eab308", glow: "rgba(234, 179, 8, 0.34)" },
};

const TOOL_AURA_INACTIVE_STYLE: CSSProperties = {
  "--project-tool-aura-bg": "none",
  "--project-tool-aura-opacity": "0",
} as CSSProperties;

function isToolAuraActive(
  expandedTool: ExpandedTool,
  isExpanded: boolean
): expandedTool is ProjectActiveTool {
  return isExpanded && expandedTool !== null;
}

export function getProjectToolAuraAttributes(
  expandedTool: ExpandedTool,
  isExpanded: boolean
): ToolAuraAttrs {
  if (!isToolAuraActive(expandedTool, isExpanded)) {
    return {
      "data-project-tool": "none",
      "data-project-tool-active": "false",
    };
  }

  return {
    "data-project-tool": expandedTool,
    "data-project-tool-active": "true",
  };
}

export function getProjectToolAuraStyle(
  expandedTool: ExpandedTool,
  isExpanded: boolean
): CSSProperties {
  if (!isToolAuraActive(expandedTool, isExpanded)) {
    return TOOL_AURA_INACTIVE_STYLE;
  }

  const tokens = TOOL_AURA_TOKENS[expandedTool];
  return {
    "--project-tool-aura-bg": `radial-gradient(circle at 12% 14%, color-mix(in srgb, ${tokens.glow} 62%, transparent), transparent 50%), radial-gradient(circle at 86% 8%, color-mix(in srgb, ${tokens.accent} 26%, transparent), transparent 56%), radial-gradient(circle at 46% 88%, color-mix(in srgb, ${tokens.accent} 18%, transparent), transparent 60%)`,
    "--project-tool-aura-opacity": "0.76",
  } as CSSProperties;
}
