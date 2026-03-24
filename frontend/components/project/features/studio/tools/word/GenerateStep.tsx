import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getGradeBandLabel,
  getTeachingModelLabel,
  getVariantLabel,
} from "./constants";
import type { ToolFlowContext } from "../types";
import type {
  WordDifficultyLayer,
  WordDocumentVariant,
  WordGradeBand,
  WordTeachingModel,
} from "./types";

interface GenerateStepProps {
  topic: string;
  goal: string;
  teachingContext: string;
  studentNeeds: string;
  outputRequirements: string;
  documentVariant: WordDocumentVariant;
  teachingModel: WordTeachingModel;
  gradeBand: WordGradeBand;
  difficultyLayer: WordDifficultyLayer;
  flowContext?: ToolFlowContext;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
}

export function GenerateStep({
  topic,
  goal,
  teachingContext,
  studentNeeds,
  outputRequirements,
  documentVariant,
  teachingModel,
  gradeBand,
  difficultyLayer,
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
        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-zinc-600 sm:grid-cols-2">
          <p>文档类型：{getVariantLabel(documentVariant)}</p>
          <p>适用学段：{getGradeBandLabel(gradeBand)}</p>
          {documentVariant === "layered_lesson_plan" ? (
            <p>教学模型：{getTeachingModelLabel(teachingModel)}</p>
          ) : null}
          {documentVariant === "layered_lesson_plan" ? (
            <p>分层档位：{difficultyLayer} 层</p>
          ) : null}
          <p className="sm:col-span-2">课题主题：{topic}</p>
          <p className="sm:col-span-2">学习目标：{goal}</p>
          {teachingContext ? (
            <p className="sm:col-span-2">教学场景：{teachingContext}</p>
          ) : null}
          {studentNeeds ? (
            <p className="sm:col-span-2">学生画像：{studentNeeds}</p>
          ) : null}
          {outputRequirements ? (
            <p className="sm:col-span-2">输出要求：{outputRequirements}</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-zinc-800">绑定参考成果</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              可选：绑定已有成果后，生成内容会更贴近当前项目上下文。
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
            !goal.trim()
          }
          onClick={onGenerate}
        >
          {isGenerating || flowContext?.isActionRunning ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              正在生成文档...
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
