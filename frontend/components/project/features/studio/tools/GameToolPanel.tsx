"use client";

import { useEffect, useState } from "react";
import { WorkflowStepper } from "@/components/project/shared";
import type { ToolPanelProps } from "./types";
import { ConfigStep } from "./game/ConfigStep";
import { GAME_STEPS, getReadinessLabel } from "./game/constants";
import { GenerateStep } from "./game/GenerateStep";
import { PreviewStep } from "./game/PreviewStep";
import type { GameStep } from "./game/types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

export function GameToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<GameStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);
  const [topic, setTopic] = useState("");
  const [creativeDirection, setCreativeDirection] = useState("");
  const [playerGoal, setPlayerGoal] = useState("");
  const [mechanicsNotes, setMechanicsNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const { suggestions, summary, isLoading } = useStudioRagRecommendations({
    query: "为当前项目推荐适合生成课堂互动游戏的主题、玩法方向和闯关目标",
    fallbackSuggestions: ["概念辨析", "因果链排序", "实验现象判断"],
  });

  useEffect(() => {
    if (!topic.trim() && suggestions[0]) {
      setTopic(suggestions[0]);
    }
  }, [suggestions, topic]);

  useEffect(() => {
    if (!creativeDirection.trim() && summary) {
      setCreativeDirection(summary);
    }
  }, [creativeDirection, summary]);

  useEffect(() => {
    onDraftChange?.({
      topic,
      creative_direction: creativeDirection,
      player_goal: playerGoal,
      mechanics_notes: mechanicsNotes,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    creativeDirection,
    flowContext?.selectedSourceId,
    mechanicsNotes,
    onDraftChange,
    playerGoal,
    topic,
  ]);

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
                配置页直接面向大模型表达需求，预览页只展示后端真实游戏结果。
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
              steps={GAME_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as GameStep)}
              title="互动游戏流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={GAME_STEPS}
                  onStepChange={(stepId) => setActiveStep(stepId as GameStep)}
                  title="互动游戏流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  topic={topic}
                  creativeDirection={creativeDirection}
                  playerGoal={playerGoal}
                  mechanicsNotes={mechanicsNotes}
                  topicSuggestions={suggestions}
                  ideaSuggestion={summary}
                  isRecommendationsLoading={isLoading}
                  onTopicChange={setTopic}
                  onCreativeDirectionChange={setCreativeDirection}
                  onPlayerGoalChange={setPlayerGoal}
                  onMechanicsNotesChange={setMechanicsNotes}
                  onNext={() => setActiveStep("generate")}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  creativeDirection={creativeDirection}
                  playerGoal={playerGoal}
                  mechanicsNotes={mechanicsNotes}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
