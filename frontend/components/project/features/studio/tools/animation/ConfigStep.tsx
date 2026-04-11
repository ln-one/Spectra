import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConfigStepProps {
  topic: string;
  focus: string;
  topicSuggestions: string[];
  isRecommendationsLoading: boolean;
  onTopicChange: (value: string) => void;
  onFocusChange: (value: string) => void;
  onNext: () => void;
}

export function ConfigStep({
  topic,
  focus,
  topicSuggestions,
  isRecommendationsLoading,
  onTopicChange,
  onFocusChange,
  onNext,
}: ConfigStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-xs text-zinc-600">
              你想让动画演示什么？
            </Label>
            <p className="mt-1 text-[11px] text-zinc-500">
              先用教师视角完整描述这段动画要解释的知识点、教学过程和展示要求。
            </p>
          </div>
          {isRecommendationsLoading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取推荐
            </span>
          ) : null}
        </div>
        <Textarea
          value={topic}
          onChange={(event) => onTopicChange(event.target.value)}
          placeholder="例如：我想做一段给初中生看的动画，演示电流形成过程，重点解释电子为什么会定向移动，并突出电场作用和导体内部变化。"
          className="mt-3 min-h-[136px] resize-y text-xs leading-6"
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

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <Label className="text-xs text-zinc-600">你最想突出什么？</Label>
        <Textarea
          value={focus}
          onChange={(event) => onFocusChange(event.target.value)}
          placeholder="例如：突出电子受电场作用后的定向移动，不要平均展示所有部分。"
          className="mt-3 min-h-[104px] resize-none text-xs"
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-medium text-zinc-800">下一步会发生什么</p>
        <p className="mt-2 text-[11px] leading-6 text-zinc-600">
          系统会先根据你的主题需求生成动画规格卡，判断分镜结构、模板类型和镜头数量，然后再给出更准确的双档时长推荐，由你确认后再开始生成。
        </p>
      </section>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          onClick={onNext}
          disabled={!topic.trim()}
        >
          下一步：生成动画规格卡
        </Button>
      </div>
    </div>
  );
}
