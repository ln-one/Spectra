"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowStepper } from "@/components/project/shared";
import type { ToolPanelProps } from "./types";
import { ConfigStep } from "./quiz/ConfigStep";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
  getReadinessLabel,
  QUIZ_STEPS,
} from "./quiz/constants";
import { GenerateStep } from "./quiz/GenerateStep";
import { buildQuizCards, isAnswerCorrect } from "./quiz/question-bank";
import { PreviewStep } from "./quiz/PreviewStep";
import type {
  QuizCardItem,
  QuizDifficulty,
  QuizQuestionType,
  QuizStep,
} from "./quiz/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

function clampNumber(
  value: string,
  min: number,
  max: number,
  fallback: number
): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function QuizToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<QuizStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);
  const [scope, setScope] = useState("函数单调性与极值");
  const [countInput, setCountInput] = useState("5");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [questionType, setQuestionType] = useState<QuizQuestionType>("single");
  const [styleTags, setStyleTags] = useState<string[]>(["优先考易错点"]);
  const [cards, setCards] = useState<QuizCardItem[]>(() =>
    buildQuizCards(5, {
      scope: "函数单调性与极值",
      difficulty: "medium",
      questionType: "single",
      includeHumor: false,
    })
  );
  const [cursor, setCursor] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const count = useMemo(() => clampNumber(countInput, 1, 20, 5), [countInput]);
  const difficultyLabel = getDifficultyLabel(difficulty);
  const questionTypeLabel = getQuestionTypeLabel(questionType);
  const currentQuestion = cards[cursor] ?? cards[0];

  useEffect(() => {
    if (!currentQuestion) return;
    onDraftChange?.({
      scope,
      count,
      difficulty,
      question_type: questionType,
      style_tags: styleTags,
      question_id: currentQuestion.id,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    count,
    currentQuestion,
    difficulty,
    flowContext?.selectedSourceId,
    onDraftChange,
    questionType,
    scope,
    styleTags,
  ]);

  const handleToggleTag = (tag: string) => {
    setStyleTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const resetQuestionState = () => {
    setSelectedAnswers([]);
    setIsSubmitted(false);
    setIsCorrect(false);
  };

  const handleGenerate = async () => {
    const nextCards = buildQuizCards(count, {
      scope,
      difficulty,
      questionType,
      includeHumor: styleTags.includes("加入幽默干扰项"),
    });
    setCards(nextCards);
    setCursor(0);
    resetQuestionState();

    if (!flowContext?.onExecute) {
      setLastGeneratedAt(new Date().toISOString());
      setActiveStep("preview");
      return;
    }

    setIsGenerating(true);
    setActiveStep("preview");
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

  const handleToggleOption = (index: number) => {
    if (isSubmitted) return;
    if (questionType === "multiple") {
      setSelectedAnswers((prev) =>
        prev.includes(index)
          ? prev.filter((item) => item !== index)
          : [...prev, index]
      );
      return;
    }
    setSelectedAnswers([index]);
  };

  const handleSubmitAnswer = () => {
    if (!currentQuestion || selectedAnswers.length === 0) return;
    setIsCorrect(isAnswerCorrect(currentQuestion.answers, selectedAnswers));
    setIsSubmitted(true);
  };

  const handleNextQuestion = () => {
    setCursor((prev) => (prev + 1) % Math.max(1, cards.length));
    resetQuestionState();
  };

  return (
    <div className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200 bg-[linear-gradient(160deg,#ffffff,#f8fafc)] shadow-[0_22px_65px_-48px_rgba(15,23,42,0.45)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-200 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}三步工作台{" "}
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                先配置，再生成，最后在面板里用闯关模式逐题预览和讲解。{" "}
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
              steps={QUIZ_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as QuizStep)}
              title="随堂小测流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={QUIZ_STEPS}
                  onStepChange={(stepId) => setActiveStep(stepId as QuizStep)}
                  title="随堂小测流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  scope={scope}
                  countInput={countInput}
                  difficulty={difficulty}
                  questionType={questionType}
                  styleTags={styleTags}
                  onScopeChange={setScope}
                  onCountChange={setCountInput}
                  onDifficultyChange={setDifficulty}
                  onQuestionTypeChange={setQuestionType}
                  onToggleTag={handleToggleTag}
                  onNext={() => setActiveStep("generate")}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  scope={scope}
                  count={count}
                  difficultyLabel={difficultyLabel}
                  questionTypeLabel={questionTypeLabel}
                  styleTags={styleTags}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" && currentQuestion ? (
                <PreviewStep
                  question={currentQuestion}
                  questionIndex={cursor}
                  totalQuestions={cards.length}
                  questionType={questionType}
                  selectedAnswers={selectedAnswers}
                  isSubmitted={isSubmitted}
                  isCorrect={isCorrect}
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                  onRegenerate={() => setActiveStep("generate")}
                  onToggleOption={handleToggleOption}
                  onSubmitAnswer={handleSubmitAnswer}
                  onNextQuestion={handleNextQuestion}
                  onResetCurrent={resetQuestionState}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


