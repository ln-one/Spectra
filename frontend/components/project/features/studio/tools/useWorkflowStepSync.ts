"use client";

import { useEffect } from "react";
import type { ToolFlowContext } from "./types";

const WORKFLOW_STEPS = new Set(["config", "generate", "preview"]);

export function useWorkflowStepSync<TStep extends string>(
  activeStep: TStep,
  setActiveStep: (step: TStep) => void,
  flowContext?: ToolFlowContext
) {
  const requestedStep = flowContext?.requestedStep ?? null;
  const onStepChange = flowContext?.onStepChange;

  useEffect(() => {
    onStepChange?.(activeStep);
  }, [activeStep, onStepChange]);

  useEffect(() => {
    if (!requestedStep || requestedStep === activeStep) return;
    if (!WORKFLOW_STEPS.has(requestedStep)) return;
    setActiveStep(requestedStep as TStep);
  }, [activeStep, requestedStep, setActiveStep]);
}

