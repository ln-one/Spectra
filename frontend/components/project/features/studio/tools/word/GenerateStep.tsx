import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDetailLevelLabel,
  getGradeBandLabel,
} from "./constants";
import type { ToolFlowContext } from "../types";
import type {
  LessonPlanDetailLevel,
  LessonPlanGradeBand,
} from "./types";

interface GenerateStepProps {
  topic: string;
  goal: string;
  teachingContext: string;
  studentNeeds: string;
  outputRequirements: string;
  detailLevel: LessonPlanDetailLevel;
  gradeBand: LessonPlanGradeBand;
  flowContext?: ToolFlowContext;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
}

export function GenerateStep({
  topic,
  goal,
  teachingContext,
  studentNeeds,
  outputRequirements,
  detailLevel,
  gradeBand,
  flowContext,
  isGenerating,
  onBack,
  onGenerate,
}: GenerateStepProps) {
  const requiresSourceArtifact = Boolean(flowContext?.requiresSourceArtifact);
  const missingRequiredSource =
    requiresSourceArtifact && !flowContext?.selectedSourceId;
  const sourceLabel =
    (flowContext?.selectedSourceId &&
      (flowContext?.sourceOptions ?? []).find(
        (item) => item.id === flowContext.selectedSourceId
      )?.title) ||
    flowContext?.selectedSourceId ||
    null;
  const actionLabels = flowContext?.display?.actionLabels ?? {
    execute: "生成教案",
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold text-zinc-800">生成前确认</p>
        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-zinc-600 sm:grid-cols-2">
          <p>文档形态：教案</p>
          <p>详细程度：{getDetailLevelLabel(detailLevel)}</p>
          <p>适用学段：{getGradeBandLabel(gradeBand)}</p>
          <p className="sm:col-span-2">课题主题：{topic}</p>
          <p className="sm:col-span-2">学习目标：{goal}</p>
          {teachingContext ? (
            <p className="sm:col-span-2">教学场景：{teachingContext}</p>
          ) : null}
          {studentNeeds ? (
            <p className="sm:col-span-2">学生画像：{studentNeeds}</p>
          ) : null}
          {outputRequirements ? (
            <p className="sm:col-span-2">输出要求：{outputRequirements}</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold text-zinc-800">主来源</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          当前教案主链要求先在右侧资料来源中选中一个课件来源。
        </p>
        {sourceLabel ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
            当前主来源：{sourceLabel}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            请先在右侧 Sources 中选中一个 PPT Source，再生成教案。
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 text-xs text-zinc-600"
          onClick={onBack}
        >
          返回修改配置
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          disabled={
            isGenerating ||
            Boolean(flowContext?.isLoadingProtocol) ||
            flowContext?.canExecute === false ||
            missingRequiredSource ||
            !topic.trim() ||
            !goal.trim()
          }
          onClick={onGenerate}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              正在生成教案...
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {actionLabels.execute}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
