import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANIMATION_SCENE_OPTIONS } from "./constants";
import type { AnimationScene } from "./types";

interface ConfigStepProps {
  topic: string;
  scene: AnimationScene;
  speed: number;
  showTrail: boolean;
  splitView: boolean;
  topicSuggestions: string[];
  isRecommendationsLoading: boolean;
  onTopicChange: (value: string) => void;
  onSceneChange: (value: AnimationScene) => void;
  onSpeedChange: (value: number) => void;
  onShowTrailChange: (value: boolean) => void;
  onSplitViewChange: (value: boolean) => void;
  onNext: () => void;
}

export function ConfigStep({
  topic,
  scene,
  speed,
  showTrail,
  splitView,
  topicSuggestions,
  isRecommendationsLoading,
  onTopicChange,
  onSceneChange,
  onSpeedChange,
  onShowTrailChange,
  onSplitViewChange,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs text-zinc-600">动画主题</Label>
            <p className="mt-1 text-[11px] text-zinc-500">
              优先基于当前知识库推荐抽象过程、动态关系和演示重点。
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
          placeholder="例如：粒子受力变化、排序交换过程、电流方向演示"
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

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">动画场景</Label>
          <Select
            value={scene}
            onValueChange={(value) => onSceneChange(value as AnimationScene)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANIMATION_SCENE_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-zinc-500">
            {
              ANIMATION_SCENE_OPTIONS.find((item) => item.value === scene)
                ?.description
            }
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label className="text-xs text-zinc-600">动画速度：{speed}%</Label>
          <Slider
            value={[speed]}
            min={10}
            max={100}
            step={5}
            onValueChange={(value) => onSpeedChange(value[0] ?? 50)}
          />
        </div>
        <button
          type="button"
          onClick={() => onShowTrailChange(!showTrail)}
          className={`rounded-lg border px-3 py-2 text-left text-xs ${
            showTrail
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-zinc-200 bg-white text-zinc-600"
          }`}
        >
          轨迹线：{showTrail ? "显示" : "隐藏"}
        </button>
        <button
          type="button"
          onClick={() => onSplitViewChange(!splitView)}
          className={`rounded-lg border px-3 py-2 text-left text-xs ${
            splitView
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-zinc-200 bg-white text-zinc-600"
          }`}
        >
          代码视图：{splitView ? "显示" : "隐藏"}
        </button>
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
