"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ICON_LAYOUT_TRANSITION, TOOL_LABELS } from "../../constants";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";

interface StudioPanelHeaderProps {
  isExpanded: boolean;
  expandedTool: GenerationToolType | null;
  onClose: () => void;
  currentIcon: LucideIcon;
  currentColor: { primary: string; glow: string };
}

export function StudioPanelHeader({
  isExpanded,
  expandedTool,
  onClose,
  currentIcon: CurrentIcon,
  currentColor,
}: StudioPanelHeaderProps) {
  return (
    <CardHeader
      className="project-panel-header relative flex flex-row items-center justify-between px-4 py-0 shrink-0 space-y-0"
      style={{ height: "52px" }}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <LayoutGroup>
          <motion.div
            className="flex min-w-0 flex-col justify-center"
            layout
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <CardTitle className="truncate text-sm font-semibold leading-tight">
              <motion.span
                className="block truncate"
                layout
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                {isExpanded ? TOOL_LABELS[expandedTool || "ppt"] : "备课工坊"}
              </motion.span>
            </CardTitle>
            <CardDescription className="truncate text-xs leading-tight text-[var(--project-text-muted)]">
              <motion.span
                className="block truncate"
                layout
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                {isExpanded ? "配置生成参数" : "AI 生成工具"}
              </motion.span>
            </CardDescription>
          </motion.div>
        </LayoutGroup>
      </div>

      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="shrink-0 text-xs text-[var(--project-text-muted)] hover:text-[var(--project-text-primary)]"
            >
              关闭
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {isExpanded && expandedTool ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
          <motion.div
            layoutId={`icon-${expandedTool}`}
            layout="position"
            className={cn(
              "project-tool-icon-shell flex items-center justify-center rounded-[var(--project-chip-radius)] border border-white/40 backdrop-blur-md transform-gpu will-change-transform [backface-visibility:hidden]"
            )}
            style={{
              width: 40,
              height: 40,
              background: `linear-gradient(135deg, ${currentColor.glow}, transparent)`,
              boxShadow: `0 8px 22px ${currentColor.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.6)`,
            }}
            transition={{ layout: ICON_LAYOUT_TRANSITION }}
          >
            <CurrentIcon
              className="h-4.5 w-4.5"
              style={{ color: currentColor.primary }}
            />
          </motion.div>
        </div>
      ) : null}
    </CardHeader>
  );
}
