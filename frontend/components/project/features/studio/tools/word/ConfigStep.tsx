import { AnimatePresence, motion } from "framer-motion";
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
  DIFFICULTY_LAYER_OPTIONS,
  DOCUMENT_VARIANTS,
  GRADE_BAND_OPTIONS,
  TEACHING_MODE_OPTIONS,
} from "./constants";
import type {
  WordDifficultyLayer,
  WordDocumentVariant,
  WordGradeBand,
  WordTeachingModel,
} from "./types";

interface ConfigStepProps {
  documentVariant: WordDocumentVariant;
  teachingModel: WordTeachingModel;
  gradeBand: WordGradeBand;
  difficultyLayer: WordDifficultyLayer;
  topic: string;
  goal: string;
  teachingContext: string;
  studentNeeds: string;
  outputRequirements: string;
  topicSuggestions: string[];
  goalSuggestion: string;
  isRecommendationsLoading: boolean;
  onDocumentVariantChange: (value: WordDocumentVariant) => void;
  onTeachingModelChange: (value: WordTeachingModel) => void;
  onGradeBandChange: (value: WordGradeBand) => void;
  onDifficultyLayerChange: (value: WordDifficultyLayer) => void;
  onTopicChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onTeachingContextChange: (value: string) => void;
  onStudentNeedsChange: (value: string) => void;
  onOutputRequirementsChange: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  documentVariant,
  teachingModel,
  gradeBand,
  difficultyLayer,
  topic,
  goal,
  teachingContext,
  studentNeeds,
  outputRequirements,
  topicSuggestions,
  goalSuggestion,
  isRecommendationsLoading,
  onDocumentVariantChange,
  onTeachingModelChange,
  onGradeBandChange,
  onDifficultyLayerChange,
  onTopicChange,
  onGoalChange,
  onTeachingContextChange,
  onStudentNeedsChange,
  onOutputRequirementsChange,
  onNext,
}: ConfigStepProps) {
  const showLayeredFields = documentVariant === "layered_lesson_plan";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-800">文档类型</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              按当前知识库场景选择最接近的输出形态，再补充教学要求。
            </p>
          </div>
          {isRecommendationsLoading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取 RAG 推荐
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DOCUMENT_VARIANTS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onDocumentVariantChange(item.value)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                documentVariant === item.value
                  ? "border-blue-500 bg-blue-50"
                  : "border-zinc-200 bg-white hover:bg-zinc-50"
              }`}
            >
              <p className="text-xs font-semibold text-zinc-800">
                {item.label}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">{item.helper}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">课题主题</Label>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder="从知识库中选择一个真实主题"
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

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">适用学段</Label>
            <Select
              value={gradeBand}
              onValueChange={(value) =>
                onGradeBandChange(value as WordGradeBand)
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

          <AnimatePresence initial={false}>
            {showLayeredFields ? (
              <motion.div
                key="layered-fields"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="space-y-3 sm:contents"
              >
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-600">教学模型</Label>
                  <Select
                    value={teachingModel}
                    onValueChange={(value) =>
                      onTeachingModelChange(value as WordTeachingModel)
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEACHING_MODE_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-600">分层档位</Label>
                  <Select
                    value={difficultyLayer}
                    onValueChange={(value) =>
                      onDifficultyLayerChange(value as WordDifficultyLayer)
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_LAYER_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label className="text-xs text-zinc-600">学习目标</Label>
          <Textarea
            value={goal}
            onChange={(event) => onGoalChange(event.target.value)}
            placeholder="让大模型知道文档最终要帮助学生完成什么"
            className="min-h-[84px] text-xs"
          />
          {goalSuggestion ? (
            <button
              type="button"
              onClick={() => onGoalChange(goalSuggestion)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              使用 RAG 推荐目标
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">教学场景与约束</Label>
            <Textarea
              value={teachingContext}
              onChange={(event) => onTeachingContextChange(event.target.value)}
              placeholder="例如公开课、复习课、实验课、40 分钟课时、需要板书等"
              className="min-h-[96px] text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">学生画像与难点</Label>
            <Textarea
              value={studentNeeds}
              onChange={(event) => onStudentNeedsChange(event.target.value)}
              placeholder="例如基础薄弱、容易混淆概念、需要例题拆解、需要探究拓展等"
              className="min-h-[96px] text-xs"
            />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label className="text-xs text-zinc-600">输出要求</Label>
          <Textarea
            value={outputRequirements}
            onChange={(event) => onOutputRequirementsChange(event.target.value)}
            placeholder="例如需要表格、分层任务单、实验安全提示、课后练习、可打印版式等"
            className="min-h-[96px] text-xs"
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          onClick={onNext}
          disabled={!topic.trim() || !goal.trim()}
        >
          下一步：确认生成
        </Button>
      </div>
    </div>
  );
}
