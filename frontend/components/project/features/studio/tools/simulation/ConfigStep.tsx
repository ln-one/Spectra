import { Loader2, Sparkles } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { STUDENT_PROFILES } from "./constants";
import type { StudentProfile } from "./types";

interface ConfigStepProps {
  topic: string;
  intensity: number;
  profile: StudentProfile;
  teacherStrategy: string;
  topicSuggestions: string[];
  strategySuggestion: string;
  isRecommendationsLoading: boolean;
  onTopicChange: (value: string) => void;
  onIntensityChange: (value: number) => void;
  onProfileChange: (value: StudentProfile) => void;
  onTeacherStrategyChange: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  topic,
  intensity,
  profile,
  teacherStrategy,
  topicSuggestions,
  strategySuggestion,
  isRecommendationsLoading,
  onTopicChange,
  onIntensityChange,
  onProfileChange,
  onTeacherStrategyChange,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs text-zinc-600">预演主题</Label>
            <p className="mt-1 text-[11px] text-zinc-500">
              优先使用知识库推荐的真实疑问点与重难点作为问答预演主题。
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
          placeholder="例如：实验误差追问、概念辨析、课堂即时纠错"
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
          <Label className="text-xs text-zinc-600">
            追问强度：{intensity}%
          </Label>
          <Slider
            value={[intensity]}
            min={20}
            max={100}
            step={10}
            onValueChange={(value) => onIntensityChange(value[0] ?? 60)}
          />
          <p className="text-[11px] text-zinc-500">
            数值越高，后端预演中的追问会越连续、越偏向课堂压力测试。
          </p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs text-zinc-600">学生画像</Label>
          <Select
            value={profile}
            onValueChange={(value) => onProfileChange(value as StudentProfile)}
          >
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
            {
              STUDENT_PROFILES.find((item) => item.value === profile)
                ?.description
            }
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">教师应对策略</Label>
          <Textarea
            value={teacherStrategy}
            onChange={(event) => onTeacherStrategyChange(event.target.value)}
            placeholder="告诉大模型你希望练习的应对方式，例如先追问再点拨、先肯定再纠偏、用实验现象回扣概念"
            className="min-h-[96px] text-xs"
          />
          {strategySuggestion ? (
            <button
              type="button"
              onClick={() => onTeacherStrategyChange(strategySuggestion)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              使用 RAG 推荐策略
            </button>
          ) : null}
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
