"use client";

import { useEffect, useState } from "react";
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
import type { AnimationScene, AnimationStep } from "./animation/types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

export function AnimationToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<AnimationStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);
  const [topic, setTopic] = useState("");
  const [scene, setScene] = useState<AnimationScene>("bubble_sort");
  const [speed, setSpeed] = useState(50);
  const [showTrail, setShowTrail] = useState(true);
  const [splitView, setSplitView] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const { suggestions, isLoading } = useStudioRagRecommendations({
    query: "为当前项目推荐适合演示动画的动态过程、抽象关系和可视化重点",
    fallbackSuggestions: ["关键过程演示", "动态变化规律", "抽象机制可视化"],
  });

  useEffect(() => {
    if (!topic.trim() && suggestions[0]) {
      setTopic(suggestions[0]);
    }
  }, [suggestions, topic]);

  useEffect(() => {
    onDraftChange?.({
      topic,
      scene,
      speed,
      show_trail: showTrail,
      split_view: splitView,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    flowContext?.selectedSourceId,
    onDraftChange,
    scene,
    showTrail,
    speed,
    splitView,
    topic,
  ]);

  const sceneLabel =
    ANIMATION_SCENE_OPTIONS.find((item) => item.value === scene)?.label ?? "演示动画";

  const handleGenerate = async () => {
    setActiveStep("preview");

    if (!flowContext?.onExecute) {
      setLastGeneratedAt(new Date().toISOString());
      return;
    }

    setIsGenerating(true);
    try {
      const executed = await flowContext.onExecute();
      if (!executed) {
        setActiveStep("generate");
        return;
      }
      setLastGeneratedAt(new Date().toISOString());
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200 bg-[linear-gradient(160deg,#ffffff,#f8fafc)] shadow-[0_22px_65px_-48px_rgba(15,23,42,0.45)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-200 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">{toolName}三步工作台</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                配置页优先使用 RAG 推荐，预览页只显示后端真实动画结果。
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600">
              {getReadinessLabel(flowContext?.readiness)}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[176px_minmax(0,1fr)]">
            <WorkflowStepper
              className="hidden h-full min-h-0 overflow-y-auto lg:block"
              layout="rail"
              currentStep={activeStep}
              steps={ANIMATION_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as AnimationStep)}
              title="演示动画流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={ANIMATION_STEPS}
                  onStepChange={(stepId) => setActiveStep(stepId as AnimationStep)}
                  title="演示动画流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  topic={topic}
                  scene={scene}
                  speed={speed}
                  showTrail={showTrail}
                  splitView={splitView}
                  topicSuggestions={suggestions}
                  isRecommendationsLoading={isLoading}
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
                <PreviewStep lastGeneratedAt={lastGeneratedAt} flowContext={flowContext} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
