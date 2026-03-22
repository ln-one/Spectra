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
import { GAME_IDEA_TAGS, GAME_MODE_OPTIONS } from "./constants";
import type { GameMode } from "./types";

interface ConfigStepProps {
  topic: string;
  mode: GameMode;
  countdown: string;
  life: string;
  ideaTags: string[];
  onTopicChange: (value: string) => void;
  onModeChange: (value: GameMode) => void;
  onCountdownChange: (value: string) => void;
  onLifeChange: (value: string) => void;
  onToggleIdeaTag: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  topic,
  mode,
  countdown,
  life,
  ideaTags,
  onTopicChange,
  onModeChange,
  onCountdownChange,
  onLifeChange,
  onToggleIdeaTag,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">这次想用游戏练什么？</Label>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder="例如：工业革命关键事件"
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">游戏类型</Label>
          <Select
            value={mode}
            onValueChange={(value) => onModeChange(value as GameMode)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAME_MODE_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-zinc-500">
            {GAME_MODE_OPTIONS.find((item) => item.value === mode)?.description}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">倒计时（秒）</Label>
          <Input
            type="number"
            min={10}
            max={180}
            value={countdown}
            onChange={(event) => onCountdownChange(event.target.value)}
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">生命值（次）</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={life}
            onChange={(event) => onLifeChange(event.target.value)}
            className="h-9 text-xs"
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-xs font-semibold text-zinc-800">
          灵感标签（可多选）
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          不确定时可以点几个，AI 会自动融合到玩法里。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {GAME_IDEA_TAGS.map((tag) => {
            const selected = ideaTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleIdeaTag(tag)}
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
