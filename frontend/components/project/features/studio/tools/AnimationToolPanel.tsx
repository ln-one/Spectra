"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowStepper } from "@/components/project/shared";
import type { ToolPanelProps } from "./types";
import {
  ANIMATION_SCENE_OPTIONS,
  ANIMATION_STEPS,
  getReadinessLabel,
} from "./animation/constants";
import { ConfigStep } from "./animation/ConfigStep";
import { GenerateStep } from "./animation/GenerateStep";
import { PreviewStep } from "./animation/PreviewStep";
import {
  buildAnimationCode,
  buildAnimationDescription,
} from "./animation/templates";
import type { AnimationScene, AnimationStep } from "./animation/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

export function AnimationToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<AnimationStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);
  const [topic, setTopic] = useState("冒泡排序每轮交换过程");
  const [scene, setScene] = useState<AnimationScene>("bubble_sort");
  const [speed, setSpeed] = useState(50);
  const [showTrail, setShowTrail] = useState(true);
  const [splitView, setSplitView] = useState(true);
  const [lineColor, setLineColor] = useState("#16a34a");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    onDraftChange?.({
      topic,
      scene,
      speed,
      show_trail: showTrail,
      split_view: splitView,
      line_color: lineColor,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    flowContext?.selectedSourceId,
    lineColor,
    onDraftChange,
    scene,
    showTrail,
    speed,
    splitView,
    topic,
  ]);

  const sceneLabel =
    ANIMATION_SCENE_OPTIONS.find((item) => item.value === scene)?.label ??
    "粒子运动演示";
  const codeText = useMemo(
    () =>
      buildAnimationCode({
        topic,
        scene,
        speed,
        showTrail,
        lineColor,
      }),
    [lineColor, scene, showTrail, speed, topic]
  );
  const description = useMemo(() => buildAnimationDescription(scene), [scene]);

  const handleGenerate = async () => {
    if (!flowContext?.onExecute) {
      setLastGeneratedAt(new Date().toISOString());
      setActiveStep("preview");
      return;
    }

    setIsGenerating(true);
    try {
      await flowContext.onExecute();
      setLastGeneratedAt(new Date().toISOString());
      setActiveStep("preview");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-zinc-200 bg-[linear-gradient(160deg,#ffffff,#f8fafc)] shadow-[0_22px_65px_-48px_rgba(15,23,42,0.45)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-200 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}三步工作台{" "}
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                先配置动画参数，再生成，最后在代码区和演示区联动预览。{" "}
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600">
              {getReadinessLabel(flowContext?.readiness)}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="flex h-full min-h-0 gap-4">
            <WorkflowStepper
              className="w-[228px] shrink-0"
              layout="rail"
              currentStep={activeStep}
              steps={ANIMATION_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as AnimationStep)}
              title="演示动画流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {activeStep === "config" ? (
                <ConfigStep
                  topic={topic}
                  scene={scene}
                  speed={speed}
                  showTrail={showTrail}
                  splitView={splitView}
                  onTopicChange={setTopic}
                  onSceneChange={setScene}
                  onSpeedChange={setSpeed}
                  onShowTrailChange={setShowTrail}
                  onSplitViewChange={setSplitView}
                  onNext={() => setActiveStep("generate")}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  sceneLabel={sceneLabel}
                  speed={speed}
                  showTrail={showTrail}
                  splitView={splitView}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  codeText={codeText}
                  description={description}
                  speed={speed}
                  showTrail={showTrail}
                  splitView={splitView}
                  lineColor={lineColor}
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                  onRegenerate={() => setActiveStep("generate")}
                  onSpeedChange={setSpeed}
                  onShowTrailChange={setShowTrail}
                  onSplitViewChange={setSplitView}
                  onLineColorChange={setLineColor}
                  onQuickHalfSpeed={() =>
                    setSpeed((prev) => Math.max(10, Math.floor(prev / 2)))
                  }
                  onQuickRedTrail={() => {
                    setShowTrail(true);
                    setLineColor("#dc2626");
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
