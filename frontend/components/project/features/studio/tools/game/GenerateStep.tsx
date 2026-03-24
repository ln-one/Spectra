import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ToolFlowContext } from "../types";

interface GenerateStepProps {
  topic: string;
  creativeDirection: string;
  playerGoal: string;
  mechanicsNotes: string;
  flowContext?: ToolFlowContext;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
}

export function GenerateStep({
  topic,
  creativeDirection,
  playerGoal,
  mechanicsNotes,
  flowContext,
  isGenerating,
  onBack,
  onGenerate,
}: GenerateStepProps) {
  const sourceOptions = flowContext?.sourceOptions ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold text-zinc-800">生成前确认</p>
        <div className="mt-3 space-y-2 text-[11px] text-zinc-600">
          <p>训练主题：{topic}</p>
          <p>玩法方向：{creativeDirection}</p>
          {playerGoal ? <p>玩家目标：{playerGoal}</p> : null}
          {mechanicsNotes ? <p>额外限制：{mechanicsNotes}</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-zinc-800">绑定参考成果</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              可选：如果你希望游戏紧贴某份课件或文档，可以在这里指定来源。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void flowContext?.onLoadSources?.()}
            disabled={
              flowContext?.isLoadingProtocol || flowContext?.isActionRunning
            }
          >
            {flowContext?.isActionRunning ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            刷新列表
          </Button>
        </div>
        {sourceOptions.length > 0 ? (
          <div className="mt-3">
            <Select
              value={flowContext?.selectedSourceId ?? ""}
              onValueChange={(value) =>
                flowContext?.onSelectedSourceChange?.(value || null)
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="请选择一个已生成成果" />
              </SelectTrigger>
              <SelectContent>
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
            当前还没有可绑定成果，点击上方按钮即可刷新。
          </p>
        )}
      </section>

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
            flowContext?.canExecute === false ||
            !topic.trim() ||
            !creativeDirection.trim()
          }
          onClick={onGenerate}
        >
          {isGenerating || flowContext?.isActionRunning ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              正在生成游戏...
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              交给后端生成
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
