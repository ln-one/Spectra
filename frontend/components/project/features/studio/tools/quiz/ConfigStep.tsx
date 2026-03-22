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
  DIFFICULTY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
  STYLE_TAGS,
} from "./constants";
import type { QuizDifficulty, QuizQuestionType } from "./types";

interface ConfigStepProps {
  scope: string;
  countInput: string;
  difficulty: QuizDifficulty;
  questionType: QuizQuestionType;
  styleTags: string[];
  onScopeChange: (value: string) => void;
  onCountChange: (value: string) => void;
  onDifficultyChange: (value: QuizDifficulty) => void;
  onQuestionTypeChange: (value: QuizQuestionType) => void;
  onToggleTag: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  scope,
  countInput,
  difficulty,
  questionType,
  styleTags,
  onScopeChange,
  onCountChange,
  onDifficultyChange,
  onQuestionTypeChange,
  onToggleTag,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">这次想测哪些内容？</Label>
          <Input
            value={scope}
            onChange={(event) => onScopeChange(event.target.value)}
            placeholder="例如：函数单调性与极值"
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">题量</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={countInput}
            onChange={(event) => onCountChange(event.target.value)}
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">难度</Label>
          <Select
            value={difficulty}
            onValueChange={(value) =>
              onDifficultyChange(value as QuizDifficulty)
            }
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTY_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-zinc-500">
            {
              DIFFICULTY_OPTIONS.find((item) => item.value === difficulty)
                ?.description
            }
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">题型</Label>
          <Select
            value={questionType}
            onValueChange={(value) =>
              onQuestionTypeChange(value as QuizQuestionType)
            }
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPE_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-xs font-semibold text-zinc-800">
          出题风格（可多选）
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          选中的标签会影响题目语气和干扰项设计。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STYLE_TAGS.map((tag) => {
            const selected = styleTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  selected
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          onClick={onNext}
        >
          下一步：确认生成
        </Button>
      </div>
    </div>
  );
}
