"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowStepper } from "@/components/project/shared";
import { TOOL_COLORS } from "../constants";
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

function defaultLineColor(scene: AnimationScene): string {
  if (scene === "magnetic_field") return "#38bdf8";
  if (scene === "particle_orbit") return "#22c55e";
  return "#f97316";
}

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
    const motionBrief = [topic.trim(), `scene:${scene}`, `speed:${speed}`]
      .filter(Boolean)
      .join(" | ");
    onDraftChange?.({
      topic,
      motion_brief: motionBrief,
      animation_format: "html5",
      scene,
      speed,
      show_trail: showTrail,
      split_view: splitView,
      line_color: defaultLineColor(scene),
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

  const colors = TOOL_COLORS.animation;

  return (
    <div 
      className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/80 backdrop-blur-xl shadow-2xl shadow-zinc-200/30 group/workbench"
      style={{
        ["--project-tool-accent" as any]: colors.primary,
        ["--project-tool-accent-soft" as any]: colors.glow,
        ["--project-tool-surface" as any]: colors.soft,
      }}
    >
      {/* Tool Accent Tip */}
      <div className={cn("h-1 w-full bg-gradient-to-r", colors.gradient)} />
      
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-100/80 px-5 py-4 bg-zinc-50/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white shadow-sm border border-zinc-100 group-hover/workbench:scale-110 transition-transform duration-500">
                <Play className="w-5 h-5" style={{ color: colors.primary }} />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-900 tracking-tight">
                  {toolName}智能工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  三步生成演示动画 · 直观呈现动态过程
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-zinc-100 bg-white px-2.5 py-1 text-[10px] font-bold text-zinc-600 shadow-sm uppercase tracking-wider">
                {getReadinessLabel(flowContext?.readiness)}
              </span>
            </div>
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
