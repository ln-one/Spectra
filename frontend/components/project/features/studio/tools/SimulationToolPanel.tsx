"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { WorkflowStepper } from "@/components/project/shared";
import { studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { useProjectStore } from "@/stores/projectStore";
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
  const { project, activeSessionId, fetchArtifactHistory } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      activeSessionId: state.activeSessionId,
      fetchArtifactHistory: state.fetchArtifactHistory,
    }))
  );

  const [activeStep, setActiveStep] = useState<SimulationStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);

  const [topic, setTopic] = useState("");
  const [intensity, setIntensity] = useState(60);
  const [profile, setProfile] = useState<StudentProfile>("detail_oriented");
  const [teacherStrategy, setTeacherStrategy] = useState("");
  const [answer, setAnswer] = useState("");
  const [judgeText, setJudgeText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const { suggestions, summary, isLoading } = useStudioRagRecommendations({
    query:
      "为当前项目推荐适合课堂问答预演的主题、学生疑问点、追问方向和教师应对策略",
    fallbackSuggestions: ["核心概念追问", "常见误区澄清", "课堂即时纠错"],
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
      STUDENT_PROFILES.find((item) => item.value === profile)?.label ?? "细节型学生",
    [profile]
  );

  useEffect(() => {
    onDraftChange?.({
      topic,
      intensity,
      profile,
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

  const handleSubmitAnswer = async () => {
    const latestArtifactId = flowContext?.latestArtifacts?.[0]?.artifactId;
    const canUseBackendTurn =
      flowContext?.capabilityStatus === "backend_ready" &&
      Boolean(project?.id) &&
      Boolean(latestArtifactId);

    if (!answer.trim()) return;
    if (!canUseBackendTurn || !project?.id || !latestArtifactId) return;

    try {
      setIsSubmittingTurn(true);
      const response = await studioCardsApi.turn({
        project_id: project.id,
        artifact_id: latestArtifactId,
        teacher_answer: answer,
      });
      setJudgeText(response.data.turn_result.feedback);
      await fetchArtifactHistory(project.id, activeSessionId ?? null);
    } catch (error) {
      setJudgeText(`提交失败：${getErrorMessage(error)}`);
    } finally {
      setIsSubmittingTurn(false);
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
                配置页使用知识库推荐问答主题，预览页只显示后端返回的真实问答预演。
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
              steps={SIMULATION_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as SimulationStep)}
              title="问答预演流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={SIMULATION_STEPS}
                  onStepChange={(stepId) => setActiveStep(stepId as SimulationStep)}
                  title="问答预演流程"
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
                  onNext={() => setActiveStep("generate")}
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