"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GENERATION_TOOLS } from "@/stores/projectStore";
import type { GenerationToolType } from "@/lib/project-space/artifact-history";
import type { ToolArtifactPreviewItem } from "../../tools";
import type { StudioHistoryItem } from "../../history/types";

const JOURNEY_STEPS: Array<{
  cardId: string;
  toolId: GenerationToolType;
  label: string;
}> = [
  { cardId: "courseware_ppt", toolId: "ppt", label: "PPT" },
  { cardId: "speaker_notes", toolId: "summary", label: "讲稿备注" },
  { cardId: "word_document", toolId: "word", label: "教学文档" },
  { cardId: "interactive_quick_quiz", toolId: "quiz", label: "随堂小测" },
  { cardId: "knowledge_mindmap", toolId: "mindmap", label: "知识导图" },
  { cardId: "classroom_qa_simulator", toolId: "handout", label: "学情预演" },
];

const RECOMMENDATION_RULES: Partial<Record<string, GenerationToolType[]>> = {
  courseware_ppt: ["summary", "word"],
  speaker_notes: ["word", "quiz", "mindmap"],
  word_document: ["handout"],
  interactive_quick_quiz: ["handout"],
  knowledge_mindmap: ["handout"],
};

const EXTENSION_STEPS = [
  { label: "演示动画", description: "PPT 扩展演示支路" },
  { label: "互动游戏", description: "文档 / 小测扩展互动支路" },
];

function inferCurrentCardId(
  currentCardId: string | null,
  _latestArtifacts: ToolArtifactPreviewItem[],
  groupedHistory: Array<[string, StudioHistoryItem[]]>
): string {
  if (currentCardId) return currentCardId;

  const latestGroup = groupedHistory.find(([, items]) => items.length > 0)?.[0] ?? null;
  if (latestGroup === "ppt") return "courseware_ppt";
  if (latestGroup === "summary") return "speaker_notes";
  if (latestGroup === "word") return "word_document";
  if (latestGroup === "quiz") return "interactive_quick_quiz";
  if (latestGroup === "mindmap") return "knowledge_mindmap";
  if (latestGroup === "handout") return "classroom_qa_simulator";
  return "courseware_ppt";
}

function inferCurrentToolType(
  currentCardId: string,
  groupedHistory: Array<[string, StudioHistoryItem[]]>
): GenerationToolType {
  const matched = JOURNEY_STEPS.find((item) => item.cardId === currentCardId);
  if (matched) return matched.toolId;
  return groupedHistory.find(([, items]) => items.length > 0)?.[0] as GenerationToolType ?? "ppt";
}

function getRecommendationLabel(toolId: GenerationToolType): string {
  return GENERATION_TOOLS.find((tool) => tool.type === toolId)?.name ?? toolId;
}

interface StudioJourneyGuideProps {
  currentCardId: string | null;
  selectedSourceId: string | null;
  latestArtifacts: ToolArtifactPreviewItem[];
  groupedHistory: Array<[string, StudioHistoryItem[]]>;
  onToolClick: (toolId: GenerationToolType) => void;
}

export function StudioJourneyGuide({
  currentCardId,
  selectedSourceId,
  latestArtifacts,
  groupedHistory,
  onToolClick,
}: StudioJourneyGuideProps) {
  const activeCardId = inferCurrentCardId(
    currentCardId,
    latestArtifacts,
    groupedHistory
  );
  const activeToolId = inferCurrentToolType(activeCardId, groupedHistory);
  const recommendedTools =
    RECOMMENDATION_RULES[activeCardId]?.map((toolId) =>
      GENERATION_TOOLS.find((tool) => tool.type === toolId)
    ).filter(Boolean) ?? [];

  return (
    <div className="mb-3 space-y-3 rounded-2xl border border-[var(--project-border)] bg-[var(--project-surface-muted)] p-3">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-xs font-semibold text-[var(--project-text-primary)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--project-accent)]" />
          成果链导览
        </p>
        <p className="text-[11px] text-[var(--project-text-muted)]">
          从课件到讲稿、文档、小测、导图，再到课堂预演，按同一项目链路继续推进。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {JOURNEY_STEPS.map((step, index) => {
          const isActive = step.cardId === activeCardId;
          const isCompleted =
            JOURNEY_STEPS.findIndex((item) => item.cardId === activeCardId) > index;
          return (
            <div key={step.cardId} className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  isActive
                    ? "border-sky-300 bg-sky-50 text-sky-700"
                    : isCompleted
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-[var(--project-border)] bg-[var(--project-surface-elevated)] text-[var(--project-text-muted)]"
                )}
              >
                {step.label}
              </span>
              {index < JOURNEY_STEPS.length - 1 ? (
                <ArrowRight className="h-3.5 w-3.5 text-[var(--project-text-muted)]" />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--project-border)] bg-[var(--project-surface-elevated)] px-3 py-2">
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-[var(--project-text-primary)]">
            当前阶段：{getRecommendationLabel(activeToolId)}
          </p>
          <p className="text-[11px] text-[var(--project-text-muted)]">
            {selectedSourceId
              ? "当前已绑定来源成果，可沿成果链继续推进。"
              : "当前可从最近成果继续推进，也可以先绑定来源成果增强后续结果。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {recommendedTools.length > 0 ? (
            recommendedTools.map((tool) => (
              <Button
                key={tool!.type}
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => onToolClick(tool!.type as GenerationToolType)}
              >
                打开{tool!.name}
              </Button>
            ))
          ) : (
            <span className="text-[11px] text-[var(--project-text-muted)]">
              当前已经来到成果链后段，可继续回到任一模板卡打磨内容。
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-[11px] font-medium text-amber-800">扩展演示能力</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXTENSION_STEPS.map((item) => (
            <span
              key={item.label}
              className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] text-amber-700"
              title={item.description}
            >
              {item.label}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-amber-700/90">
          这两张卡用于扩展演示效果，不进入当前 5 张成熟模板卡的主成果链推荐。
        </p>
      </div>
    </div>
  );
}
