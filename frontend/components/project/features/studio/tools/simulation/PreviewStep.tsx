import {
  BookText,
  CircleCheck,
  Download,
  MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CapabilityNotice, FallbackPreviewHint } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import { STRATEGY_POOL } from "./constants";
import type { SimulationQuestion, VirtualStudent } from "./types";

interface PreviewStepProps {
  students: VirtualStudent[];
  question: SimulationQuestion | null;
  answer: string;
  judgeText: string;
  includeStrategyPanel: boolean;
  strategyOffset: number;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onRegenerate: () => void;
  onAnswerChange: (value: string) => void;
  onSubmitAnswer: () => void;
  onNextRound: () => void;
  onOpenStrategies: () => void;
}

export function PreviewStep({
  students,
  question,
  answer,
  judgeText,
  includeStrategyPanel,
  strategyOffset,
  lastGeneratedAt,
  flowContext,
  onRegenerate,
  onAnswerChange,
  onSubmitAnswer,
  onNextRound,
  onOpenStrategies,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_not_implemented";
  const capabilityReason =
    flowContext?.capabilityReason ??
    "后端暂未提供多轮问答仿真结构，当前使用前端示意预演。";
  const visibleStrategies = [
    STRATEGY_POOL[(strategyOffset + 0) % STRATEGY_POOL.length],
    STRATEGY_POOL[(strategyOffset + 1) % STRATEGY_POOL.length],
    STRATEGY_POOL[(strategyOffset + 2) % STRATEGY_POOL.length],
  ];
  const activeStudent = students.find((item) => item.id === question?.studentId);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />
        {capabilityStatus !== "backend_ready" ? (
          <div className="mt-3">
            <FallbackPreviewHint />
          </div>
        ) : null}

        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-zinc-800">虚拟课堂群聊（面板内）</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {lastGeneratedAt
                  ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                  : "当前展示的是生成后的虚拟学生提问。"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onRegenerate}
          >
            重新生成
          </Button>
        </div>

        <div className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-[11px] text-zinc-500">虚拟学生</p>
            <div className="mt-2 space-y-2">
              {students.map((student) => (
                <div key={student.id} className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-[10px] text-zinc-700">
                    {student.name.slice(-1)}
                  </div>
                  <span className="text-xs text-zinc-700">{student.name}</span>
                  <span className="text-[10px] text-zinc-500">[{student.tag}]</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <MessageSquareText className="h-3.5 w-3.5" />
              <span>
                当前提问：
                {activeStudent
                  ? `${activeStudent.name}（${activeStudent.tag}）`
                  : "未选择"}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-800">
              {question?.text ?? "暂无问题，请先点击“下一轮提问”。"}
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              value={answer}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder="在这里输入你的回答..."
              className="h-9 text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="h-9 text-xs"
              onClick={onSubmitAnswer}
            >
              提交作答
            </Button>
          </div>

          {judgeText ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-700">
              {judgeText}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={onNextRound}
            >
              下一轮提问
            </Button>
            {includeStrategyPanel ? (
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-lg bg-violet-600 text-xs hover:bg-violet-500"
                onClick={onOpenStrategies}
              >
                解题锦囊
              </Button>
            ) : null}
          </div>

          {includeStrategyPanel ? (
            <div className="space-y-2">
              {visibleStrategies.map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-violet-300 bg-violet-50 p-2 text-xs text-violet-700"
                >
                  {item}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BookText className="h-4 w-4 text-zinc-600" />
            <p className="text-xs font-semibold text-zinc-800">最近生成成果</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-zinc-600"
            onClick={() => void flowContext?.onRefine?.()}
            disabled={!flowContext?.canRefine}
          >
            继续润色
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {flowContext?.latestArtifacts && flowContext.latestArtifacts.length > 0 ? (
            flowContext.latestArtifacts.slice(0, 4).map((item) => (
              <div
                key={item.artifactId}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-800">{item.title}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {new Date(item.createdAt).toLocaleString()} · {item.status}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => void flowContext.onExportArtifact?.(item.artifactId)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  下载
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-[11px] text-zinc-500">
              还没有历史成果。生成完成后会自动出现在这里，方便你随时下载。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
