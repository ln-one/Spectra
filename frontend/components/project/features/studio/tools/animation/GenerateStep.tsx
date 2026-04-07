import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRhythmLabel } from "./constants";
import type { AnimationRhythm } from "./types";
import type { ToolFlowContext } from "../types";
import { buildAnimationSpecPreview } from "./spec-preview";

interface GenerateStepProps {
  topic: string;
  focus: string;
  durationSeconds: number;
  rhythm: AnimationRhythm;
  flowContext?: ToolFlowContext;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
}

export function GenerateStep({
  topic,
  focus,
  durationSeconds,
  rhythm,
  flowContext,
  isGenerating,
  onBack,
  onGenerate,
}: GenerateStepProps) {
  const sourceOptions = flowContext?.sourceOptions ?? [];
  const specPreview = buildAnimationSpecPreview({ topic, focus, rhythm });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold text-zinc-800">动画规格确认</p>
        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-zinc-600 sm:grid-cols-2">
          <p>教学需求：{topic || "未填写"}</p>
          <p>时长：{durationSeconds} 秒</p>
          <p>节奏：{getRhythmLabel(rhythm)}</p>
          <p>渲染链路：HTML/SVG/Canvas 模板导出 GIF</p>
        </div>
        <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-[11px] text-zinc-600">
          <p className="font-medium text-zinc-800">重点提示</p>
          <p className="mt-1 whitespace-pre-wrap">
            {focus.trim() || "未额外指定，系统将按主题自动聚焦关键变化。"}
          </p>
        </div>
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] text-zinc-700">
          <p className="font-medium text-zinc-900">动画规格卡</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <p>拟采用模板：{specPreview.visualLabel}</p>
            <p>教学目标：{specPreview.teachingGoal}</p>
          </div>
          {specPreview.objects.length > 0 ? (
            <div className="mt-2">
              <p className="font-medium text-zinc-800">核心对象</p>
              <p className="mt-1">{specPreview.objects.join(" -> ")}</p>
              <div className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {specPreview.objectDetails.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-md border border-emerald-100 bg-white/80 px-2.5 py-2"
                  >
                    <p className="font-medium text-zinc-900">{item.label}</p>
                    <p className="mt-0.5 text-zinc-600">{item.role}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-2">
            <p className="font-medium text-zinc-800">镜头规划</p>
            <div className="mt-1 space-y-1">
              {specPreview.scenes.map((scene, index) => (
                <div key={scene.title} className="rounded-md bg-white/70 px-2.5 py-2">
                  <p className="font-medium text-zinc-900">
                    镜头 {index + 1}：{scene.title}
                  </p>
                  <p className="mt-0.5 text-zinc-600">{scene.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-800">
              可选：提前选择后续插入用的 PPT
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              动画先独立生成，不要求先绑定 PPT。这里的选择只用于后续推荐插入页。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void flowContext?.onLoadSources?.()}
            disabled={Boolean(flowContext?.isLoadingProtocol)}
          >
            {flowContext?.isLoadingProtocol ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            刷新 PPT 列表
          </Button>
        </div>
        {sourceOptions.length > 0 ? (
          <div className="mt-3">
            <Select
              value={flowContext?.selectedSourceId ?? "__none__"}
              onValueChange={(value) =>
                flowContext?.onSelectedSourceChange?.(
                  value === "__none__" ? null : value
                )
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="暂不选择，生成后再决定是否插入" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">暂不选择</SelectItem>
                {sourceOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {(item.title || item.id.slice(0, 8)) +
                      (item.type ? ` (${item.type})` : "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-zinc-500">
            当前还没有可选的 PPT 成果，也可以直接继续生成动画。
          </p>
        )}
      </section>

      {flowContext?.isProtocolPending ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          当前能力还在准备中，请稍后再试。
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 text-xs text-zinc-600"
          onClick={onBack}
        >
          返回修改配置
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          disabled={
            isGenerating ||
            Boolean(flowContext?.isLoadingProtocol) ||
            flowContext?.canExecute === false ||
            !topic.trim()
          }
          onClick={onGenerate}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              正在生成规格化 GIF 动画...
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              按规格生成 GIF 动画
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
