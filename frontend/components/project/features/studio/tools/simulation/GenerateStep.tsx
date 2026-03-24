import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolFlowContext } from "../types";

interface GenerateStepProps {
  topic: string;
  intensity: number;
  profileLabel: string;
  teacherStrategy: string;
  flowContext?: ToolFlowContext;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
}

export function GenerateStep({
  topic,
  intensity,
  profileLabel,
  teacherStrategy,
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
          <p>预演主题：{topic || "未填写"}</p>
          <p>追问强度：{intensity}%</p>
          <p>学生画像：{profileLabel}</p>
          <p>状态：实时预览后端真实问答</p>
        </div>
        {teacherStrategy.trim() ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
            教师应对策略：{teacherStrategy}
          </div>
        ) : null}
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
            Boolean(flowContext?.isActionRunning) ||
            Boolean(flowContext?.isLoadingProtocol) ||
            flowContext?.canExecute === false ||
            !topic.trim()
          }
          onClick={onGenerate}
        >
          {isGenerating || flowContext?.isActionRunning ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              正在生成预演...
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              开始生成预演
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
