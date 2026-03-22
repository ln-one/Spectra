"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowStepper } from "@/components/project/shared";
import type { ToolPanelProps } from "./types";
import {
  GAME_MODE_OPTIONS,
  GAME_STEPS,
  getReadinessLabel,
} from "./game/constants";
import { ConfigStep } from "./game/ConfigStep";
import { GenerateStep } from "./game/GenerateStep";
import { PreviewStep } from "./game/PreviewStep";
import {
  buildPseudoCode,
  buildSandboxDescription,
  buildSandboxTitle,
} from "./game/templates";
import type { GameMode, GameStep } from "./game/types";
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

export function GameToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<GameStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);
  const [topic, setTopic] = useState("工业革命关键事件");
  const [mode, setMode] = useState<GameMode>("timeline_sort");
  const [countdownInput, setCountdownInput] = useState("60");
  const [lifeInput, setLifeInput] = useState("3");
  const [ideaTags, setIdeaTags] = useState<string[]>(["30秒倒计时"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [previewCountdown, setPreviewCountdown] = useState(60);
  const [previewLife, setPreviewLife] = useState(3);

  const countdown = useMemo(
    () => clampNumber(countdownInput, 10, 180, 60),
    [countdownInput]
  );
  const life = useMemo(() => clampNumber(lifeInput, 1, 10, 3), [lifeInput]);
  const modeLabel =
    GAME_MODE_OPTIONS.find((item) => item.value === mode)?.label ??
    "时间轴排序";

  useEffect(() => {
    onDraftChange?.({
      topic,
      mode,
      countdown,
      life,
      idea_tags: ideaTags,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    countdown,
    flowContext?.selectedSourceId,
    ideaTags,
    life,
    mode,
    onDraftChange,
    topic,
  ]);

  const sandboxTitle = useMemo(
    () =>
      buildSandboxTitle({
        topic,
        mode,
        countdown: previewCountdown,
        life: previewLife,
        ideaTags,
      }),
    [ideaTags, mode, previewCountdown, previewLife, topic]
  );
  const sandboxDescription = useMemo(
    () =>
      buildSandboxDescription({
        topic,
        mode,
        countdown: previewCountdown,
        life: previewLife,
        ideaTags,
      }),
    [ideaTags, mode, previewCountdown, previewLife, topic]
  );
  const pseudoCode = useMemo(
    () =>
      buildPseudoCode({
        topic,
        mode,
        countdown: previewCountdown,
        life: previewLife,
        ideaTags,
      }),
    [ideaTags, mode, previewCountdown, previewLife, topic]
  );

  const handleToggleIdeaTag = (tag: string) => {
    setIdeaTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const resetPreviewState = () => {
    setPreviewCountdown(countdown);
    setPreviewLife(life);
  };

  const handleGenerate = async () => {
    resetPreviewState();

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
    <div className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200 bg-[linear-gradient(160deg,#ffffff,#f8fafc)] shadow-[0_22px_65px_-48px_rgba(15,23,42,0.45)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-200 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}三步工作台{" "}
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                先配置玩法，再生成小游戏，最后在面板里直接试玩和微调。{" "}
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
              steps={GAME_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as GameStep)}
              title="互动游戏流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={GAME_STEPS}
                  onStepChange={(stepId) => setActiveStep(stepId as GameStep)}
                  title="互动游戏流程"
                  subtitle="Workflow"
                />
              </div>
              {activeStep === "config" ? (
                <ConfigStep
                  topic={topic}
                  mode={mode}
                  countdown={countdownInput}
                  life={lifeInput}
                  ideaTags={ideaTags}
                  onTopicChange={setTopic}
                  onModeChange={setMode}
                  onCountdownChange={setCountdownInput}
                  onLifeChange={setLifeInput}
                  onToggleIdeaTag={handleToggleIdeaTag}
                  onNext={() => setActiveStep("generate")}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  modeLabel={modeLabel}
                  countdown={countdown}
                  life={life}
                  ideaTags={ideaTags}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  sandboxTitle={sandboxTitle}
                  sandboxDescription={sandboxDescription}
                  pseudoCode={pseudoCode}
                  countdown={previewCountdown}
                  life={previewLife}
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                  onRegenerate={() => setActiveStep("generate")}
                  onActionPenalty={() => {
                    setPreviewCountdown((prev) => Math.max(10, prev - 10));
                    setPreviewLife((prev) => Math.max(1, prev - 1));
                  }}
                  onActionReward={() => {
                    setPreviewCountdown((prev) => Math.min(180, prev + 8));
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


