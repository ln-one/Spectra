"use client";

import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { WorkflowStepper } from "@/components/project/shared";
import { previewApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { useProjectStore } from "@/stores/projectStore";
import type { ToolPanelProps } from "./types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";
import { useWorkflowStepSync } from "./useWorkflowStepSync";
import { ConfigStep } from "./word/ConfigStep";
import { getReadinessLabel, WORD_STEPS } from "./word/constants";
import { GenerateStep } from "./word/GenerateStep";
import { PreviewStep } from "./word/PreviewStep";
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
  const { activeSessionId } = useProjectStore(
    useShallow((state) => ({
      activeSessionId: state.activeSessionId,
    }))
  );
  const [activeStep, setActiveStep] = useState<WordStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);

  const [documentVariant, setDocumentVariant] = useState<WordDocumentVariant>(
    "layered_lesson_plan"
  );
  const [teachingModel, setTeachingModel] =
    useState<WordTeachingModel>("scaffolded");
  const [gradeBand, setGradeBand] = useState<WordGradeBand>("high");
  const [difficultyLayer, setDifficultyLayer] =
    useState<WordDifficultyLayer>("B");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [teachingContext, setTeachingContext] = useState("");
  const [studentNeeds, setStudentNeeds] = useState("");
  const [outputRequirements, setOutputRequirements] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [backendMarkdown, setBackendMarkdown] = useState("");
  const [isBackendPreviewLoading, setIsBackendPreviewLoading] = useState(false);
  const [backendPreviewError, setBackendPreviewError] = useState<string | null>(null);

  const { suggestions, summary, isLoading } = useStudioRagRecommendations({
    query: "为当前项目推荐适合生成教学文档的课题主题、学习目标、教学场景和学生难点",
    fallbackSuggestions: ["当前项目核心主题", "知识重点梳理", "课堂巩固任务"],
  });

  useEffect(() => {
    if (!topic.trim() && suggestions[0]) {
      setTopic(suggestions[0]);
    }
  }, [suggestions, topic]);

  useEffect(() => {
    if (!goal.trim() && summary) {
      setGoal(summary);
    }
  }, [goal, summary]);

  useEffect(() => {
    onDraftChange?.({
      document_variant: documentVariant,
      teaching_model:
        documentVariant === "layered_lesson_plan" ? teachingModel : null,
      grade_band: gradeBand,
      topic,
      learning_goal: goal,
      teaching_context: teachingContext,
      student_needs: studentNeeds,
      output_requirements: outputRequirements,
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
    outputRequirements,
    studentNeeds,
    teachingContext,
    teachingModel,
    topic,
  ]);

  useEffect(() => {
    if (activeStep !== "preview") return;
    if (!activeSessionId) return;
    if (flowContext?.capabilityStatus !== "backend_ready") return;
    const latestArtifactId = flowContext.latestArtifacts?.[0]?.artifactId;
    if (!latestArtifactId) return;

    let cancelled = false;
    const loadBackendPreview = async () => {
      try {
        setIsBackendPreviewLoading(true);
        setBackendPreviewError(null);
        const response = await previewApi.exportSessionPreview(activeSessionId, {
          artifact_id: latestArtifactId,
          format: "markdown",
          include_sources: true,
        });
        if (cancelled) return;
        setBackendMarkdown(response.data.content || "");
      } catch (error) {
        if (cancelled) return;
        setBackendPreviewError(getErrorMessage(error));
        setBackendMarkdown("");
      } finally {
        if (!cancelled) {
          setIsBackendPreviewLoading(false);
        }
      }
    };

    void loadBackendPreview();
    return () => {
      cancelled = true;
    };
  }, [
    activeSessionId,
    activeStep,
    flowContext?.capabilityStatus,
    flowContext?.latestArtifacts,
  ]);

  const handleGenerate = async () => {
    setBackendMarkdown("");
    setBackendPreviewError(null);
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
        <div className="border-b border-zinc-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}三步工作台
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                配置页会优先读取当前知识库推荐，预览页只展示后端真实文档结果。
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
              steps={WORD_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as WordStep)}
              title="文档生成流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={WORD_STEPS}
                  onStepChange={(stepId) => setActiveStep(stepId as WordStep)}
                  title="文档生成流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  documentVariant={documentVariant}
                  teachingModel={teachingModel}
                  gradeBand={gradeBand}
                  difficultyLayer={difficultyLayer}
                  topic={topic}
                  goal={goal}
                  teachingContext={teachingContext}
                  studentNeeds={studentNeeds}
                  outputRequirements={outputRequirements}
                  topicSuggestions={suggestions}
                  goalSuggestion={summary}
                  isRecommendationsLoading={isLoading}
                  onDocumentVariantChange={setDocumentVariant}
                  onTeachingModelChange={setTeachingModel}
                  onGradeBandChange={setGradeBand}
                  onDifficultyLayerChange={setDifficultyLayer}
                  onTopicChange={setTopic}
                  onGoalChange={setGoal}
                  onTeachingContextChange={setTeachingContext}
                  onStudentNeedsChange={setStudentNeeds}
                  onOutputRequirementsChange={setOutputRequirements}
                  onNext={() => setActiveStep("generate")}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  goal={goal}
                  teachingContext={teachingContext}
                  studentNeeds={studentNeeds}
                  outputRequirements={outputRequirements}
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
                  markdown={backendMarkdown}
                  isGenerating={isGenerating}
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                  isBackendPreviewLoading={isBackendPreviewLoading}
                  backendPreviewError={backendPreviewError}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
