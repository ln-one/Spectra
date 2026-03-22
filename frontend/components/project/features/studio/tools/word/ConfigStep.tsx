import { AnimatePresence, motion } from "framer-motion";
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
  onDocumentVariantChange: (value: WordDocumentVariant) => void;
  onTeachingModelChange: (value: WordTeachingModel) => void;
  onGradeBandChange: (value: WordGradeBand) => void;
  onDifficultyLayerChange: (value: WordDifficultyLayer) => void;
  onTopicChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  documentVariant,
  teachingModel,
  gradeBand,
  difficultyLayer,
  topic,
  goal,
  onDocumentVariantChange,
  onTeachingModelChange,
  onGradeBandChange,
  onDifficultyLayerChange,
  onTopicChange,
  onGoalChange,
  onNext,
}: ConfigStepProps) {
  const showLayeredFields = documentVariant === "layered_lesson_plan";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-xs font-medium text-zinc-700">文档类型</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          先选想要输出的文档类型，系统会自动匹配后续配置。
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DOCUMENT_VARIANTS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onDocumentVariantChange(item.value)}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                documentVariant === item.value
                  ? "border-blue-500 bg-blue-50"
                  : "border-zinc-200 bg-white hover:bg-zinc-50"
              }`}
            >
              <p className="text-xs font-semibold text-zinc-800">{item.label}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{item.helper}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">课题名称</Label>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">适用学段</Label>
          <Select
            value={gradeBand}
            onValueChange={(value) => onGradeBandChange(value as WordGradeBand)}
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
                <Label className="text-xs text-zinc-600">教学模式</Label>
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

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">本节目标</Label>
          <Input
            value={goal}
            onChange={(event) => onGoalChange(event.target.value)}
            className="h-9 text-xs"
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

