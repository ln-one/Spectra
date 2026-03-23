import {
  Brain,
  CircleHelp,
  Film,
  FileText,
  Gamepad2,
  GraduationCap,
  Presentation,
  Radar,
} from "lucide-react";
import { GENERATION_TOOLS, type GenerationTool } from "@/stores/projectStore";

export const TOOL_ICONS: Record<string, ElementType> = {
  ppt: Presentation,
  word: FileText,
  mindmap: Brain,
  outline: Gamepad2,
  quiz: CircleHelp,
  summary: GraduationCap,
  animation: Film,
  handout: Radar,
};

export const TOOL_LABELS: Record<string, string> = Object.fromEntries(
  GENERATION_TOOLS.map((tool) => [tool.type, tool.name])
) as Record<string, string>;

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
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

export type StudioTool = GenerationTool;
import type { ElementType } from "react";
