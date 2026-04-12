"use client";

import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowStepper } from "@/components/project/shared";
import { TOOL_COLORS } from "../constants";
import type { ToolPanelProps } from "./types";
import { ANIMATION_STEPS, getReadinessLabel } from "./animation/constants";
import { ConfigStep } from "./animation/ConfigStep";
import { GenerateStep } from "./animation/GenerateStep";
import { PreviewStep } from "./animation/PreviewStep";
import type {
  AnimationPlacementSlot,
  AnimationRhythm,
  AnimationStylePack,
  AnimationStep,
  AnimationVisualType,
} from "./animation/types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

export function AnimationToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<AnimationStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);

  const [topic, setTopic] = useState("");
  const [focus, setFocus] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(6);
  const [rhythm, setRhythm] = useState<AnimationRhythm>("balanced");
  const [stylePack, setStylePack] = useState<AnimationStylePack>(
    "teaching_ppt_cartoon"
  );
  const [visualType, setVisualType] = useState<AnimationVisualType | null>(null);
  const [hasBootstrappedTopic, setHasBootstrappedTopic] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreparingSpec, setIsPreparingSpec] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isRecommendingPlacement, setIsRecommendingPlacement] = useState(false);
  const [isConfirmingPlacement, setIsConfirmingPlacement] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [placementRecommendation, setPlacementRecommendation] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [placementRecords, setPlacementRecords] = useState<
    Record<string, unknown>[]
  >([]);
  const [serverSpecPreview, setServerSpecPreview] = useState<
    Record<string, unknown> | null
  >(null);
  const [serverSpecCandidates, setServerSpecCandidates] = useState<
    Record<string, unknown>[]
  >([]);
  const [specConfidence, setSpecConfidence] = useState<number | null>(null);
  const [needsUserChoice, setNeedsUserChoice] = useState(false);

  const latestArtifactId = flowContext?.latestArtifacts?.[0]?.artifactId ?? null;

  const { suggestions, isLoading } = useStudioRagRecommendations({
    query: "为当前项目推荐适合做成教学动画的知识点、动态过程和重点变化。",
    fallbackSuggestions: ["概念形成过程", "变量变化关系", "关键步骤演示"],
  });

  useEffect(() => {
    if (!hasBootstrappedTopic && !topic.trim() && suggestions[0]) {
      setTopic(suggestions[0]);
      setHasBootstrappedTopic(true);
    }
  }, [hasBootstrappedTopic, suggestions, topic]);

  useEffect(() => {
    onDraftChange?.({
      topic,
      motion_brief: focus,
      duration_seconds: durationSeconds,
      rhythm,
      style_pack: stylePack,
      visual_type: visualType,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    durationSeconds,
    flowContext?.selectedSourceId,
    focus,
    onDraftChange,
    rhythm,
    stylePack,
    topic,
    visualType,
  ]);

  useEffect(() => {
    setPlacementRecommendation(null);
    setPlacementRecords([]);
  }, [latestArtifactId]);

  useEffect(() => {
    setServerSpecPreview(null);
    setServerSpecCandidates([]);
    setSpecConfidence(null);
    setNeedsUserChoice(false);
  }, [topic, focus]);

  const latestExportArtifactId =
    flowContext?.latestArtifacts?.[0]?.artifactId ?? null;

  const canOperateOnArtifact = useMemo(
    () => Boolean(latestArtifactId),
    [latestArtifactId]
  );

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
    if (!flowContext?.onPreviewExecution) {
      return;
    }
    setIsPreparingSpec(true);
    let executionPreview: Record<string, unknown> | null = null;
    try {
      executionPreview = await flowContext.onPreviewExecution();
    } finally {
      setIsPreparingSpec(false);
    }
    if (!executionPreview) return;
    const previewSpec =
      typeof executionPreview.spec_preview === "object" &&
      executionPreview.spec_preview
        ? (executionPreview.spec_preview as Record<string, unknown>)
        : null;
    const candidatesRaw = executionPreview.spec_candidates;
    const candidates = Array.isArray(candidatesRaw)
      ? candidatesRaw.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object"
        )
      : [];
    setServerSpecPreview(previewSpec);
    setServerSpecCandidates(candidates);
    setSpecConfidence(
      typeof executionPreview.spec_confidence === "number"
        ? executionPreview.spec_confidence
        : null
    );
    const previewNeedsUserChoice = Boolean(executionPreview.needs_user_choice);
    setNeedsUserChoice(previewNeedsUserChoice);
    if (!previewNeedsUserChoice && !visualType && previewSpec?.visual_type) {
      const nextVisualType = String(previewSpec.visual_type);
      if (
        nextVisualType === "process_flow" ||
        nextVisualType === "relationship_change" ||
        nextVisualType === "structure_breakdown"
      ) {
        setVisualType(nextVisualType);
      }
    }

    if (!flowContext?.onPrepareGenerate) {
      setActiveStep("generate");
      return;
    }
    const prepared = await flowContext.onPrepareGenerate();
    if (!prepared) return;
    setActiveStep("generate");
  };

  const handleStructuredRefine = async () => {
    if (!latestArtifactId || !flowContext?.onStructuredRefine) return;
    setIsRefining(true);
    try {
      const ok = await flowContext.onStructuredRefine({
        artifactId: latestArtifactId,
        message: "请根据新的参数生成一版新的 GIF 动画",
        config: {
          duration_seconds: durationSeconds,
          rhythm,
          style_pack: stylePack,
          focus,
          visual_type: visualType,
        },
      });
      if (ok) {
        setLastGeneratedAt(new Date().toISOString());
      }
    } finally {
      setIsRefining(false);
    }
  };

  const handleRecommendPlacement = async (pptArtifactId: string) => {
    if (!latestArtifactId || !flowContext?.onRecommendAnimationPlacement) return;
    setIsRecommendingPlacement(true);
    try {
      const payload = await flowContext.onRecommendAnimationPlacement({
        artifactId: latestArtifactId,
        pptArtifactId,
      });
      setPlacementRecommendation(payload ?? null);
    } finally {
      setIsRecommendingPlacement(false);
    }
  };

  const handleConfirmPlacement = async (
    pptArtifactId: string,
    pageNumbers: number[],
    slot: AnimationPlacementSlot
  ) => {
    if (!latestArtifactId || !flowContext?.onConfirmAnimationPlacement) return;
    setIsConfirmingPlacement(true);
    try {
      const payload = await flowContext.onConfirmAnimationPlacement({
        artifactId: latestArtifactId,
        pptArtifactId,
        pageNumbers,
        slot,
      });
      if (Array.isArray(payload?.placements)) {
        setPlacementRecords(
          payload.placements.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object"
          )
        );
      }
    } finally {
      setIsConfirmingPlacement(false);
    }
  };

  const colors = TOOL_COLORS.animation;

  return (
    <div
      className="project-tool-workbench h-full overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/80 shadow-2xl shadow-zinc-200/30 backdrop-blur-xl group/workbench"
      style={{
        ["--project-tool-accent" as any]: colors.primary,
        ["--project-tool-accent-soft" as any]: colors.glow,
        ["--project-tool-surface" as any]: colors.soft,
      }}
    >
      <div className={cn("h-1 w-full bg-gradient-to-r", colors.gradient)} />

      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-100/80 bg-zinc-50/30 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-zinc-100 bg-white p-2 shadow-sm transition-transform duration-500 group-hover/workbench:scale-110">
                <Play className="h-5 w-5" style={{ color: colors.primary }} />
              </div>
              <div>
                <h3 className="text-sm font-black tracking-tight text-zinc-900">
                  {toolName}工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  先描述教学需求，再按动画规格生成独立 GIF，最后决定是否插入 PPT。
                </p>
              </div>
            </div>
            <span className="rounded-full border border-zinc-100 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600 shadow-sm">
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
              steps={ANIMATION_STEPS}
              onStepChange={(stepId) => setActiveStep(stepId as AnimationStep)}
              title="动画流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={ANIMATION_STEPS}
                  onStepChange={(stepId) =>
                    setActiveStep(stepId as AnimationStep)
                  }
                  title="动画流程"
                  subtitle="Workflow"
                />
              </div>

              {activeStep === "config" ? (
                <ConfigStep
                  topic={topic}
                  focus={focus}
                  topicSuggestions={suggestions}
                  isRecommendationsLoading={isLoading}
                  onTopicChange={(value) => {
                    setHasBootstrappedTopic(true);
                    setTopic(value);
                  }}
                  onFocusChange={setFocus}
                  onNext={() => {
                    void handlePrepareGenerate();
                  }}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  focus={focus}
                  durationSeconds={durationSeconds}
                  rhythm={rhythm}
                  stylePack={stylePack}
                  visualType={visualType}
                  serverSpecPreview={serverSpecPreview}
                  serverSpecCandidates={serverSpecCandidates}
                  specConfidence={specConfidence}
                  needsUserChoice={needsUserChoice}
                  flowContext={flowContext}
                  isGenerating={isGenerating || isPreparingSpec}
                  onDurationChange={setDurationSeconds}
                  onRhythmChange={setRhythm}
                  onStylePackChange={setStylePack}
                  onVisualTypeChange={setVisualType}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  lastGeneratedAt={lastGeneratedAt}
                  durationSeconds={durationSeconds}
                  rhythm={rhythm}
                  stylePack={stylePack}
                  visualType={visualType}
                  focus={focus}
                  serverSpecPreview={serverSpecPreview}
                  flowContext={flowContext}
                  recommendation={placementRecommendation}
                  placements={placementRecords}
                  isRefining={isRefining}
                  isRecommendingPlacement={isRecommendingPlacement}
                  isConfirmingPlacement={isConfirmingPlacement}
                  onDurationChange={setDurationSeconds}
                  onRhythmChange={setRhythm}
                  onStylePackChange={setStylePack}
                  onVisualTypeChange={setVisualType}
                  onFocusChange={setFocus}
                  onRefine={() => {
                    if (canOperateOnArtifact) {
                      void handleStructuredRefine();
                    }
                  }}
                  onRecommendPlacement={(pptArtifactId) => {
                    void handleRecommendPlacement(pptArtifactId);
                  }}
                  onConfirmPlacement={(pptArtifactId, pageNumbers, slot) => {
                    void handleConfirmPlacement(pptArtifactId, pageNumbers, slot);
                  }}
                />
              ) : null}

              {activeStep === "preview" && latestExportArtifactId ? (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      void flowContext?.onExportArtifact?.(latestExportArtifactId)
                    }
                    className="text-[11px] text-zinc-500 hover:text-zinc-800"
                  >
                    导出当前 GIF
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
