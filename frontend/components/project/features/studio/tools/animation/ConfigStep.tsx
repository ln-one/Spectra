import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANIMATION_RHYTHM_OPTIONS } from "./constants";
import type { AnimationRhythm } from "./types";

interface ConfigStepProps {
  topic: string;
  focus: string;
  durationSeconds: number;
  rhythm: AnimationRhythm;
  topicSuggestions: string[];
  isRecommendationsLoading: boolean;
  onTopicChange: (value: string) => void;
  onFocusChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onRhythmChange: (value: AnimationRhythm) => void;
  onNext: () => void;
}

export function ConfigStep({
  topic,
  focus,
  durationSeconds,
  rhythm,
  topicSuggestions,
  isRecommendationsLoading,
  onTopicChange,
  onFocusChange,
  onDurationChange,
  onRhythmChange,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs text-zinc-600">
              你想让动画演示什么？
            </Label>
            <p className="mt-1 text-[11px] text-zinc-500">
              先用教师视角完整描述这段动画要解释的知识点、教学过程和展示要求。
            </p>
          </div>
          {isRecommendationsLoading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取推荐
            </span>
          ) : null}
        </div>
        <Textarea
          value={topic}
          onChange={(event) => onTopicChange(event.target.value)}
          placeholder="例如：我想做一段给初中生看的动画，演示电流形成过程，重点解释电子为什么会定向移动，尽量突出电场作用和导体内部变化，控制在 8 秒左右。"
          className="mt-3 min-h-[136px] resize-y text-xs leading-6"
        />
        {topicSuggestions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
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
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <Label className="text-xs text-zinc-600">你最想突出什么？</Label>
        <Textarea
          value={focus}
          onChange={(event) => onFocusChange(event.target.value)}
          placeholder="例如：突出电子受电场作用后的定向移动，不要平均展示所有部分。"
          className="mt-3 min-h-[104px] resize-none text-xs"
        />
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label className="text-xs text-zinc-600">
            动画时长：{durationSeconds} 秒
          </Label>
          <Slider
            value={[durationSeconds]}
            min={3}
            max={20}
            step={1}
            onValueChange={(value) => onDurationChange(value[0] ?? 6)}
          />
          <p className="text-[11px] text-zinc-500">
            第一阶段统一输出 GIF，建议控制在 3 到 20 秒之间。
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">节奏</Label>
          <Select
            value={rhythm}
            onValueChange={(value) => onRhythmChange(value as AnimationRhythm)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANIMATION_RHYTHM_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-zinc-500">
            {
              ANIMATION_RHYTHM_OPTIONS.find((item) => item.value === rhythm)
                ?.description
            }
          </p>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          onClick={onNext}
          disabled={!topic.trim()}
        >
          下一步：确认动画规格
        </Button>
      </div>
    </div>
  );
}
