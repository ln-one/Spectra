import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolFlowContext } from "../types";
import type { SourcePptSlidePreview } from "./types";

interface GenerateStepProps {
  selectedDeckTitle: string;
  topic: string;
  toneLabel: string;
  emphasizeInteraction: boolean;
  speakerGoal: string;
  sourceSlides: SourcePptSlidePreview[];
  isSourceSlidesLoading: boolean;
  sourcePreviewError: string | null;
  flowContext?: ToolFlowContext;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
}

export function GenerateStep({
  selectedDeckTitle,
  topic,
  toneLabel,
  emphasizeInteraction,
  speakerGoal,
  sourceSlides,
  isSourceSlidesLoading,
  sourcePreviewError,
  flowContext,
  isGenerating,
  onBack,
  onGenerate,
}: GenerateStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold text-zinc-800">生成确认</p>
        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-zinc-600 sm:grid-cols-2">
          <p>课件来源：{selectedDeckTitle || "未命名课件"}</p>
          <p>表达语气：{toneLabel}</p>
          <p>讲稿主题：{topic || "未填写"}</p>
          <p>互动策略：{emphasizeInteraction ? "强调互动" : "弱化互动"}</p>
        </div>
        {speakerGoal.trim() ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
            说课重点：{speakerGoal}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-zinc-800">已选课件预览</p>
          <span className="text-[11px] text-zinc-500">
            {isSourceSlidesLoading ? "加载中..." : `${sourceSlides.length} 页`}
          </span>
        </div>

        {sourcePreviewError ? (
          <p className="mt-2 text-[11px] text-amber-700">
            {sourcePreviewError}
          </p>
        ) : null}

        {sourceSlides.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {sourceSlides.slice(0, 8).map((slide) => (
              <div
                key={`${slide.slideId ?? "page"}-${slide.page}`}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
              >
                <div className="aspect-[16/10] bg-white">
                  {slide.thumbnailUrl || slide.imageUrl ? (
                    <img
                      src={slide.thumbnailUrl || slide.imageUrl}
                      alt={`P${slide.page} ${slide.title}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-zinc-500">
                      P{slide.page}
                    </div>
                  )}
                </div>
                <p className="truncate border-t border-zinc-200 px-2 py-1 text-[10px] text-zinc-600">
                  P{slide.page} · {slide.title}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-500">
            未获取到可预览页，请确认该课件已生成并可预览。
          </p>
        )}
      </section>

      {flowContext?.isProtocolPending ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          当前协议尚未就绪，生成按钮会在后端准备完成后可用。
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
          返回配置
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
          disabled={
            isGenerating ||
            Boolean(flowContext?.isLoadingProtocol) ||
            flowContext?.canExecute === false
          }
          onClick={onGenerate}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              正在生成讲稿...
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              开始生成讲稿
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
