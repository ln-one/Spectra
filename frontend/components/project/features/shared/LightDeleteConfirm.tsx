"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LightDeleteConfirmProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  kind?: "danger" | "archive";
  onCancel: () => void;
  onConfirm: () => void;
}

export function LightDeleteConfirm({
  open,
  title,
  description,
  confirmText = "删除",
  kind = "danger",
  onCancel,
  onConfirm,
}: LightDeleteConfirmProps) {
  if (!open) return null;

  const isArchive = kind === "archive";
  const iconToneClass = isArchive
    ? "bg-[var(--project-surface-muted)] text-[var(--project-text-muted)]"
    : "bg-[var(--project-danger-soft,rgba(220,38,38,0.12))] text-[var(--project-danger,#dc2626)]";
  const confirmBtnClass = isArchive
    ? "bg-[var(--project-accent)] text-[var(--project-accent-text)] hover:bg-[var(--project-accent-hover)]"
    : "bg-[var(--project-danger,#dc2626)] text-white hover:bg-[color-mix(in_srgb,var(--project-danger,#dc2626)_88%,black)]";

  return (
    <>
      <div
        className="fixed inset-0 z-[190] bg-[var(--project-overlay)] backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="w-full max-w-sm rounded-[var(--project-menu-radius)] border border-[var(--project-menu-border)] bg-[var(--project-menu-bg)] p-4 shadow-[var(--project-menu-shadow)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full ${iconToneClass}`}
              >
                {isArchive ? (
                  <Archive className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
              </div>
              <p className="text-sm font-semibold text-[var(--project-text-primary)]">
                {title}
              </p>
            </div>
            <p className="text-xs leading-5 text-[var(--project-text-muted)]">
              {description}
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              className="h-9 rounded-[var(--project-chip-radius)] border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] text-[var(--project-text-primary)] hover:bg-[var(--project-surface-muted)]"
              onClick={onCancel}
            >
              取消
            </Button>
            <Button
              className={`h-9 rounded-[var(--project-chip-radius)] ${confirmBtnClass}`}
              onClick={onConfirm}
            >
              {confirmText}
            </Button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
