"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  getReadinessLabel,
  WORD_STEPS,
} from "./word/constants";
import { GenerateStep } from "./word/GenerateStep";
import { PreviewStep } from "./word/PreviewStep";
import type {
  LessonPlanDetailLevel,
  LessonPlanGradeBand,
  WordStep,
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

  const [detailLevel, setDetailLevel] =
    useState<LessonPlanDetailLevel>("standard");
  const [gradeBand, setGradeBand] = useState<LessonPlanGradeBand>("high");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [teachingContext, setTeachingContext] = useState("");
  const [studentNeeds, setStudentNeeds] = useState("");
  const [outputRequirements, setOutputRequirements] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [backendMarkdown, setBackendMarkdown] = useState("");
  const [isBackendPreviewLoading, setIsBackendPreviewLoading] = useState(false);
  const [backendPreviewError, setBackendPreviewError] = useState<string | null>(
    null
  );

  const primarySourceId = flowContext?.selectedSourceId ?? null;
  const selectedSourceIds = useMemo(
    () => (primarySourceId ? [primarySourceId] : []),
    [primarySourceId]
  );

  const { suggestions, summary, isLoading } = useStudioRagRecommendations({
    query:
      "为当前项目推荐适合生成教案的课题主题、学习目标、课堂场景和学生学习难点",
    fallbackSuggestions: ["当前项目核心主题", "课堂重点梳理", "评价任务设计"],
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
      kind: "teaching_document",
      schema_id: "lesson_plan_v1",
      schema_version: 1,
      preset: "lesson_plan",
      detail_level: detailLevel,
      grade_band: gradeBand,
      topic,
      learning_goal: goal,
      teaching_context: teachingContext,
      student_needs: studentNeeds,
      output_requirements: outputRequirements,
      primary_source_id: primarySourceId,
      selected_source_ids: selectedSourceIds,
      document_variant: "layered_lesson_plan",
      source_artifact_id: primarySourceId,
    });
  }, [
    detailLevel,
    goal,
    gradeBand,
    onDraftChange,
    outputRequirements,
    primarySourceId,
    selectedSourceIds,
    studentNeeds,
    teachingContext,
    topic,
  ]);

  useEffect(() => {
    if (activeStep !== "preview") return;
    if (!activeSessionId) return;
    if (flowContext?.capabilityStatus !== "backend_ready") return;
    const latestArtifact = flowContext?.latestArtifacts?.[0];
    const previewArtifactId =
      flowContext?.resolvedArtifact?.artifactId ?? latestArtifact?.artifactId;
    const previewRunId = latestArtifact?.runId ?? null;
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
            run_id: previewRunId ?? undefined,
            format: "markdown",
            include_sources: true,
          }
        );
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
    flowContext?.resolvedArtifact?.artifactId,
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

  const handlePrepareGenerate = async () => {
    if (!flowContext?.onPrepareGenerate) {
      setActiveStep("generate");
      return;
    }
    const prepared = await flowContext.onPrepareGenerate();
    if (!prepared) return;
    setActiveStep("generate");
  };

  const colors = TOOL_COLORS.word;

  return (
    <div
      className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/80 shadow-2xl shadow-zinc-200/30 backdrop-blur-xl group/workbench"
      style={{
        ["--project-tool-accent" as never]: colors.primary,
        ["--project-tool-accent-soft" as never]: colors.glow,
        ["--project-tool-surface" as never]: colors.soft,
      }}
    >
      <div className={cn("h-1 w-full bg-gradient-to-r", colors.gradient)} />

      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-100/80 bg-zinc-50/30 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-zinc-100 bg-white p-2 shadow-sm transition-transform duration-500 group-hover/workbench:scale-110">
                <FileText
                  className="h-5 w-5"
                  style={{ color: colors.primary }}
                />
              </div>
              <div>
                <h3 className="text-sm font-black tracking-tight text-zinc-900">
                  {toolName}工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  以右侧来源为上下文，生成、编辑并沉淀教案。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-zinc-100 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600 shadow-sm">
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
              title="教案流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={WORD_STEPS}
                  onStepChange={(stepId) => setActiveStep(stepId as WordStep)}
                  title="教案流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  detailLevel={detailLevel}
                  gradeBand={gradeBand}
                  topic={topic}
                  goal={goal}
                  teachingContext={teachingContext}
                  studentNeeds={studentNeeds}
                  outputRequirements={outputRequirements}
                  topicSuggestions={suggestions}
                  goalSuggestion={summary}
                  isRecommendationsLoading={isLoading}
                  onDetailLevelChange={setDetailLevel}
                  onGradeBandChange={setGradeBand}
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
                  detailLevel={detailLevel}
                  gradeBand={gradeBand}
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
