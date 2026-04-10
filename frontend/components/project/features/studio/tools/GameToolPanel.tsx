"use client";

import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowStepper } from "@/components/project/shared";
import { TOOL_COLORS } from "../constants";
import type { ToolPanelProps } from "./types";
import { ConfigStep } from "./game/ConfigStep";
import { GAME_STEPS, getReadinessLabel } from "./game/constants";
import { GenerateStep } from "./game/GenerateStep";
import { PreviewStep } from "./game/PreviewStep";
import type { GameMode, GameStep } from "./game/types";
import { useStudioRagRecommendations } from "./useStudioRagRecommendations";
import { useWorkflowStepSync } from "./useWorkflowStepSync";

interface GamePatternOption {
  value: GameMode;
  label: string;
}

const GAME_PATTERN_LABELS: Record<GameMode, string> = {
  timeline_sort: "时间轴排序",
  concept_match: "概念连线",
  quiz_challenge: "知识闯关",
  fill_in_blank: "填空挑战",
  freeform: "自由发挥",
};

const DEFAULT_GAME_PATTERN_OPTIONS: GamePatternOption[] = [
  { value: "timeline_sort", label: GAME_PATTERN_LABELS.timeline_sort },
  { value: "concept_match", label: GAME_PATTERN_LABELS.concept_match },
  { value: "quiz_challenge", label: GAME_PATTERN_LABELS.quiz_challenge },
  { value: "fill_in_blank", label: GAME_PATTERN_LABELS.fill_in_blank },
  { value: "freeform", label: GAME_PATTERN_LABELS.freeform },
];

function toGameMode(value: string): GameMode | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "timeline_sort") return "timeline_sort";
  if (normalized === "concept_match") return "concept_match";
  if (normalized === "quiz_challenge") return "quiz_challenge";
  if (normalized === "fill_in_blank") return "fill_in_blank";
  if (normalized === "freeform") return "freeform";
  return null;
}

function parseGamePatternOptions(
  cardConfigFields?: Array<Record<string, unknown>>
): GamePatternOption[] {
  if (!Array.isArray(cardConfigFields)) return DEFAULT_GAME_PATTERN_OPTIONS;
  const patternField = cardConfigFields.find(
    (field) =>
      typeof field?.key === "string" && field.key.toLowerCase() === "game_pattern"
  );
  if (!patternField || !Array.isArray(patternField.options)) {
    return DEFAULT_GAME_PATTERN_OPTIONS;
  }

  const parsed = patternField.options
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const rawValue = String(
        (option as Record<string, unknown>).value ?? ""
      ).trim();
      const mode = toGameMode(rawValue);
      if (!mode) return null;
      const rawLabel = String(
        (option as Record<string, unknown>).label ?? ""
      ).trim();
      return {
        value: mode,
        label: rawLabel || GAME_PATTERN_LABELS[mode],
      };
    })
    .filter((item): item is GamePatternOption => Boolean(item));

  if (!parsed.length) return DEFAULT_GAME_PATTERN_OPTIONS;
  return parsed;
}

function buildIdeaTags(playerGoal: string, mechanicsNotes: string): string[] {
  const raw = `${playerGoal}\n${mechanicsNotes}`;
  const tokens = raw
    .split(/[\n,，。；;、]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 24);
  return [...new Set(tokens)].slice(0, 4);
}

export function GameToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<GameStep>("config");
  useWorkflowStepSync(activeStep, setActiveStep, flowContext);
  const [topic, setTopic] = useState("");
  const [gamePattern, setGamePattern] = useState<GameMode>("timeline_sort");
  const [playerGoal, setPlayerGoal] = useState("");
  const [mechanicsNotes, setMechanicsNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const gamePatternOptions = parseGamePatternOptions(flowContext?.cardConfigFields);
  const selectedGamePatternLabel =
    gamePatternOptions.find((item) => item.value === gamePattern)?.label ??
    GAME_PATTERN_LABELS[gamePattern];

  const { suggestions, summary, isLoading } = useStudioRagRecommendations({
    query: "为当前项目推荐适合生成课堂互动游戏的主题、玩法方向和闯关目标",
    fallbackSuggestions: ["概念辨析", "因果链排序", "实验现象判断"],
  });

  useEffect(() => {
    if (!topic.trim() && suggestions[0]) {
      setTopic(suggestions[0]);
    }
  }, [suggestions, topic]);

  useEffect(() => {
    if (!gamePatternOptions.length) return;
    const exists = gamePatternOptions.some((item) => item.value === gamePattern);
    if (exists) return;
    setGamePattern(gamePatternOptions[0].value);
  }, [gamePattern, gamePatternOptions]);

  useEffect(() => {
    const creativeBrief = [selectedGamePatternLabel, summary, playerGoal, mechanicsNotes]
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n");
    const ideaTags = buildIdeaTags(playerGoal, mechanicsNotes);
    onDraftChange?.({
      topic,
      creative_direction: selectedGamePatternLabel,
      player_goal: playerGoal,
      mechanics_notes: mechanicsNotes,
      game_pattern: gamePattern,
      mode: gamePattern,
      creative_brief: creativeBrief || selectedGamePatternLabel,
      countdown: 60,
      life: 3,
      idea_tags: ideaTags,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    flowContext?.selectedSourceId,
    gamePattern,
    mechanicsNotes,
    onDraftChange,
    playerGoal,
    selectedGamePatternLabel,
    summary,
    topic,
  ]);

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
    if (!flowContext?.onPrepareGenerate) {
      setActiveStep("generate");
      return;
    }
    const prepared = await flowContext.onPrepareGenerate();
    if (!prepared) return;
    setActiveStep("generate");
  };

  const colors = TOOL_COLORS.game;

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
                <Gamepad2
                  className="w-5 h-5"
                  style={{ color: colors.primary }}
                />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-900 tracking-tight">
                  {toolName}智能工作台
                </h3>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-zinc-500">
                  三步生成趣味课堂游戏 · 激发学生学习兴趣
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
                  gamePattern={gamePattern}
                  gamePatternOptions={gamePatternOptions}
                  playerGoal={playerGoal}
                  mechanicsNotes={mechanicsNotes}
                  topicSuggestions={suggestions}
                  isRecommendationsLoading={isLoading}
                  onTopicChange={setTopic}
                  onGamePatternChange={setGamePattern}
                  onPlayerGoalChange={setPlayerGoal}
                  onMechanicsNotesChange={setMechanicsNotes}
                  onNext={() => {
                    void handlePrepareGenerate();
                  }}
                />
              ) : null}

              {activeStep === "generate" ? (
                <GenerateStep
                  topic={topic}
                  creativeDirection={selectedGamePatternLabel}
                  playerGoal={playerGoal}
                  mechanicsNotes={mechanicsNotes}
                  flowContext={flowContext}
                  isGenerating={isGenerating}
                  onBack={() => setActiveStep("config")}
                  onGenerate={() => void handleGenerate()}
                />
              ) : null}

              {activeStep === "preview" ? (
                <PreviewStep
                  lastGeneratedAt={lastGeneratedAt}
                  flowContext={flowContext}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
