"use client";

import { motion } from "framer-motion";
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
        "project-tool-workflow rounded-2xl border border-zinc-200/60 bg-white/50 backdrop-blur-md shadow-sm",
        layout === "rail" ? "p-4" : "p-3.5",
        className
      )}
      style={{
        ["--accent-glow" as any]:
          "var(--project-tool-accent-soft, rgba(37, 99, 235, 0.1))",
        ["--accent-main" as any]: "var(--project-tool-accent, #2563eb)",
      }}
      aria-label="工作流程"
    >
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
            {subtitle}
          </p>
          <span className="rounded-full border border-zinc-100 bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-500 shadow-sm">
            {currentIndex + 1} / {steps.length}
          </span>
        </div>
        <h3 className="mt-1.5 text-sm font-black text-zinc-900 tracking-tight">
          {title}
        </h3>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100/80 p-[1.5px]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent-main)] to-[var(--accent-glow)] transition-all duration-500 ease-out shadow-[0_0_8px_var(--accent-glow)]"
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      <TooltipProvider delayDuration={100}>
        {layout === "inline" ? (
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {steps.map((step, index) => {
              const state = getStepState(index, currentIndex);
              const isCurrent = state === "current";
              const isCompleted = state === "completed";
              const isLocked = index > currentIndex;
              const canClick = interactive && !isLocked;

              return (
                <li key={String(step.id)}>
                  <button
                    type="button"
                    className={cn(
                      "relative w-full rounded-xl border p-3 text-left transition-all duration-300",
                      canClick &&
                        "cursor-pointer hover:border-[var(--accent-main)] hover:shadow-md hover:shadow-[var(--accent-glow)]",
                      isCompleted
                        ? "border-[var(--accent-main)] bg-white shadow-sm"
                        : isCurrent
                          ? "border-[var(--accent-main)] bg-white ring-2 ring-[var(--accent-glow)] shadow-lg"
                          : "border-zinc-100 bg-zinc-50/50 opacity-60"
                    )}
                    disabled={interactive && isLocked}
                    onClick={
                      canClick ? () => onStepChange?.(step.id) : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-black transition-all",
                          isCompleted
                            ? "bg-[var(--accent-main)] border-[var(--accent-main)] text-white"
                            : isCurrent
                              ? "border-[var(--accent-main)] text-[var(--accent-main)] bg-white scale-110"
                              : "border-zinc-200 text-zinc-400 bg-zinc-50"
                        )}
                      >
                        {isCompleted ? (
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span
                            className={cn(
                              "text-[12px] font-bold truncate",
                              isCurrent ? "text-zinc-900" : "text-zinc-500"
                            )}
                          >
                            {step.title}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <CircleHelp className="h-3 w-3 text-zinc-300 hover:text-zinc-500" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-900 text-white border-none rounded-lg p-2 text-[10px]">
                              {step.description}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <ol className="space-y-4">
            {steps.map((step, index) => {
              const state = getStepState(index, currentIndex);
              const isLast = index === steps.length - 1;
              const isCurrent = state === "current";
              const isCompleted = state === "completed";
              const isLocked = index > currentIndex;
              const canClick = interactive && !isLocked;

              return (
                <li key={String(step.id)} className="relative">
                  {!isLast && (
                    <div
                      className={cn(
                        "absolute left-[13px] top-8 bottom-[-16px] w-[2px] rounded-full transition-colors duration-500",
                        isCompleted ? "bg-[var(--accent-main)]" : "bg-zinc-100"
                      )}
                    />
                  )}

                  <button
                    type="button"
                    disabled={interactive && isLocked}
                    onClick={
                      canClick ? () => onStepChange?.(step.id) : undefined
                    }
                    className={cn(
                      "group relative flex w-full gap-3 rounded-xl p-2 transition-all duration-300",
                      isCurrent &&
                        "bg-white shadow-xl shadow-zinc-200/50 ring-1 ring-zinc-100",
                      canClick &&
                        "cursor-pointer hover:bg-white hover:shadow-lg"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-black transition-all duration-500 z-10",
                        isCompleted
                          ? "bg-[var(--accent-main)] border-[var(--accent-main)] text-white shadow-lg shadow-[var(--accent-glow)]"
                          : isCurrent
                            ? "bg-white border-[var(--accent-main)] text-[var(--accent-main)] scale-110 shadow-xl"
                            : "bg-zinc-50 border-zinc-100 text-zinc-300"
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-4 w-4 stroke-[3]" />
                      ) : (
                        index + 1
                      )}
                    </div>

                    <div className="flex flex-col text-left pt-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-[13px] font-bold leading-none tracking-tight transition-colors",
                            isCurrent
                              ? "text-zinc-900"
                              : isCompleted
                                ? "text-zinc-600"
                                : "text-zinc-400"
                          )}
                        >
                          {step.title}
                        </span>
                        {isCurrent && (
                          <motion.div
                            layoutId="active-dot"
                            className="w-1.5 h-1.5 rounded-full bg-[var(--accent-main)] animate-pulse"
                          />
                        )}
                      </div>
                      <p
                        className={cn(
                          "mt-1.5 text-[11px] font-medium leading-relaxed line-clamp-2 transition-colors",
                          isCurrent
                            ? "text-zinc-500"
                            : "text-zinc-400 opacity-60"
                        )}
                      >
                        {step.caption ?? step.description}
                      </p>
                    </div>
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
