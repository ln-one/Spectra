"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowStepper } from "@/components/project/shared";
import type { ToolPanelProps } from "./types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";
import { ConfigStep } from "./speaker-notes/ConfigStep";
import {
  getReadinessLabel,
  getToneLabel,
  SPEAKER_NOTES_STEPS,
} from "./speaker-notes/constants";
import { GenerateStep } from "./speaker-notes/GenerateStep";
import { PreviewStep } from "./speaker-notes/PreviewStep";
import type { SpeakerNotesStep, SpeechTone } from "./speaker-notes/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

export function SpeakerNotesToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<SpeakerNotesStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);

  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<SpeechTone>("professional");
  const [emphasizeInteraction, setEmphasizeInteraction] = useState(true);
  const [speakerGoal, setSpeakerGoal] = useState("");
  const [activePage, setActivePage] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const sourceOptions = useMemo(
    () => flowContext?.sourceOptions ?? [],
    [flowContext?.sourceOptions]
  );
  const selectedSourceId = flowContext?.selectedSourceId;
  const onSelectedSourceChange = flowContext?.onSelectedSourceChange;

  const { suggestions, summary, isLoading } = useStudioRagRecommendations({
    query:
      "为当前项目推荐适合生成说课讲稿的课件主题、说课目标、教学亮点和师生互动重点",
    fallbackSuggestions: ["核心概念梳理", "重难点突破", "课堂互动设计"],
  });

  useEffect(() => {
    if (selectedDeckId) return;
    if (selectedSourceId) {
      setSelectedDeckId(selectedSourceId);
      return;
    }
    if (sourceOptions.length > 0) {
      const firstSourceId = sourceOptions[0]?.id ?? null;
      setSelectedDeckId(firstSourceId);
      onSelectedSourceChange?.(firstSourceId);
    }
  }, [onSelectedSourceChange, selectedDeckId, selectedSourceId, sourceOptions]);

  useEffect(() => {
    if (!topic.trim() && suggestions[0]) {
      setTopic(suggestions[0]);
    }
  }, [suggestions, topic]);

  useEffect(() => {
    if (!speakerGoal.trim() && summary) {
      setSpeakerGoal(summary);
    }
  }, [speakerGoal, summary]);

  const selectedDeckTitle = useMemo(
    () => sourceOptions.find((item) => item.id === selectedDeckId)?.title ?? "",
    [selectedDeckId, sourceOptions]
  );
  const toneLabel = getToneLabel(tone);

  useEffect(() => {
    onDraftChange?.({
      source_artifact_id: selectedDeckId,
      topic,
      tone,
      emphasize_interaction: emphasizeInteraction,
      speaker_goal: speakerGoal,
      active_page: activePage,
    });
  }, [
    activePage,
    emphasizeInteraction,
    onDraftChange,
    selectedDeckId,
    speakerGoal,
    tone,
    topic,
  ]);

  const handleGenerate = async () => {
    setActivePage(1);
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
        <div className="border-b border-zinc-200 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">{toolName}三步工作台</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                配置页优先读取知识库推荐，预览页只显示后端返回的真实逐页讲稿。
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
              steps={SPEAKER_NOTES_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as SpeakerNotesStep)}
              title="说课讲稿流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={SPEAKER_NOTES_STEPS}
                  onStepChange={(stepId) => setActiveStep(stepId as SpeakerNotesStep)}
                  title="说课讲稿流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  topic={topic}
                  tone={tone}
                  emphasizeInteraction={emphasizeInteraction}
                  speakerGoal={speakerGoal}
                  topicSuggestions={suggestions}
                  goalSuggestion={summary}
                  isRecommendationsLoading={isLoading}
                  selectedDeckId={selectedDeckId}
                  sourceOptions={sourceOptions}
                  onTopicChange={setTopic}
                  onToneChange={setTone}
                  onSpeakerGoalChange={setSpeakerGoal}
                  onToggleInteraction={() =>
                    setEmphasizeInteraction((prev) => !prev)
                  }
                  onSelectedDeckChange={(value) => {
                    setSelectedDeckId(value);
                    onSelectedSourceChange?.(value);
                  }}
                  onRefreshSources={() => void flowContext?.onLoadSources?.()}
                  isRefreshing={
                    Boolean(flowContext?.isLoadingProtocol) ||
                    Boolean(flowContext?.isActionRunning)
                  }
                  onNext={() => setActiveStep("generate")}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  selectedDeckTitle={selectedDeckTitle}
                  topic={topic}
                  toneLabel={toneLabel}
                  emphasizeInteraction={emphasizeInteraction}
                  speakerGoal={speakerGoal}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  activePage={activePage}
                  lastGeneratedAt={lastGeneratedAt}
                  highlightTransition={false}
                  flowContext={flowContext}
                  onSelectPage={setActivePage}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}