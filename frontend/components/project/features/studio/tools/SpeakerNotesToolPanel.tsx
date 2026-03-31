"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowStepper } from "@/components/project/shared";
import { previewApi } from "@/lib/sdk/preview";
import type { components } from "@/lib/sdk/types";
import { TOOL_COLORS } from "../constants";
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
import type {
  SourcePptSlidePreview,
  SpeakerNotesStep,
  SpeechTone,
} from "./speaker-notes/types";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

type Slide = components["schemas"]["Slide"];
type RenderedPreview = components["schemas"]["RenderedPreview"];

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
  const [sourceSlides, setSourceSlides] = useState<SourcePptSlidePreview[]>([]);
  const [isSourceSlidesLoading, setIsSourceSlidesLoading] = useState(false);
  const [sourcePreviewError, setSourcePreviewError] = useState<string | null>(
    null
  );

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
  const selectedSourceOption = useMemo(
    () => sourceOptions.find((item) => item.id === selectedDeckId) ?? null,
    [selectedDeckId, sourceOptions]
  );
  const toneLabel = getToneLabel(tone);

  useEffect(() => {
    if (!selectedDeckId) {
      setSourceSlides([]);
      setSourcePreviewError(null);
      return;
    }

    const sourceSessionId = selectedSourceOption?.sessionId ?? null;
    if (!sourceSessionId) {
      setSourceSlides([]);
      setSourcePreviewError("该课件缺少会话上下文，暂无法加载缩略图预览。");
      return;
    }

    let cancelled = false;

    const loadSourceSlides = async () => {
      setIsSourceSlidesLoading(true);
      setSourcePreviewError(null);
      try {
        const response = await previewApi.getSessionPreview(sourceSessionId, {
          artifact_id: selectedDeckId,
        });
        if (cancelled) return;
        const slides = (response.data?.slides ?? []) as Slide[];
        const renderedPreview = response.data?.rendered_preview as
          | RenderedPreview
          | undefined;
        const renderedPages = renderedPreview?.pages ?? [];
        const pageBySlideId = new Map(
          renderedPages
            .filter(
              (
                page
              ): page is NonNullable<RenderedPreview["pages"]>[number] & {
                slide_id: string;
              } => Boolean(page?.slide_id)
            )
            .map((page) => [page.slide_id, page])
        );
        const pageByIndex = new Map(
          renderedPages
            .filter(
              (
                page
              ): page is NonNullable<RenderedPreview["pages"]>[number] & {
                index: number;
              } => typeof page?.index === "number"
            )
            .map((page) => [page.index, page])
        );

        const normalizedSlides: SourcePptSlidePreview[] = slides
          .map((slide) => {
            const matchedPage =
              (slide.id ? pageBySlideId.get(slide.id) : undefined) ??
              pageByIndex.get(slide.index);
            const title =
              typeof slide.title === "string" && slide.title.trim()
                ? slide.title.trim()
                : `Slide ${slide.index + 1}`;
            const summary =
              typeof slide.content === "string" ? slide.content.trim() : "";
            return {
              page: slide.index + 1,
              title,
              summary,
              thumbnailUrl:
                matchedPage?.image_url ?? slide.thumbnail_url ?? undefined,
              imageUrl: matchedPage?.image_url ?? undefined,
              slideId: slide.id,
            };
          })
          .sort((a, b) => a.page - b.page);

        setSourceSlides(normalizedSlides);
      } catch {
        if (cancelled) return;
        setSourceSlides([]);
        setSourcePreviewError("课件预览加载失败，请稍后重试。");
      } finally {
        if (!cancelled) {
          setIsSourceSlidesLoading(false);
        }
      }
    };

    void loadSourceSlides();
    return () => {
      cancelled = true;
    };
  }, [selectedDeckId, selectedSourceOption?.sessionId]);

  useEffect(() => {
    const sourceSlideContext = sourceSlides.slice(0, 60).map((item) => ({
      page: item.page,
      title: item.title,
      summary: (item.summary || "").slice(0, 600),
    }));

    onDraftChange?.({
      source_artifact_id: selectedDeckId,
      topic,
      tone,
      emphasize_interaction: emphasizeInteraction,
      speaker_goal: speakerGoal,
      active_page: activePage,
      source_slide_count: sourceSlides.length,
      source_slide_context_json: JSON.stringify(sourceSlideContext),
    });
  }, [
    activePage,
    emphasizeInteraction,
    onDraftChange,
    selectedDeckId,
    speakerGoal,
    sourceSlides,
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

  const handlePrepareGenerate = async () => {
    if (!flowContext?.onPrepareGenerate) {
      setActiveStep("generate");
      return;
    }
    const prepared = await flowContext.onPrepareGenerate();
    if (!prepared) return;
    setActiveStep("generate");
  };

  const colors = TOOL_COLORS.summary;

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
                <FileSearch
                  className="w-5 h-5"
                  style={{ color: colors.primary }}
                />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-900 tracking-tight">
                  {toolName}智能工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  三步生成逐页讲稿 · 完美对齐课件内容
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
              steps={SPEAKER_NOTES_STEPS}
              onStepChange={(stepId) =>
                setActiveStep(stepId as SpeakerNotesStep)
              }
              title="说课讲稿流程"
              subtitle="Workflow"
            />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-4 lg:hidden">
                <WorkflowStepper
                  layout="inline"
                  currentStep={activeStep}
                  steps={SPEAKER_NOTES_STEPS}
                  onStepChange={(stepId) =>
                    setActiveStep(stepId as SpeakerNotesStep)
                  }
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
                  onNext={() => {
                    void handlePrepareGenerate();
                  }}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  selectedDeckTitle={selectedDeckTitle}
                  topic={topic}
                  toneLabel={toneLabel}
                  emphasizeInteraction={emphasizeInteraction}
                  speakerGoal={speakerGoal}
                  sourceSlides={sourceSlides}
                  isSourceSlidesLoading={isSourceSlidesLoading}
                  sourcePreviewError={sourcePreviewError}
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
                  sourceSlides={sourceSlides}
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
