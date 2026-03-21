"use client";

import { Check, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PPT_WORKFLOW_STEPS = [
  {
    id: 1,
    title: "填写需求",
    description: "写清楚要讲什么、给谁讲、你希望多少页。",
  },
  {
    id: 2,
    title: "编辑大纲",
    description: "确认每一页标题和重点，满意后再开始生成。",
  },
  {
    id: 3,
    title: "查看结果",
    description: "进入生成页看进度，完成后预览并导出。",
  },
] as const;

type WorkflowStep = (typeof PPT_WORKFLOW_STEPS)[number]["id"];

interface PptWorkflowRailProps {
  currentStep: WorkflowStep;
  className?: string;
}

function getStepState(step: WorkflowStep, currentStep: WorkflowStep) {
  if (step < currentStep) return "completed";
  if (step === currentStep) return "current";
  return "upcoming";
}

export function PptWorkflowRail({
  currentStep,
  className,
}: PptWorkflowRailProps) {
  return (
    <aside
      className={cn(
        "rounded-2xl border border-zinc-200 bg-[linear-gradient(155deg,#ffffff,#f8fafc)] p-3",
        className
      )}
      aria-label="PPT 流程"
    >
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Flow
        </p>
        <h3 className="mt-1 text-sm font-semibold text-zinc-900">三步完成课件</h3>
      </div>

      <TooltipProvider delayDuration={100}>
        <ol className="space-y-2.5">
          {PPT_WORKFLOW_STEPS.map((step, index) => {
            const state = getStepState(step.id, currentStep);
            const isLast = index === PPT_WORKFLOW_STEPS.length - 1;
            const isCurrent = state === "current";
            const isCompleted = state === "completed";

            return (
              <li key={step.id} className="relative pl-8">
                {!isLast ? (
                  <span
                    className={cn(
                      "absolute left-[11px] top-6 h-[calc(100%+8px)] w-px",
                      isCompleted ? "bg-zinc-400" : "bg-zinc-200"
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    "absolute left-0 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[10px] font-semibold transition-colors",
                    isCompleted
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : isCurrent
                        ? "border-zinc-900 bg-white text-zinc-900"
                        : "border-zinc-300 bg-white text-zinc-500"
                  )}
                  aria-hidden="true"
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.id}
                </span>

                <div className="flex items-center gap-1 pt-0.5">
                  <p
                    className={cn(
                      "text-[13px] font-medium leading-5",
                      isCurrent || isCompleted ? "text-zinc-900" : "text-zinc-500"
                    )}
                  >
                    {step.title}
                  </p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                        aria-label={`${step.title}说明`}
                      >
                        <CircleHelp className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="max-w-[220px] rounded-xl border-zinc-200 bg-white text-xs leading-5 text-zinc-600 shadow-xl"
                    >
                      {step.description}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </li>
            );
          })}
        </ol>
      </TooltipProvider>
    </aside>
  );
}
