"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GENERATION_TOOLS } from "@/stores/projectStore";
import {
  ICON_LAYOUT_TRANSITION,
  TOOL_COLORS,
  TOOL_ICONS,
  type StudioTool,
} from "../constants";

interface ToolGridProps {
  isExpanded: boolean;
  hoveredToolId: string | null;
  onHoveredToolIdChange: (toolId: string | null) => void;
  onToolClick: (tool: StudioTool) => void;
}

export function ToolGrid({
  isExpanded,
  hoveredToolId,
  onHoveredToolIdChange,
  onToolClick,
}: ToolGridProps) {
  return (
    <motion.div
      className="grid min-w-0 grid-cols-1 gap-2 pb-2 [@media(min-width:260px)]:grid-cols-2"
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      {GENERATION_TOOLS.map((tool) => {
        const Icon = TOOL_ICONS[tool.id] || Sparkles;
        const color = TOOL_COLORS[tool.id] || TOOL_COLORS.ppt;
        const isHovered = hoveredToolId === tool.id;

        return (
          <motion.button
            key={tool.id}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{
              scale: isHovered && !isExpanded ? 1.02 : 1,
              opacity: 1,
              y: isHovered && !isExpanded ? -2 : 0,
            }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onMouseDown={(event) => {
              // Keep click interactions from leaving browser default focus outline.
              event.preventDefault();
            }}
            onClick={(event) => {
              onToolClick(tool);
              event.currentTarget.blur();
            }}
            onMouseEnter={() => !isExpanded && onHoveredToolIdChange(tool.id)}
            onMouseLeave={() => onHoveredToolIdChange(null)}
            className={cn(
              "project-tool-card group relative flex h-auto min-h-[60px] w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-[var(--project-chip-radius)] border border-[var(--project-border)] bg-[var(--project-surface-muted)] px-1 py-1.5 backdrop-blur-sm",
              "cursor-pointer outline-none transition-shadow duration-200 ease-out focus-visible:outline-none focus-visible:ring-0"
            )}
            style={{
              boxShadow:
                isHovered && !isExpanded
                  ? "0 8px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)"
                  : "0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
              borderColor:
                isHovered && !isExpanded
                  ? "var(--project-border-strong)"
                  : "var(--project-border)",
            }}
          >
            <motion.div
              layoutId={`icon-${tool.id}`}
              layout="position"
              className={cn(
                "project-tool-icon mb-0.5 flex items-center justify-center rounded-[var(--project-chip-radius)] border border-white/40 backdrop-blur-md transform-gpu will-change-transform [backface-visibility:hidden]"
              )}
              style={{
                width: 40,
                height: 40,
                background: `linear-gradient(135deg, ${color.glow}, transparent)`,
                boxShadow: `0 8px 22px ${color.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
              }}
              transition={{ layout: ICON_LAYOUT_TRANSITION }}
            >
              <Icon className="h-4.5 w-4.5" style={{ color: color.primary }} />
            </motion.div>
            <span className="w-full min-w-0 truncate px-0.5 text-center text-[13px] font-medium text-[var(--project-text-primary)]">
              {tool.name}
            </span>
            <motion.div
              className="project-tool-card-glow pointer-events-none absolute inset-0 rounded-[var(--project-chip-radius)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              style={{
                background: `radial-gradient(circle at center, ${color.glow}, transparent 70%)`,
              }}
            />
          </motion.button>
        );
      })}
    </motion.div>
  );
}
