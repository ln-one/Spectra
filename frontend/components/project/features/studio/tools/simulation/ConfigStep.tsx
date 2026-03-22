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
import { STUDENT_PROFILES } from "./constants";
import type { StudentProfile } from "./types";

interface ConfigStepProps {
  topic: string;
  intensity: number;
  profile: StudentProfile;
  includeStrategyPanel: boolean;
  onTopicChange: (value: string) => void;
  onIntensityChange: (value: number) => void;
  onProfileChange: (value: StudentProfile) => void;
  onIncludeStrategyPanelChange: (value: boolean) => void;
  onNext: () => void;
}

export function ConfigStep({
  topic,
  intensity,
  profile,
  includeStrategyPanel,
  onTopicChange,
  onIntensityChange,
  onProfileChange,
  onIncludeStrategyPanelChange,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">本轮预演主题</Label>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder="例如：牛顿第二定律边界条件"
            className="h-9 text-xs"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">提问强度：{intensity}%</Label>
          <Slider
            value={[intensity]}
            min={20}
            max={100}
            step={10}
            onValueChange={(value) => onIntensityChange(value[0] ?? 60)}
          />
          <p className="text-[11px] text-zinc-500">
            强度越高，虚拟学生越会追问底层逻辑和边界情况。
          </p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">学生群像风格</Label>
          <Select value={profile} onValueChange={(value) => onProfileChange(value as StudentProfile)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STUDENT_PROFILES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-zinc-500">
            {STUDENT_PROFILES.find((item) => item.value === profile)?.description}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 sm:col-span-2">
          <Label className="text-xs text-zinc-600">展示“棱镜锦囊”策略面板</Label>
          <button
            type="button"
            onClick={() => onIncludeStrategyPanelChange(!includeStrategyPanel)}
            className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
              includeStrategyPanel
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {includeStrategyPanel ? "开启" : "关闭"}
          </button>
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
