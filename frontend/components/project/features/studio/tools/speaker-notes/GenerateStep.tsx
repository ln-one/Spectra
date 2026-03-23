import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolFlowContext } from "../types";

interface GenerateStepProps {
  selectedDeckTitle: string;
  topic: string;
  toneLabel: string;
  emphasizeInteraction: boolean;
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
  flowContext,
  isGenerating,
  onBack,
  onGenerate,
}: GenerateStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-xs font-semibold text-zinc-800">生成前确认</p>
        <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-zinc-600 sm:grid-cols-2">
          <p>配套课件：{selectedDeckTitle || "未选择"}</p>
          <p>讲稿风格：{toneLabel}</p>
          <p>说课主题：{topic}</p>
          <p>互动模式：{emphasizeInteraction ? "开启" : "关闭"}</p>
        </div>
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
            Boolean(flowContext?.isActionRunning) ||
            Boolean(flowContext?.isLoadingProtocol) ||
            flowContext?.canExecute === false
          }
          onClick={onGenerate}
        >
          {isGenerating || flowContext?.isActionRunning ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              正在生成讲稿...
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              一键生成讲稿
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
