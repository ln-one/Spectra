"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowStepper } from "@/components/project/shared";
import type { ToolPanelProps } from "./types";
import { ConfigStep } from "./speaker-notes/ConfigStep";
import {
  getReadinessLabel,
  getToneLabel,
  SPEAKER_NOTES_STEPS,
} from "./speaker-notes/constants";
import { GenerateStep } from "./speaker-notes/GenerateStep";
import { PreviewStep } from "./speaker-notes/PreviewStep";
import { buildSlideScripts } from "./speaker-notes/templates";
import type { SlideScriptItem, SpeakerNotesStep, SpeechTone } from "./speaker-notes/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

export function SpeakerNotesToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<SpeakerNotesStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [topic, setTopic] = useState("函数单调性公开课说课");
  const [tone, setTone] = useState<SpeechTone>("professional");
  const [emphasizeInteraction, setEmphasizeInteraction] = useState(true);
  const [scripts, setScripts] = useState<SlideScriptItem[]>(() =>
    buildSlideScripts({
      topic: "函数单调性公开课说课",
      tone: "professional",
      emphasizeInteraction: true,
    })
  );
  const [activePage, setActivePage] = useState(1);
  const [highlightTransition, setHighlightTransition] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const sourceOptions = useMemo(
    () => flowContext?.sourceOptions ?? [],
    [flowContext?.sourceOptions]
  );
  const selectedSourceId = flowContext?.selectedSourceId;
  const onSelectedSourceChange = flowContext?.onSelectedSourceChange;

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
      active_page: activePage,
      highlight_transition: highlightTransition,
    });
  }, [
    activePage,
    emphasizeInteraction,
    highlightTransition,
    onDraftChange,
    selectedDeckId,
    tone,
    topic,
  ]);

  const handleGenerate = async () => {
    const nextScripts = buildSlideScripts({ topic, tone, emphasizeInteraction });
    setScripts(nextScripts);
    setActivePage(nextScripts[0]?.page ?? 1);
    setHighlightTransition(false);

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
                先选课件，再生成逐页讲稿，最后在提词器视图里查看和微调。
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
            steps={SPEAKER_NOTES_STEPS}
            onStepChange={(stepId) => setActiveStep(stepId as SpeakerNotesStep)}
            title="说课助手流程"
            subtitle="Workflow"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {activeStep === "config" ? (
            <ConfigStep
              topic={topic}
              tone={tone}
              emphasizeInteraction={emphasizeInteraction}
              selectedDeckId={selectedDeckId}
              sourceOptions={sourceOptions}
              onTopicChange={setTopic}
              onToneChange={setTone}
              onToggleInteraction={() => setEmphasizeInteraction((prev) => !prev)}
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
              flowContext={flowContext}
              isGenerating={isGenerating}
              onBack={() => setActiveStep("config")}
              onGenerate={() => void handleGenerate()}
            />
          ) : null}

          {activeStep === "preview" ? (
            <PreviewStep
              scripts={scripts}
              activePage={activePage}
              lastGeneratedAt={lastGeneratedAt}
              highlightTransition={highlightTransition}
              flowContext={flowContext}
              onRegenerate={() => setActiveStep("generate")}
              onSelectPage={setActivePage}
              onToggleHighlight={() => setHighlightTransition((prev) => !prev)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
