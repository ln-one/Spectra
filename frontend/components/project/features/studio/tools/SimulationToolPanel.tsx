"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowStepper } from "@/components/project/shared";
import { getErrorMessage } from "@/lib/sdk/errors";
import { TOOL_COLORS } from "../constants";
import type { ToolPanelProps } from "./types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";
import { ConfigStep } from "./simulation/ConfigStep";
import {
  getReadinessLabel,
  SIMULATION_STEPS,
  STUDENT_PROFILES,
} from "./simulation/constants";
import { GenerateStep } from "./simulation/GenerateStep";
import { PreviewStep } from "./simulation/PreviewStep";
import type { SimulationStep, StudentProfile } from "./simulation/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

export function SimulationToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<SimulationStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);

  const [topic, setTopic] = useState("");
  const [intensity, setIntensity] = useState(60);
  const [profile, setProfile] = useState<StudentProfile>("detail_oriented");
  const [teacherStrategy, setTeacherStrategy] = useState("");
  const [answer, setAnswer] = useState("");
  const [judgeText, setJudgeText] = useState("");
  const [turnResult, setTurnResult] = useState<{
    turnAnchor?: string;
    studentQuestion?: string;
    score?: number | null;
    nextFocus?: string;
    studentProfile?: string;
  } | null>(null);
  const [turnRuntimeState, setTurnRuntimeState] = useState<Record<string, unknown> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const { suggestions, summary, isLoading } = useStudioRagRecommendations({
    surface: "studio_simulation",
    seedText: [topic, teacherStrategy].filter(Boolean).join(" "),
  });

  useEffect(() => {
    if (!topic.trim() && suggestions[0]) {
      setTopic(suggestions[0]);
    }
  }, [suggestions, topic]);

  useEffect(() => {
    if (!teacherStrategy.trim() && summary) {
      setTeacherStrategy(summary);
    }
  }, [summary, teacherStrategy]);

  const profileLabel = useMemo(
    () =>
      STUDENT_PROFILES.find((item) => item.value === profile)?.label ??
      "Detail-oriented Student",
    [profile]
  );

  useEffect(() => {
    const latestGeneratedAt = flowContext?.latestArtifacts?.[0]?.createdAt ?? null;
    if (latestGeneratedAt) {
      setLastGeneratedAt(latestGeneratedAt);
    }
  }, [flowContext?.latestArtifacts]);

  useEffect(() => {
    const questionFocus = (teacherStrategy || topic).trim();
    onDraftChange?.({
      topic,
      intensity,
      profile,
      student_profiles: [profile],
      question_focus: questionFocus,
      turns: 3,
      include_strategy_panel: true,
      active_student_profile: profile,
      teacher_strategy: teacherStrategy,
      answer,
      judge_text: judgeText,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    answer,
    flowContext?.selectedSourceId,
    intensity,
    judgeText,
    onDraftChange,
    profile,
    teacherStrategy,
    topic,
  ]);

  const handleGenerate = async () => {
    setAnswer("");
    setJudgeText("");
    setTurnResult(null);
    setTurnRuntimeState(null);
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

  const handlePrepareGenerate = async () => {
    if (!flowContext?.onPrepareGenerate) {
      setActiveStep("generate");
      return;
    }
    const prepared = await flowContext.onPrepareGenerate();
    if (!prepared) return;
    setActiveStep("generate");
  };

  const handleSubmitAnswer = async () => {
    const latestArtifactId =
      flowContext?.resolvedArtifact?.artifactId ??
      flowContext?.latestArtifacts?.[0]?.artifactId ??
      null;
    if (!answer.trim()) return;
    if (!flowContext?.onFollowUpTurn || !latestArtifactId) return;

    try {
      setIsSubmittingTurn(true);
      const response = await flowContext.onFollowUpTurn({
        artifactId: latestArtifactId,
        teacherAnswer: answer,
        turnAnchor: turnResult?.turnAnchor,
        config: {
          active_student_profile: profile,
          student_profiles: [profile],
          topic,
          intensity,
          teacher_strategy: teacherStrategy,
        },
      });
      if (!response.ok || !response.turnResult) {
        setJudgeText("提交失败：当前轮次未能推进，请稍后重试。");
        return;
      }
      const latestTurnResult = response.turnResult;
      setJudgeText(latestTurnResult.feedback || "");
      setTurnRuntimeState(response.latestRunnableState ?? null);
      setTurnResult({
        turnAnchor: latestTurnResult.turn_anchor,
        studentQuestion: latestTurnResult.student_question,
        score:
          typeof latestTurnResult.score === "number"
            ? latestTurnResult.score
            : null,
        nextFocus: latestTurnResult.next_focus,
        studentProfile: latestTurnResult.student_profile,
      });
      setAnswer("");
    } catch (error) {
      setTurnResult(null);
      setTurnRuntimeState(null);
      setJudgeText(`提交失败：${getErrorMessage(error)}`);
    } finally {
      setIsSubmittingTurn(false);
    }
  };

  const colors = TOOL_COLORS.handout;

  return (
    <div
      className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/80 backdrop-blur-xl shadow-2xl shadow-zinc-200/30 group/workbench"
      style={{
        ["--project-tool-accent" as any]: colors.primary,
        ["--project-tool-accent-soft" as any]: colors.glow,
        ["--project-tool-surface" as any]: colors.soft,
      }}
    >
      <div className={cn("h-1 w-full bg-gradient-to-r", colors.gradient)} />

      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-100/80 px-5 py-4 bg-zinc-50/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white shadow-sm border border-zinc-100 group-hover/workbench:scale-110 transition-transform duration-500">
                <FlaskConical
                  className="w-5 h-5"
                  style={{ color: colors.primary }}
                />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-900 tracking-tight">
                  {toolName}智能工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  三步完成课堂预演，基于真实后端内容持续追问
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
              steps={SIMULATION_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as SimulationStep)}
              title="学情预演流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={SIMULATION_STEPS}
                  onStepChange={(stepId) =>
                    setActiveStep(stepId as SimulationStep)
                  }
                  title="学情预演流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  topic={topic}
                  intensity={intensity}
                  profile={profile}
                  teacherStrategy={teacherStrategy}
                  topicSuggestions={suggestions}
                  strategySuggestion={summary}
                  isRecommendationsLoading={isLoading}
                  onTopicChange={setTopic}
                  onIntensityChange={setIntensity}
                  onProfileChange={setProfile}
                  onTeacherStrategyChange={setTeacherStrategy}
                  onNext={() => {
                    void handlePrepareGenerate();
                  }}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  intensity={intensity}
                  profileLabel={profileLabel}
                  teacherStrategy={teacherStrategy}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  answer={answer}
                  judgeText={judgeText}
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                  isSubmittingTurn={isSubmittingTurn}
                  turnRuntimeState={turnRuntimeState}
                  turnResult={turnResult}
                  onAnswerChange={setAnswer}
                  onSubmitAnswer={() => void handleSubmitAnswer()}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
