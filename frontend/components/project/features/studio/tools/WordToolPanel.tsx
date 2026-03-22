"use client";

import { useEffect, useState } from "react";
import { WorkflowStepper } from "@/components/project/shared";
import type { ToolPanelProps } from "./types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";
import { ConfigStep } from "./word/ConfigStep";
import { getReadinessLabel, WORD_STEPS } from "./word/constants";
import { GenerateStep } from "./word/GenerateStep";
import { PreviewStep } from "./word/PreviewStep";
import { buildWordMarkdown } from "./word/templates";
import type {
  WordDifficultyLayer,
  WordDocumentVariant,
  WordGradeBand,
  WordStep,
  WordTeachingModel,
} from "./word/types";

export function WordToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<WordStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);

  const [documentVariant, setDocumentVariant] =
    useState<WordDocumentVariant>("layered_lesson_plan");
  const [teachingModel, setTeachingModel] =
    useState<WordTeachingModel>("scaffolded");
  const [gradeBand, setGradeBand] = useState<WordGradeBand>("high");
  const [difficultyLayer, setDifficultyLayer] = useState<WordDifficultyLayer>("B");
  const [topic, setTopic] = useState("鍑芥暟鐨勫崟璋冩€?");
  const [goal, setGoal] = useState("甯姪瀛︾敓鐞嗚В鍗曡皟鍖洪棿骞惰兘瑙ｅ喅鍏稿瀷渚嬮銆?");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [previewMarkdown, setPreviewMarkdown] = useState(() =>
    buildWordMarkdown({
      topic: "鍑芥暟鐨勫崟璋冩€?",
      goal: "甯姪瀛︾敓鐞嗚В鍗曡皟鍖洪棿骞惰兘瑙ｅ喅鍏稿瀷渚嬮銆?",
      documentVariant: "layered_lesson_plan",
      teachingModel: "scaffolded",
      gradeBand: "high",
      difficultyLayer: "B",
    })
  );

  useEffect(() => {
    onDraftChange?.({
      document_variant: documentVariant,
      teaching_model:
        documentVariant === "layered_lesson_plan" ? teachingModel : null,
      grade_band: gradeBand,
      topic,
      learning_goal: goal,
      difficulty_layer:
        documentVariant === "layered_lesson_plan" ? difficultyLayer : null,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    difficultyLayer,
    documentVariant,
    flowContext?.selectedSourceId,
    goal,
    gradeBand,
    onDraftChange,
    teachingModel,
    topic,
  ]);

  const handleGenerate = async () => {
    const markdown = buildWordMarkdown({
      topic: topic.trim(),
      goal: goal.trim(),
      documentVariant,
      teachingModel,
      gradeBand,
      difficultyLayer,
    });
    setPreviewMarkdown(markdown);

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
        <div className="border-b border-zinc-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}涓夋宸ヤ綔鍙?
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                鍏堥厤缃紝鍐嶇敓鎴愶紝鏈€鍚庡湪褰撳墠闈㈡澘鍐呯洿鎺ラ槄璇绘枃妗ｅ苟缁х画寰皟銆?
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
              steps={WORD_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as WordStep)}
              title="鏂囨。鐢熸垚娴佺▼"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {activeStep === "config" ? (
                <ConfigStep
                  documentVariant={documentVariant}
                  teachingModel={teachingModel}
                  gradeBand={gradeBand}
                  difficultyLayer={difficultyLayer}
                  topic={topic}
                  goal={goal}
                  onDocumentVariantChange={setDocumentVariant}
                  onTeachingModelChange={setTeachingModel}
                  onGradeBandChange={setGradeBand}
                  onDifficultyLayerChange={setDifficultyLayer}
                  onTopicChange={setTopic}
                  onGoalChange={setGoal}
                  onNext={() => setActiveStep("generate")}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  goal={goal}
                  documentVariant={documentVariant}
                  teachingModel={teachingModel}
                  gradeBand={gradeBand}
                  difficultyLayer={difficultyLayer}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  markdown={previewMarkdown}
                  isGenerating={isGenerating}
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                  onRegenerate={() => setActiveStep("generate")}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
