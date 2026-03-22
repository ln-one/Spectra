"use client";

import { useEffect, useState } from "react";
import { WorkflowStepper } from "@/components/project/shared";
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
import type { SimulationQuestion, SimulationStep, StudentProfile } from "./simulation/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

export function SimulationToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
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
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const currentQuestion = questions[cursor] ?? null;
  const profileLabel =
    STUDENT_PROFILES.find((item) => item.value === profile)?.label ?? "细节型理科生";

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

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-zinc-200 bg-[linear-gradient(160deg,#ffffff,#f8fafc)] shadow-[0_22px_65px_-48px_rgba(15,23,42,0.45)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-200 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}三步工作台
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                先配置学生画像，再生成提问场景，最后在群聊面板里完成预演训练。
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600">
              {getReadinessLabel(flowContext?.readiness)}
            </span>
          </div>

          <WorkflowStepper
            className="mt-3"
            layout="inline"
            currentStep={activeStep}
            steps={SIMULATION_STEPS}
            onStepChange={(stepId) => setActiveStep(stepId as SimulationStep)}
            title="学情预演流程"
            subtitle="Workflow"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
              onRegenerate={() => setActiveStep("generate")}
              onAnswerChange={setAnswer}
              onSubmitAnswer={() => setJudgeText(buildJudgeComment(answer, intensity))}
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
  );
}
