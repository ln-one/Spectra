"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowStepper } from "@/components/project/shared";
import { studioCardsApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { ApiError } from "@/lib/sdk/client";
import { useProjectStore } from "@/stores/projectStore";
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

function resolveEffectiveRagSourceIds(selectedFileIds: string[]): string[] {
  const normalized = selectedFileIds.filter(
    (id) => typeof id === "string" && id.trim().length > 0
  );
  return Array.from(new Set(normalized));
}

function formatStudioTurnError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.code || "UNKNOWN_ERROR";
    const message = error.message || "Request failed";
    const details = error.details ?? {};
    const phase =
      typeof details.phase === "string" ? String(details.phase) : null;
    const reason =
      typeof details.failure_reason === "string"
        ? String(details.failure_reason)
        : null;
    const hints = [
      phase ? `phase=${phase}` : "",
      reason ? `reason=${reason}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    return hints ? `[${code}] ${message} (${hints})` : `[${code}] ${message}`;
  }
  return getErrorMessage(error);
}

export function SimulationToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const { project, activeSessionId, selectedFileIds, fetchArtifactHistory } =
    useProjectStore(
      useShallow((state) => ({
        project: state.project,
        activeSessionId: state.activeSessionId,
        selectedFileIds: state.selectedFileIds,
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
  const [turnResult, setTurnResult] = useState<{
    turnAnchor?: string;
    studentQuestion?: string;
    score?: number | null;
    nextFocus?: string;
    studentProfile?: string;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const { suggestions, summary, isLoading } = useStudioRagRecommendations({
    query:
      "Recommend classroom QA simulation topic, likely student confusion points, and teacher response strategy.",
    fallbackSuggestions: [
      "Core concept questioning",
      "Common misconception correction",
      "On-the-fly classroom diagnosis",
    ],
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
    const latestArtifactId = flowContext?.latestArtifacts?.[0]?.artifactId;
    const canUseBackendTurn =
      flowContext?.capabilityStatus === "backend_ready" &&
      Boolean(project?.id) &&
      Boolean(latestArtifactId);

    if (!answer.trim()) return;
    if (!canUseBackendTurn || !project?.id || !latestArtifactId) return;

    try {
      setIsSubmittingTurn(true);
      const effectiveRagSourceIds =
        resolveEffectiveRagSourceIds(selectedFileIds);
      const response = await studioCardsApi.turn({
        project_id: project.id,
        artifact_id: latestArtifactId,
        teacher_answer: answer,
        turn_anchor: turnResult?.turnAnchor,
        config: {
          active_student_profile: profile,
          student_profiles: [profile],
          topic,
          intensity,
          teacher_strategy: teacherStrategy,
        },
        rag_source_ids: effectiveRagSourceIds,
      });
      const latestTurnResult = response.data.turn_result;
      setJudgeText(latestTurnResult.feedback || "");
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
      await fetchArtifactHistory(project.id, activeSessionId ?? null);
    } catch (error) {
      setTurnResult(null);
      setJudgeText(`Submit failed: ${formatStudioTurnError(error)}`);
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
                  {toolName} Workbench
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  Three-step simulation flow with backend-grounded preview.
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
              title="Simulation Workflow"
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
                  title="Simulation Workflow"
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
