import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DETAIL_LEVEL_OPTIONS,
  GRADE_BAND_OPTIONS,
} from "./constants";
import type { LessonPlanDetailLevel, LessonPlanGradeBand } from "./types";

interface ConfigStepProps {
  detailLevel: LessonPlanDetailLevel;
  gradeBand: LessonPlanGradeBand;
  topic: string;
  goal: string;
  teachingContext: string;
  studentNeeds: string;
  outputRequirements: string;
  topicSuggestions: string[];
  goalSuggestion: string;
  isRecommendationsLoading: boolean;
  onDetailLevelChange: (value: LessonPlanDetailLevel) => void;
  onGradeBandChange: (value: LessonPlanGradeBand) => void;
  onTopicChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onTeachingContextChange: (value: string) => void;
  onStudentNeedsChange: (value: string) => void;
  onOutputRequirementsChange: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  detailLevel,
  gradeBand,
  topic,
  goal,
  teachingContext,
  studentNeeds,
  outputRequirements,
  topicSuggestions,
  goalSuggestion,
  isRecommendationsLoading,
  onDetailLevelChange,
  onGradeBandChange,
  onTopicChange,
  onGoalChange,
  onTeachingContextChange,
  onStudentNeedsChange,
  onOutputRequirementsChange,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-800">教案配置</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              当前默认生成教案，先补齐课题、目标和课堂要求。
            </p>
          </div>
          {isRecommendationsLoading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取推荐
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">详细程度</Label>
            <Select
              value={detailLevel}
              onValueChange={(value) =>
                onDetailLevelChange(value as LessonPlanDetailLevel)
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DETAIL_LEVEL_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-zinc-500">
              {
                DETAIL_LEVEL_OPTIONS.find((item) => item.value === detailLevel)
                  ?.helper
              }
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">适用学段</Label>
            <Select
              value={gradeBand}
              onValueChange={(value) =>
                onGradeBandChange(value as LessonPlanGradeBand)
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADE_BAND_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">课题主题</Label>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder="例如：牛顿第二定律、细胞分裂、函数单调性"
            className="h-9 text-xs"
          />
          {topicSuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {topicSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onTopicChange(item)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 space-y-1.5">
          <Label className="text-xs text-zinc-600">学习目标</Label>
          <Textarea
            value={goal}
            onChange={(event) => onGoalChange(event.target.value)}
            placeholder="说明这节课希望学生学会什么、做到什么、理解什么"
            className="min-h-[84px] text-xs"
          />
          {goalSuggestion ? (
            <button
              type="button"
              onClick={() => onGoalChange(goalSuggestion)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              使用推荐目标
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">教学场景与约束</Label>
            <Textarea
              value={teachingContext}
              onChange={(event) => onTeachingContextChange(event.target.value)}
              placeholder="例如：40 分钟公开课、复习课、实验课、需要板书或分组活动"
              className="min-h-[96px] text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">学生画像与难点</Label>
            <Textarea
              value={studentNeeds}
              onChange={(event) => onStudentNeedsChange(event.target.value)}
              placeholder="例如：基础薄弱、概念易混淆、需要例题拆解或探究拓展"
              className="min-h-[96px] text-xs"
            />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label className="text-xs text-zinc-600">输出要求</Label>
          <Textarea
            value={outputRequirements}
            onChange={(event) => onOutputRequirementsChange(event.target.value)}
            placeholder="例如：突出评价任务、写清教学流程、加入练习检测与作业设计"
            className="min-h-[84px] text-xs"
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          disabled={!topic.trim() || !goal.trim()}
          onClick={onNext}
        >
          下一步：确认生成
        </Button>
      </div>
    </div>
  );
}
