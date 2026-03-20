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
  { primary: string; secondary: string; gradient: string; glow: string }
> = {
  ppt: {
    primary: "#f97316",
    secondary: "#fb923c",
    gradient: "from-orange-500 to-amber-500",
    glow: "rgba(249, 115, 22, 0.25)",
  },
  word: {
    primary: "#3b82f6",
    secondary: "#60a5fa",
    gradient: "from-blue-500 to-sky-500",
    glow: "rgba(59, 130, 246, 0.25)",
  },
  mindmap: {
    primary: "#14b8a6",
    secondary: "#2dd4bf",
    gradient: "from-teal-500 to-emerald-500",
    glow: "rgba(20, 184, 166, 0.25)",
  },
  outline: {
    primary: "#f43f5e",
    secondary: "#fb7185",
    gradient: "from-rose-500 to-pink-500",
    glow: "rgba(244, 63, 94, 0.25)",
  },
  quiz: {
    primary: "#8b5cf6",
    secondary: "#a78bfa",
    gradient: "from-violet-500 to-indigo-500",
    glow: "rgba(139, 92, 246, 0.25)",
  },
  summary: {
    primary: "#0ea5e9",
    secondary: "#38bdf8",
    gradient: "from-sky-500 to-cyan-500",
    glow: "rgba(14, 165, 233, 0.25)",
  },
  animation: {
    primary: "#22c55e",
    secondary: "#4ade80",
    gradient: "from-green-500 to-emerald-500",
    glow: "rgba(34, 197, 94, 0.25)",
  },
  handout: {
    primary: "#eab308",
    secondary: "#facc15",
    gradient: "from-yellow-500 to-amber-500",
    glow: "rgba(234, 179, 8, 0.25)",
  },
};

export const ICON_LAYOUT_TRANSITION = {
  type: "tween" as const,
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

export type StudioTool = GenerationTool;
import type { ElementType } from "react";
