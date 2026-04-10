import { Loader2 } from "lucide-react";
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
import type { GameMode } from "./types";

interface GamePatternOption {
  value: GameMode;
  label: string;
}

interface ConfigStepProps {
  topic: string;
  gamePattern: GameMode;
  gamePatternOptions: GamePatternOption[];
  playerGoal: string;
  mechanicsNotes: string;
  topicSuggestions: string[];
  isRecommendationsLoading: boolean;
  onTopicChange: (value: string) => void;
  onGamePatternChange: (value: GameMode) => void;
  onPlayerGoalChange: (value: string) => void;
  onMechanicsNotesChange: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  topic,
  gamePattern,
  gamePatternOptions,
  playerGoal,
  mechanicsNotes,
  topicSuggestions,
  isRecommendationsLoading,
  onTopicChange,
  onGamePatternChange,
  onPlayerGoalChange,
  onMechanicsNotesChange,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-800">游戏主题</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              先确定训练主题，再从项目内预置玩法方向中选择一种交互模板。
            </p>
          </div>
          {isRecommendationsLoading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取 RAG 推荐
            </span>
          ) : null}
        </div>
        <div className="mt-3 space-y-1.5">
          <Label className="text-xs text-zinc-600">训练主题</Label>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder="例如：电解池原理判断、函数图像性质辨析、历史事件因果推演"
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
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">玩法方向</Label>
          <Select
            value={gamePattern}
            onValueChange={(value) => onGamePatternChange(value as GameMode)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="请选择玩法方向" />
            </SelectTrigger>
            <SelectContent>
              {gamePatternOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">玩家目标</Label>
            <Textarea
              value={playerGoal}
              onChange={(event) => onPlayerGoalChange(event.target.value)}
              placeholder="例如：在 2 分钟内完成 5 轮判断，并给出即时反馈"
              className="min-h-[88px] text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">额外限制或灵感</Label>
            <Textarea
              value={mechanicsNotes}
              onChange={(event) => onMechanicsNotesChange(event.target.value)}
              placeholder="例如：适合投屏、支持手机点击、界面轻量、可加入奖励机制或剧情包装"
              className="min-h-[88px] text-xs"
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          onClick={onNext}
          disabled={!topic.trim()}
        >
          下一步：确认生成
        </Button>
      </div>
    </div>
  );
}
