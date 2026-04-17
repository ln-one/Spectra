"use client";

import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { WorkflowStepper } from "@/components/project/shared";
import { previewApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { useProjectStore } from "@/stores/projectStore";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_COLORS } from "../constants";
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
  const hasRequestedInitialSourcesRef = useRef(false);
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
  const [backendPreviewHtml, setBackendPreviewHtml] = useState("");
  const [backendMarkdown, setBackendMarkdown] = useState("");
  const [isBackendPreviewLoading, setIsBackendPreviewLoading] = useState(false);
  const [backendPreviewError, setBackendPreviewError] = useState<string | null>(
    null
  );
  const autoLoadSources = flowContext?.onLoadSources;
  const requiresSourceArtifact = Boolean(flowContext?.requiresSourceArtifact);
  const sourceOptionCount = flowContext?.sourceOptions?.length ?? 0;
  const isProtocolLoading = Boolean(flowContext?.isLoadingProtocol);
  const isActionRunning = Boolean(flowContext?.isActionRunning);

  const { suggestions, summary, isLoading } = useStudioRagRecommendations({
    query:
      "为当前项目推荐适合生成教学文档的课题主题、学习目标、教学场景和学生难点",
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
    hasRequestedInitialSourcesRef.current = false;
  }, [activeSessionId]);

  useEffect(() => {
    if (hasRequestedInitialSourcesRef.current) return;
    if (!flowContext?.requiresSourceArtifact) return;
    if (!flowContext.onLoadSources) return;
    if ((flowContext.sourceOptions ?? []).length > 0) return;
    hasRequestedInitialSourcesRef.current = true;
    void flowContext.onLoadSources();
  }, [
    flowContext?.onLoadSources,
    flowContext?.requiresSourceArtifact,
    flowContext?.sourceOptions,
  ]);

  useEffect(() => {
    if (activeStep !== "preview") return;
    if (!activeSessionId) return;
    if (flowContext?.capabilityStatus !== "backend_ready") return;
    const latestArtifact = flowContext?.latestArtifacts?.[0];
    const previewArtifactId =
      flowContext?.resolvedArtifact?.artifactId ?? latestArtifact?.artifactId;
    if (!previewArtifactId) return;

    let cancelled = false;
    const loadBackendPreview = async () => {
      try {
        setIsBackendPreviewLoading(true);
        setBackendPreviewError(null);
        const response = await previewApi.exportSessionPreview(
          activeSessionId,
          {
            artifact_id: previewArtifactId,
            format: "html",
            include_sources: true,
          }
        );
        if (cancelled) return;
        const payload = response.data.content || "";
        if (response.data.format === "html") {
          setBackendPreviewHtml(payload);
          setBackendMarkdown("");
        } else {
          setBackendPreviewHtml("");
          setBackendMarkdown(payload);
        }
      } catch (error) {
        if (cancelled) return;
        setBackendPreviewError(getErrorMessage(error));
        setBackendPreviewHtml("");
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
    flowContext?.resolvedArtifact?.artifactId,
  ]);

  useEffect(() => {
    if (activeStep !== "generate") return;
    if (!requiresSourceArtifact) return;
    if (sourceOptionCount > 0) return;
    if (isProtocolLoading || isActionRunning) return;
    void autoLoadSources?.();
  }, [
    activeStep,
    autoLoadSources,
    isActionRunning,
    isProtocolLoading,
    requiresSourceArtifact,
    sourceOptionCount,
  ]);

  const handleGenerate = async () => {
    setBackendPreviewHtml("");
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

  const handlePrepareGenerate = () => {
    setActiveStep("generate");
  };

  const colors = TOOL_COLORS.word;

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
                <FileText
                  className="w-5 h-5"
                  style={{ color: colors.primary }}
                />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-900 tracking-tight">
                  {toolName}智能工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  三步生成专业教学文档 · 实时预览 AIGC 成果
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
                  onNext={() => {
                    void handlePrepareGenerate();
                  }}
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
                  html={backendPreviewHtml}
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
