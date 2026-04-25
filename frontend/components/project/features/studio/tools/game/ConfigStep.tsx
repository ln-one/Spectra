import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConfigStepProps {
  topic: string;
  creativeDirection: string;
  playerGoal: string;
  mechanicsNotes: string;
  topicSuggestions: string[];
  ideaSuggestion: string;
  isRecommendationsLoading: boolean;
  onTopicChange: (value: string) => void;
  onCreativeDirectionChange: (value: string) => void;
  onPlayerGoalChange: (value: string) => void;
  onMechanicsNotesChange: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  topic,
  creativeDirection,
  playerGoal,
  mechanicsNotes,
  topicSuggestions,
  ideaSuggestion,
  isRecommendationsLoading,
  onTopicChange,
  onCreativeDirectionChange,
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
              直接描述互动玩法即可，系统会优先套用时间轴排序、概念连线、术语配对、填空挑战或轻量闯关模板。
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
          <Textarea
            value={creativeDirection}
            onChange={(event) => onCreativeDirectionChange(event.target.value)}
            placeholder="描述你希望的交互方式，例如拖拽排序、线索推理、选择分支、连线配对、限时闯关等"
            className="min-h-[88px] text-xs"
          />
          {ideaSuggestion ? (
            <button
              type="button"
              onClick={() => onCreativeDirectionChange(ideaSuggestion)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              使用 RAG 推荐玩法方向
            </button>
          ) : null}
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
          disabled={!topic.trim() || !creativeDirection.trim()}
        >
          下一步：确认生成
        </Button>
      </div>
    </div>
  );
}
