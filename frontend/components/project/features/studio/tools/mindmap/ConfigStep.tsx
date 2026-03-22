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
import { DEPTH_OPTIONS, FOCUS_OPTIONS, TOPIC_SUGGESTIONS } from "./constants";
import type { MindmapFocus } from "./types";

interface ConfigStepProps {
  topic: string;
  depth: string;
  focus: MindmapFocus;
  targetAudience: string;
  focusLabel: string;
  onTopicChange: (value: string) => void;
  onDepthChange: (value: string) => void;
  onFocusChange: (value: MindmapFocus) => void;
  onTargetAudienceChange: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  topic,
  depth,
  focus,
  targetAudience,
  focusLabel,
  onTopicChange,
  onDepthChange,
  onFocusChange,
  onTargetAudienceChange,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">你想讲什么主题？</Label>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder="例如：细胞分裂过程"
            className="h-9 text-xs"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {TOPIC_SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onTopicChange(item)}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-100"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">导图复杂程度</Label>
          <Select value={depth} onValueChange={onDepthChange}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPTH_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">讲解视角</Label>
          <Select
            value={focus}
            onValueChange={(value) => onFocusChange(value as MindmapFocus)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOCUS_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">适用对象</Label>
          <Input
            value={targetAudience}
            onChange={(event) => onTargetAudienceChange(event.target.value)}
            className="h-9 text-xs"
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-xs font-semibold text-zinc-800">配置预览</p>
        <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-zinc-600 sm:grid-cols-2">
          <p>主题：{topic}</p>
          <p>层级：{depth} 层</p>
          <p>视角：{focusLabel}</p>
          <p>对象：{targetAudience}</p>
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
