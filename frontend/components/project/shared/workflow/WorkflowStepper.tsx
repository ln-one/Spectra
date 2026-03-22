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
        "rounded-2xl border border-zinc-200 bg-[linear-gradient(155deg,#ffffff,#f8fafc)]",
        layout === "rail" ? "p-3" : "p-3.5",
        className
      )}
      aria-label="工作流程"
    >
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {subtitle}
          </p>
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-500">
            {currentIndex + 1}/{steps.length}
          </span>
        </div>
        <h3 className="mt-1 text-sm font-semibold text-zinc-900">{title}</h3>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200/80">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#38bdf8)] transition-all duration-300"
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
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : isCurrent
                    ? "border-blue-500 bg-blue-50"
                    : isLocked
                      ? "border-zinc-200 bg-white opacity-75"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
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
                            ? "border-white/40 text-white"
                            : isCurrent
                              ? "border-blue-500 text-blue-700"
                              : "border-zinc-300 text-zinc-500"
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
                            ? "text-white"
                            : isCurrent
                              ? "text-blue-700"
                              : "text-zinc-700"
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
                                ? "text-white/70"
                                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                            )}
                          >
                            <CircleHelp className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-[220px] rounded-xl border-zinc-200 bg-white text-xs leading-5 text-zinc-600 shadow-xl"
                        >
                          {step.description}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-[11px]",
                        isCompleted
                          ? "text-white/80"
                          : isCurrent
                            ? "text-blue-700/80"
                            : "text-zinc-500"
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
                "relative w-full rounded-xl border bg-white p-2.5 pl-9 text-left transition-all",
                canClick && "cursor-pointer",
                isCompleted
                  ? "border-zinc-900 bg-zinc-900"
                  : isCurrent
                    ? "border-blue-500 bg-blue-50"
                    : isLocked
                      ? "border-zinc-200 bg-white opacity-75"
                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
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
                        isCompleted ? "bg-zinc-400" : "bg-zinc-200"
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
                          ? "border-white/40 bg-zinc-900 text-white"
                          : isCurrent
                            ? "border-blue-500 bg-white text-blue-700"
                            : "border-zinc-300 bg-white text-zinc-500"
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
                            ? "text-white"
                            : isCurrent
                              ? "text-blue-700"
                              : "text-zinc-700"
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
                                ? "text-white/70"
                                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                            )}
                            aria-label={`${step.title}说明`}
                          >
                            <CircleHelp className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="max-w-[220px] rounded-xl border-zinc-200 bg-white text-xs leading-5 text-zinc-600 shadow-xl"
                        >
                          {step.description}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-[11px] leading-4",
                        isCompleted
                          ? "text-white/80"
                          : isCurrent
                            ? "text-blue-700/80"
                            : "text-zinc-500"
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
