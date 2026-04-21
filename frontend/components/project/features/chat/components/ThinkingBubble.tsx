"use client";

import { motion } from "framer-motion";
import { ThinkingMark } from "@/components/icons/status/ThinkingMark";
import { cn } from "@/lib/utils";

interface ThinkingBubbleProps {
  toolColor?: {
    primary: string;
    secondary: string;
    glow: string;
    soft: string;
  };
}

export function ThinkingBubble({ toolColor }: ThinkingBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex justify-start"
    >
      <div className="flex max-w-[82%] flex-col gap-1.5 items-start">
        <div
          className={cn(
            "relative flex items-center gap-3 px-4 py-3 rounded-2xl rounded-tl-sm border border-[var(--project-border)] bg-[var(--project-surface-elevated)] shadow-sm overflow-hidden"
          )}
          style={
            toolColor
              ? {
                  borderColor: toolColor.primary,
                  backgroundColor: `color-mix(in srgb, ${toolColor.primary} 4%, var(--project-surface-elevated))`,
                }
              : undefined
          }
        >
          {/* Subtle background glow */}
          {toolColor && (
            <motion.div
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle at 20% 50%, ${toolColor.glow}, transparent 70%)`,
              }}
            />
          )}

          <div className="relative z-10 flex items-center gap-3">
            <motion.div
              animate={{
                rotate: [0, 90, 180, 270, 360],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear",
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--project-surface-muted)]"
              style={
                toolColor ? { backgroundColor: toolColor.soft } : undefined
              }
            >
              <ThinkingMark
                className="h-5.5 w-5.5"
                style={{
                  color: toolColor
                    ? toolColor.primary
                    : "var(--project-accent)",
                }}
              />
            </motion.div>

            <div className="flex items-center gap-1">
              <span className="text-[11px] font-black tracking-tight text-[var(--project-text-primary)] uppercase">
                Spectra 正在构思...
              </span>
              <div className="flex gap-1 ml-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      y: [0, -4, 0],
                      opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: toolColor
                        ? toolColor.primary
                        : "var(--project-accent)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
