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
import { SPEECH_TONE_OPTIONS } from "./constants";
import type { SpeechTone } from "./types";

interface SourceOption {
  id: string;
  title?: string;
  type?: string;
}

interface ConfigStepProps {
  topic: string;
  tone: SpeechTone;
  emphasizeInteraction: boolean;
  speakerGoal: string;
  topicSuggestions: string[];
  goalSuggestion: string;
  isRecommendationsLoading: boolean;
  selectedDeckId: string | null;
  sourceOptions: SourceOption[];
  onTopicChange: (value: string) => void;
  onToneChange: (value: SpeechTone) => void;
  onSpeakerGoalChange: (value: string) => void;
  onToggleInteraction: () => void;
  onSelectedDeckChange: (value: string | null) => void;
  onRefreshSources: () => void;
  onNext: () => void;
  isRefreshing?: boolean;
}

export function ConfigStep({
  topic,
  tone,
  emphasizeInteraction,
  speakerGoal,
  topicSuggestions,
  goalSuggestion,
  isRecommendationsLoading,
  selectedDeckId,
  sourceOptions,
  onTopicChange,
  onToneChange,
  onSpeakerGoalChange,
  onToggleInteraction,
  onSelectedDeckChange,
  onRefreshSources,
  onNext,
  isRefreshing,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-800">引用课件</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              讲稿生成会基于当前选中的课件，再叠加知识库里的说课重点推荐。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onRefreshSources}
            disabled={isRefreshing}
          >
            刷新来源
          </Button>
        </div>
        <div className="mt-3">
          <Select
            value={selectedDeckId ?? ""}
            onValueChange={(value) => onSelectedDeckChange(value || null)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="选择一个已生成的 PPT 作为讲稿来源" />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.length > 0 ? (
                sourceOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {(item.title || item.id.slice(0, 8)) +
                      (item.type ? ` (${item.type})` : "")}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__empty" disabled>
                  暂无可用课件，请先生成或刷新来源
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs text-zinc-600">讲稿主题</Label>
            <p className="mt-1 text-[11px] text-zinc-500">
              使用知识库推荐的真实主题，而不是固定占位词。
            </p>
          </div>
          {isRecommendationsLoading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取 RAG 推荐
            </span>
          ) : null}
        </div>
        <Input
          value={topic}
          onChange={(event) => onTopicChange(event.target.value)}
          placeholder="例如：从实验现象到概念建模的说课逻辑"
          className="mt-3 h-9 text-xs"
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

      <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">表达语气</Label>
            <Select
              value={tone}
              onValueChange={(value) => onToneChange(value as SpeechTone)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPEECH_TONE_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-zinc-500">
              {
                SPEECH_TONE_OPTIONS.find((item) => item.value === tone)
                  ?.description
              }
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">互动强调</Label>
            <button
              type="button"
              onClick={onToggleInteraction}
              className={`h-9 w-full rounded-lg border px-3 text-left text-xs transition-colors ${
                emphasizeInteraction
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {emphasizeInteraction
                ? "讲稿中突出师生互动与提问衔接"
                : "讲稿中以内容讲述为主，减少互动提示"}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">说课目标与亮点</Label>
          <Textarea
            value={speakerGoal}
            onChange={(event) => onSpeakerGoalChange(event.target.value)}
            placeholder="告诉大模型你希望讲稿重点突出哪些设计意图、教学亮点、评价线索"
            className="min-h-[96px] text-xs"
          />
          {goalSuggestion ? (
            <button
              type="button"
              onClick={() => onSpeakerGoalChange(goalSuggestion)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              使用 RAG 推荐亮点
            </button>
          ) : null}
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          onClick={onNext}
          disabled={!selectedDeckId || !topic.trim()}
        >
          下一步：确认生成
        </Button>
      </div>
    </div>
  );
}
