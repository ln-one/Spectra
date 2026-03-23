"use client";

import { Check, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type WorkflowStepId = string | number;

export interface WorkflowStepItem {
  id: WorkflowStepId;
  title: string;
  description: string;
  caption?: string;
}

export interface WorkflowStepperProps {
  currentStep: WorkflowStepId;
  className?: string;
  steps: WorkflowStepItem[];
  title?: string;
  subtitle?: string;
  layout?: "rail" | "inline";
  onStepChange?: (stepId: WorkflowStepId) => void;
}

function getStepState(index: number, currentIndex: number) {
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "current";
  return "upcoming";
}

export function WorkflowStepper({
  currentStep,
  className,
  steps,
  title = "三步完成",
  subtitle = "Flow",
  layout = "rail",
  onStepChange,
}: WorkflowStepperProps) {
  const currentIndex = Math.max(
    steps.findIndex((step) => step.id === currentStep),
    0
  );
  const completion = ((currentIndex + 1) / steps.length) * 100;
  const interactive = Boolean(onStepChange);

  return (
    <aside
      className={cn(
        "project-tool-workflow rounded-2xl border border-[var(--project-tool-border,var(--project-border,#e4e4e7))] bg-[var(--project-tool-surface,var(--project-surface,#ffffff))]",
        layout === "rail" ? "p-3" : "p-3.5",
        className
      )}
      aria-label="工作流程"
    >
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]">
            {subtitle}
          </p>
          <span className="rounded-full border border-[var(--project-tool-border,var(--project-border,#e4e4e7))] bg-[var(--project-tool-elevated,var(--project-surface-elevated,#ffffff))] px-2 py-0.5 text-[10px] text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]">
            {currentIndex + 1}/{steps.length}
          </span>
        </div>
        <h3 className="mt-1 text-sm font-semibold text-[var(--project-tool-text,var(--project-text-primary,#18181b))]">
          {title}
        </h3>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--project-tool-elevated,var(--project-surface-muted,#f4f4f5))]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--project-tool-accent,var(--project-accent,#2563eb)),color-mix(in_srgb,var(--project-tool-accent,var(--project-accent,#2563eb))_76%,white))] transition-all duration-300"
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      <TooltipProvider delayDuration={100}>
        {layout === "inline" ? (
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {steps.map((step, index) => {
              const state = getStepState(index, currentIndex);
              const isCurrent = state === "current";
              const isCompleted = state === "completed";
              const isLocked = index > currentIndex;
              const canClick = interactive && !isLocked;
              const wrapperClass = cn(
                "relative w-full rounded-xl border p-2.5 text-left transition-all",
                canClick && "cursor-pointer",
                isCompleted
                  ? "border-[var(--project-tool-accent,var(--project-accent,#2563eb))] bg-[var(--project-tool-accent-soft,color-mix(in_srgb,var(--project-accent,#2563eb)_16%,var(--project-surface,#ffffff)))] text-[var(--project-tool-text,var(--project-text-primary,#18181b))]"
                  : isCurrent
                    ? "border-[var(--project-tool-accent,var(--project-accent,#2563eb))] bg-[color-mix(in_srgb,var(--project-tool-accent,var(--project-accent,#2563eb))_12%,var(--project-tool-surface,var(--project-surface,#ffffff)))]"
                    : isLocked
                      ? "border-[var(--project-tool-border,var(--project-border,#e4e4e7))] bg-[var(--project-tool-elevated,var(--project-surface-elevated,#ffffff))] opacity-75"
                      : "border-[var(--project-tool-border,var(--project-border,#e4e4e7))] bg-[var(--project-tool-elevated,var(--project-surface-elevated,#ffffff))] hover:border-[var(--project-tool-border-strong,var(--project-border-strong,#a1a1aa))] hover:bg-[var(--project-tool-surface,var(--project-surface,#ffffff))]"
              );
              const commonProps = canClick
                ? { onClick: () => onStepChange?.(step.id) }
                : {};

              return (
                <li key={String(step.id)}>
                  <button
                    type="button"
                    className={wrapperClass}
                    disabled={interactive && isLocked}
                    {...commonProps}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                          isCompleted
                            ? "border-[color-mix(in_srgb,var(--project-tool-accent,var(--project-accent,#2563eb))_72%,white)] bg-[var(--project-tool-accent,var(--project-accent,#2563eb))] text-[var(--project-accent-text,#ffffff)]"
                            : isCurrent
                              ? "border-[var(--project-tool-accent,var(--project-accent,#2563eb))] text-[var(--project-tool-accent,var(--project-accent,#2563eb))]"
                              : "border-[var(--project-tool-border,var(--project-border,#e4e4e7))] text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]"
                        )}
                      >
                        {isCompleted ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-[13px] font-semibold",
                          isCompleted
                            ? "text-[var(--project-tool-text,var(--project-text-primary,#18181b))]"
                            : isCurrent
                              ? "text-[var(--project-tool-accent,var(--project-accent,#2563eb))]"
                              : "text-[var(--project-tool-text,var(--project-text-primary,#3f3f46))]"
                        )}
                      >
                        {step.title}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "ml-auto inline-flex h-4.5 w-4.5 items-center justify-center rounded-full",
                              isCompleted
                                ? "text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]"
                                : "text-[var(--project-tool-muted,var(--project-text-muted,#a1a1aa))] hover:bg-[var(--project-tool-elevated,var(--project-surface-muted,#f4f4f5))] hover:text-[var(--project-tool-text,var(--project-text-primary,#18181b))]"
                            )}
                          >
                            <CircleHelp className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-[220px] rounded-xl border-[var(--project-tool-border,var(--project-border,#e4e4e7))] bg-[var(--project-tool-surface,var(--project-surface,#ffffff))] text-xs leading-5 text-[var(--project-tool-muted,var(--project-text-muted,#52525b))] shadow-xl"
                        >
                          {step.description}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-[11px]",
                        isCompleted
                          ? "text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]"
                          : isCurrent
                            ? "text-[var(--project-tool-accent,var(--project-accent,#2563eb))]"
                            : "text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]"
                      )}
                    >
                      {step.caption ?? step.description}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <ol className="space-y-2.5">
            {steps.map((step, index) => {
              const state = getStepState(index, currentIndex);
              const isLast = index === steps.length - 1;
              const isCurrent = state === "current";
              const isCompleted = state === "completed";
              const isLocked = index > currentIndex;
              const canClick = interactive && !isLocked;
              const wrapperClass = cn(
                "relative w-full rounded-xl border bg-[var(--project-tool-elevated,var(--project-surface-elevated,#ffffff))] p-2.5 pl-9 text-left transition-all",
                canClick && "cursor-pointer",
                isCompleted
                  ? "border-[var(--project-tool-accent,var(--project-accent,#2563eb))] bg-[var(--project-tool-accent-soft,color-mix(in_srgb,var(--project-accent,#2563eb)_16%,var(--project-surface,#ffffff)))]"
                  : isCurrent
                    ? "border-[var(--project-tool-accent,var(--project-accent,#2563eb))] bg-[color-mix(in_srgb,var(--project-tool-accent,var(--project-accent,#2563eb))_12%,var(--project-tool-surface,var(--project-surface,#ffffff)))]"
                    : isLocked
                      ? "border-[var(--project-tool-border,var(--project-border,#e4e4e7))] bg-[var(--project-tool-elevated,var(--project-surface-elevated,#ffffff))] opacity-75"
                      : "border-[var(--project-tool-border,var(--project-border,#e4e4e7))] hover:border-[var(--project-tool-border-strong,var(--project-border-strong,#a1a1aa))] hover:bg-[var(--project-tool-surface,var(--project-surface,#ffffff))]"
              );
              const commonProps = canClick
                ? { onClick: () => onStepChange?.(step.id) }
                : {};

              return (
                <li key={String(step.id)} className="relative">
                  {!isLast ? (
                    <span
                      className={cn(
                        "absolute left-[11px] top-7 h-[calc(100%+10px)] w-px",
                        isCompleted
                          ? "bg-[color-mix(in_srgb,var(--project-tool-accent,var(--project-accent,#2563eb))_46%,var(--project-tool-border,var(--project-border,#e4e4e7)))]"
                          : "bg-[var(--project-tool-border,var(--project-border,#e4e4e7))]"
                      )}
                    />
                  ) : null}

                  <button
                    type="button"
                    className={wrapperClass}
                    disabled={interactive && isLocked}
                    {...commonProps}
                  >
                    <span
                      className={cn(
                        "absolute left-2.5 top-2.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[10px] font-semibold transition-colors",
                        isCompleted
                          ? "border-[color-mix(in_srgb,var(--project-tool-accent,var(--project-accent,#2563eb))_72%,white)] bg-[var(--project-tool-accent,var(--project-accent,#2563eb))] text-[var(--project-accent-text,#ffffff)]"
                          : isCurrent
                            ? "border-[var(--project-tool-accent,var(--project-accent,#2563eb))] bg-[var(--project-tool-elevated,var(--project-surface-elevated,#ffffff))] text-[var(--project-tool-accent,var(--project-accent,#2563eb))]"
                            : "border-[var(--project-tool-border,var(--project-border,#e4e4e7))] bg-[var(--project-tool-elevated,var(--project-surface-elevated,#ffffff))] text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]"
                      )}
                      aria-hidden="true"
                    >
                      {isCompleted ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>

                    <div className="flex items-center gap-1">
                      <p
                        className={cn(
                          "text-[13px] font-semibold leading-5",
                          isCompleted
                            ? "text-[var(--project-tool-text,var(--project-text-primary,#18181b))]"
                            : isCurrent
                              ? "text-[var(--project-tool-accent,var(--project-accent,#2563eb))]"
                              : "text-[var(--project-tool-text,var(--project-text-primary,#3f3f46))]"
                        )}
                      >
                        {step.title}
                      </p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "inline-flex h-4.5 w-4.5 items-center justify-center rounded-full",
                              isCompleted
                                ? "text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]"
                                : "text-[var(--project-tool-muted,var(--project-text-muted,#a1a1aa))] hover:bg-[var(--project-tool-elevated,var(--project-surface-muted,#f4f4f5))] hover:text-[var(--project-tool-text,var(--project-text-primary,#18181b))]"
                            )}
                            aria-label={`${step.title}说明`}
                          >
                            <CircleHelp className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="max-w-[220px] rounded-xl border-[var(--project-tool-border,var(--project-border,#e4e4e7))] bg-[var(--project-tool-surface,var(--project-surface,#ffffff))] text-xs leading-5 text-[var(--project-tool-muted,var(--project-text-muted,#52525b))] shadow-xl"
                        >
                          {step.description}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-[11px] leading-4",
                        isCompleted
                          ? "text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]"
                          : isCurrent
                            ? "text-[var(--project-tool-accent,var(--project-accent,#2563eb))]"
                            : "text-[var(--project-tool-muted,var(--project-text-muted,#71717a))]"
                      )}
                    >
                      {step.caption ?? step.description}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </TooltipProvider>
    </aside>
  );
}
