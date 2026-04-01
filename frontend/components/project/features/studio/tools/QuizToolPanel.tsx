"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowStepper } from "@/components/project/shared";
import { TOOL_COLORS } from "../constants";
import type { ToolPanelProps } from "./types";
import { ConfigStep } from "./quiz/ConfigStep";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
  getReadinessLabel,
  QUIZ_STEPS,
} from "./quiz/constants";
import { GenerateStep } from "./quiz/GenerateStep";
import { PreviewStep } from "./quiz/PreviewStep";
import type { QuizDifficulty, QuizQuestionType, QuizStep } from "./quiz/types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";
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
  const [scope, setScope] = useState("");
  const [countInput, setCountInput] = useState("5");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [questionType, setQuestionType] = useState<QuizQuestionType>("single");
  const [styleTags, setStyleTags] = useState<string[]>(["优先考易错点"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const { suggestions, isLoading } = useStudioRagRecommendations({
    query: "为当前项目推荐适合随堂小测的重点考查范围、易错点和典型题型",
    fallbackSuggestions: ["当前项目核心概念", "高频易错点", "关键例题变式"],
  });

  useEffect(() => {
    if (!scope.trim() && suggestions[0]) {
      setScope(suggestions[0]);
    }
  }, [scope, suggestions]);

  const count = useMemo(() => clampNumber(countInput, 1, 20, 5), [countInput]);
  const difficultyLabel = getDifficultyLabel(difficulty);
  const questionTypeLabel = getQuestionTypeLabel(questionType);

  useEffect(() => {
    onDraftChange?.({
      scope,
      count,
      difficulty,
      question_type: questionType,
      style_tags: styleTags,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    count,
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

  const handlePrepareGenerate = async () => {
    if (!flowContext?.onPrepareGenerate) {
      setActiveStep("generate");
      return;
    }
    const prepared = await flowContext.onPrepareGenerate();
    if (!prepared) return;
    setActiveStep("generate");
  };

  const colors = TOOL_COLORS.quiz;

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
                <CheckSquare
                  className="w-5 h-5"
                  style={{ color: colors.primary }}
                />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-900 tracking-tight">
                  {toolName}智能工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  三步生成优质随堂测评 · 实时预览题目解析
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
                  scopeSuggestions={suggestions}
                  isRecommendationsLoading={isLoading}
                  onScopeChange={setScope}
                  onCountChange={setCountInput}
                  onDifficultyChange={setDifficulty}
                  onQuestionTypeChange={setQuestionType}
                  onToggleTag={handleToggleTag}
                  onNext={() => {
                    void handlePrepareGenerate();
                  }}
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
