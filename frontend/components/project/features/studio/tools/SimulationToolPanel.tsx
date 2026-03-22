"use client";

import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { WorkflowStepper } from "@/components/project/shared";
import { studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { useProjectStore } from "@/stores/projectStore";
import type { ToolPanelProps } from "./types";
import { ConfigStep } from "./simulation/ConfigStep";
import {
  DEFAULT_STUDENTS,
  getReadinessLabel,
  SIMULATION_STEPS,
  STUDENT_PROFILES,
} from "./simulation/constants";
import { GenerateStep } from "./simulation/GenerateStep";
import {
  buildJudgeComment,
  buildSimulationQuestions,
} from "./simulation/question-bank";
import { PreviewStep } from "./simulation/PreviewStep";
import type {
  SimulationQuestion,
  SimulationStep,
  StudentProfile,
} from "./simulation/types";
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
  const [topic, setTopic] = useState("牛顿第二定律边界条件");
  const [intensity, setIntensity] = useState(60);
  const [profile, setProfile] = useState<StudentProfile>("detail_oriented");
  const [includeStrategyPanel, setIncludeStrategyPanel] = useState(true);
  const [questions, setQuestions] = useState<SimulationQuestion[]>(() =>
    buildSimulationQuestions({
      topic: "牛顿第二定律边界条件",
      intensity: 60,
      profile: "detail_oriented",
      students: DEFAULT_STUDENTS,
    })
  );
  const [cursor, setCursor] = useState(0);
  const [answer, setAnswer] = useState("");
  const [judgeText, setJudgeText] = useState("");
  const [strategyOffset, setStrategyOffset] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const currentQuestion = questions[cursor] ?? null;
  const profileLabel =
    STUDENT_PROFILES.find((item) => item.value === profile)?.label ??
    "细节型学生";

  useEffect(() => {
    onDraftChange?.({
      topic,
      intensity,
      profile,
      include_strategy_panel: includeStrategyPanel,
      question_id: currentQuestion?.id ?? null,
      question: currentQuestion?.text ?? null,
      answer,
      judge_text: judgeText,
      strategy_offset: strategyOffset,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    answer,
    currentQuestion,
    flowContext?.selectedSourceId,
    includeStrategyPanel,
    intensity,
    judgeText,
    onDraftChange,
    profile,
    strategyOffset,
    topic,
  ]);

  const handleGenerate = async () => {
    const nextQuestions = buildSimulationQuestions({
      topic,
      intensity,
      profile,
      students: DEFAULT_STUDENTS,
    });
    setQuestions(nextQuestions);
    setCursor(0);
    setAnswer("");
    setJudgeText("");
    setStrategyOffset(0);

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

  const handleSubmitAnswer = async () => {
    const latestArtifactId = flowContext?.latestArtifacts?.[0]?.artifactId;
    const canUseBackendTurn =
      flowContext?.capabilityStatus === "backend_ready" &&
      Boolean(project?.id) &&
      Boolean(latestArtifactId);

    if (!answer.trim()) return;

    if (!canUseBackendTurn || !project?.id || !latestArtifactId) {
      setJudgeText(buildJudgeComment(answer, intensity));
      return;
    }

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
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}三步工作台
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                先配置学生画像，再生成提问场景，最后在面板里完成真实预演练习。
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600">
              {getReadinessLabel(flowContext?.readiness)}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="grid h-full min-h-0 gap-3 grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)]">
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
                  onStepChange={(stepId) => setActiveStep(stepId as SimulationStep)}
                  title="学情预演流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  topic={topic}
                  intensity={intensity}
                  profile={profile}
                  includeStrategyPanel={includeStrategyPanel}
                  onTopicChange={setTopic}
                  onIntensityChange={setIntensity}
                  onProfileChange={setProfile}
                  onIncludeStrategyPanelChange={setIncludeStrategyPanel}
                  onNext={() => setActiveStep("generate")}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  intensity={intensity}
                  profileLabel={profileLabel}
                  includeStrategyPanel={includeStrategyPanel}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  students={DEFAULT_STUDENTS}
                  question={currentQuestion}
                  answer={answer}
                  judgeText={judgeText}
                  includeStrategyPanel={includeStrategyPanel}
                  strategyOffset={strategyOffset}
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                  isSubmittingTurn={isSubmittingTurn}
                  onRegenerate={() => setActiveStep("generate")}
                  onAnswerChange={setAnswer}
                  onSubmitAnswer={() => void handleSubmitAnswer()}
                  onNextRound={() => {
                    setCursor((prev) => (prev + 1) % Math.max(1, questions.length));
                    setAnswer("");
                    setJudgeText("");
                  }}
                  onOpenStrategies={() => setStrategyOffset((prev) => prev + 1)}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
