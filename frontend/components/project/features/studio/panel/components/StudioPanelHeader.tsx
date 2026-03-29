"use client";

import { AnimatePresence, motion } from "framer-motion";
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

function renderMorphChars(text: string, kind: "title" | "desc") {
  const chars = Array.from(text);
  const charClass =
    kind === "title"
      ? "inline-block align-baseline"
      : "inline-block align-baseline";
  const enterY = kind === "title" ? 6 : 4;
  const exitY = kind === "title" ? -6 : -4;
  const duration = kind === "title" ? 0.36 : 0.32;
  const stagger = kind === "title" ? 0.02 : 0.016;

  return chars.map((char, index) => (
    <motion.span
      key={`${char}-${index}`}
      className={`${charClass} will-change-transform`}
      initial={{ opacity: 0, y: enterY, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: exitY, scale: 1.06 }}
      transition={{
        type: "tween",
        duration,
        delay: index * stagger,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {char === " " ? "\u00A0" : char}
    </motion.span>
  ));
}

export function StudioPanelHeader({
  isExpanded,
  expandedTool,
  onClose,
  currentIcon: CurrentIcon,
  currentColor,
}: StudioPanelHeaderProps) {
  const titleText = isExpanded
    ? TOOL_LABELS[expandedTool || "ppt"]
    : "备课工坊";
  const descriptionText = isExpanded ? "配置生成参数" : "AI 生成工具";

  return (
    <CardHeader
      className="project-panel-header relative flex flex-row items-center justify-between px-4 py-0 shrink-0 space-y-0"
      style={{ height: "52px" }}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <motion.div
          className="flex min-w-0 flex-col justify-center"
          layout
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <CardTitle className="text-sm font-semibold leading-tight">
            <span className="relative block h-5 overflow-hidden">
              <AnimatePresence initial={false} mode="sync">
                <motion.span
                  key={isExpanded ? "expanded-title" : "collapsed-title"}
                  className="absolute inset-0 block truncate whitespace-nowrap"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 1 }}
                >
                  {renderMorphChars(titleText, "title")}
                </motion.span>
              </AnimatePresence>
            </span>
          </CardTitle>
          <CardDescription className="text-xs leading-tight text-[var(--project-text-muted)]">
            <span className="relative block h-4 overflow-hidden">
              <AnimatePresence initial={false} mode="sync">
                <motion.span
                  key={isExpanded ? "expanded-desc" : "collapsed-desc"}
                  className="absolute inset-0 block truncate whitespace-nowrap"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 1 }}
                >
                  {renderMorphChars(descriptionText, "desc")}
                </motion.span>
              </AnimatePresence>
            </span>
          </CardDescription>
        </motion.div>
      </div>

      <div className="ml-2 flex w-16 shrink-0 items-center justify-end">
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
      </div>

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
