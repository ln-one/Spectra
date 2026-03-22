"use client";

import {
  WorkflowStepper,
  type WorkflowStepItem,
  type WorkflowStepId,
} from "@/components/project/shared";

const PPT_WORKFLOW_STEPS: WorkflowStepItem[] = [
  {
    id: 1,
    title: "填写需求",
    description: "写清楚要讲什么、给谁讲、希望多少页。",
    caption: "明确方向",
  },
  {
    id: 2,
    title: "编辑大纲",
    description: "确认每页标题和重点，满意后再继续。",
    caption: "确认结构",
  },
  {
    id: 3,
    title: "查看结果",
    description: "进入生成页看进度，完成后预览并导出。",
    caption: "完成交付",
  },
];

export interface PptWorkflowRailProps {
  currentStep: WorkflowStepId;
  className?: string;
  steps?: WorkflowStepItem[];
  title?: string;
  subtitle?: string;
  layout?: "rail" | "inline";
  onStepChange?: (stepId: WorkflowStepId) => void;
}

export function PptWorkflowRail({
  currentStep,
  className,
  steps = PPT_WORKFLOW_STEPS,
  title = "三步完成课件",
  subtitle = "Flow",
  layout = "rail",
  onStepChange,
}: PptWorkflowRailProps) {
  return (
    <WorkflowStepper
      currentStep={currentStep}
      className={className}
      steps={steps}
      title={title}
      subtitle={subtitle}
      layout={layout}
      onStepChange={onStepChange}
    />
  );
}
