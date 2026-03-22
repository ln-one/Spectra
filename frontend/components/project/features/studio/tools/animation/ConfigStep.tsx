import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
  onTopicChange,
  onSceneChange,
  onSpeedChange,
  onShowTrailChange,
  onSplitViewChange,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">动画主题</Label>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder="例如：冒泡排序每轮交换过程"
            className="h-9 text-xs"
          />
        </div>
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
            {ANIMATION_SCENE_OPTIONS.find((item) => item.value === scene)?.description}
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
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <Label className="text-xs text-zinc-600">显示轨迹线</Label>
          <Switch checked={showTrail} onCheckedChange={onShowTrailChange} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <Label className="text-xs text-zinc-600">代码/预览分栏</Label>
          <Switch checked={splitView} onCheckedChange={onSplitViewChange} />
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
