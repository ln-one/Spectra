"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LockKeyhole, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GENERATION_TOOLS } from "@/stores/projectStore";
import {
  ICON_LAYOUT_TRANSITION,
  LOCKED_STUDIO_TOOL_TYPES,
  TOOL_COLORS,
  TOOL_ICONS,
  type StudioTool,
} from "../constants";
import type { StudioToolKey } from "../tools";

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
  const [lockedTool, setLockedTool] = useState<StudioTool | null>(null);

  return (
    <>
      <motion.div
        className="grid min-w-0 grid-cols-1 gap-2 pb-2 [@media(min-width:260px)]:grid-cols-2"
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        {GENERATION_TOOLS.map((tool) => {
          const Icon = TOOL_ICONS[tool.id] || Sparkles;
          const color = TOOL_COLORS[tool.id] || TOOL_COLORS.ppt;
          const isHovered = hoveredToolId === tool.id;
          const isLocked = LOCKED_STUDIO_TOOL_TYPES.has(
            tool.type as StudioToolKey
          );

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
              onClick={() => {
                if (isLocked) {
                  setLockedTool(tool);
                  return;
                }
                onToolClick(tool);
              }}
              onMouseEnter={() => !isExpanded && onHoveredToolIdChange(tool.id)}
              onMouseLeave={() => onHoveredToolIdChange(null)}
              className={cn(
                "project-tool-card group relative flex h-auto min-h-[60px] w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-[var(--project-chip-radius)] border border-[var(--project-border)] bg-[var(--project-surface-muted)] px-1 py-1.5 backdrop-blur-sm",
                "cursor-pointer transition-shadow duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--project-border-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--project-surface)]",
                isLocked && "border-dashed"
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
              {isLocked ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 rounded-full border border-amber-200 bg-amber-50/95 p-1 text-amber-700 shadow-sm"
                >
                  <LockKeyhole className="h-3 w-3" />
                </span>
              ) : null}
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
      <AnimatePresence>
        {lockedTool ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={`${lockedTool.name}权限提示`}
            onClick={() => setLockedTool(null)}
          >
            <motion.div
              className="relative w-full max-w-[340px] overflow-hidden rounded-[28px] border border-amber-200 bg-[var(--project-surface)] p-5 text-center shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
              initial={{ y: 18, scale: 0.96, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 12, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-amber-100/80 to-transparent" />
              <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 shadow-inner">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <h3 className="relative mt-3 text-base font-semibold text-[var(--project-text-primary)]">
                {lockedTool.name}暂未开通
              </h3>
              <p className="relative mt-2 text-sm leading-6 text-[var(--project-text-secondary)]">
                当前账号没有开通会员权限，请联系管理员
              </p>
              <button
                type="button"
                className="relative mt-5 h-9 rounded-full bg-slate-900 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--project-surface)]"
                onClick={() => setLockedTool(null)}
              >
                我知道了
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
