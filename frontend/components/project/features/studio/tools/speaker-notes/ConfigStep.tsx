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
  selectedDeckId: string | null;
  sourceOptions: SourceOption[];
  onTopicChange: (value: string) => void;
  onToneChange: (value: SpeechTone) => void;
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
  selectedDeckId,
  sourceOptions,
  onTopicChange,
  onToneChange,
  onToggleInteraction,
  onSelectedDeckChange,
  onRefreshSources,
  onNext,
  isRefreshing,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-zinc-600">选择要配套的 PPT</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onRefreshSources}
              disabled={isRefreshing}
            >
              刷新列表
            </Button>
          </div>
          <Select
            value={selectedDeckId ?? ""}
            onValueChange={(value) => onSelectedDeckChange(value || null)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="请选择一个已生成的课件成果" />
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
                  暂无可选成果，请先刷新
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">说课主题（可补充）</Label>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder="例如：函数单调性公开课说课"
            className="h-9 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">讲稿风格</Label>
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
          <Label className="text-xs text-zinc-600">课堂互动强度</Label>
          <button
            type="button"
            onClick={onToggleInteraction}
            className={`h-9 w-full rounded-lg border px-3 text-xs text-left transition-colors ${
              emphasizeInteraction
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {emphasizeInteraction
              ? "开启：优先加入提问停顿"
              : "关闭：以讲解连贯为主"}
          </button>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          onClick={onNext}
          disabled={!selectedDeckId}
        >
          下一步：确认生成
        </Button>
      </div>
    </div>
  );
}
