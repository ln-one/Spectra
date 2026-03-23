import { MessageSquareText, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";

interface PreviewStepProps {
  answer: string;
  judgeText: string;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  isSubmittingTurn?: boolean;
  onAnswerChange: (value: string) => void;
  onSubmitAnswer: () => void;
}

interface BackendTurnItem {
  student: string;
  question: string;
  feedback?: string;
  score?: number;
  teacherHint?: string;
}

function normalizeStudentLabel(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return "虚拟学生";
  const row = value as Record<string, unknown>;
  if (typeof row.name === "string" && row.name.trim()) return row.name.trim();
  if (typeof row.label === "string" && row.label.trim())
    return row.label.trim();
  if (typeof row.id === "string" && row.id.trim()) return row.id.trim();
  return "虚拟学生";
}

function parseBackendTurns(flowContext?: ToolFlowContext): BackendTurnItem[] {
  if (!flowContext?.resolvedArtifact) return [];
  if (flowContext.resolvedArtifact.contentKind !== "json") return [];
  if (
    !flowContext.resolvedArtifact.content ||
    typeof flowContext.resolvedArtifact.content !== "object"
  ) {
    return [];
  }

  const content = flowContext.resolvedArtifact.content as Record<
    string,
    unknown
  >;
  const rawTurns = Array.isArray(content.turns) ? content.turns : [];

  const turns: BackendTurnItem[] = [];
  for (const turn of rawTurns) {
    if (!turn || typeof turn !== "object") continue;
    const row = turn as Record<string, unknown>;
    const student = normalizeStudentLabel(row.student ?? row.student_profile);
    const question =
      typeof row.question === "string" && row.question.trim()
        ? row.question.trim()
        : typeof row.student_question === "string" &&
            row.student_question.trim()
          ? row.student_question.trim()
          : "";
    if (!question) continue;
    turns.push({
      student,
      question,
      feedback:
        typeof row.feedback === "string" && row.feedback.trim()
          ? row.feedback.trim()
          : undefined,
      score: typeof row.score === "number" ? row.score : undefined,
      teacherHint:
        typeof row.teacher_hint === "string" && row.teacher_hint.trim()
          ? row.teacher_hint.trim()
          : undefined,
    });
  }
  return turns;
}

export function PreviewStep({
  answer,
  judgeText,
  lastGeneratedAt,
  flowContext,
  isSubmittingTurn = false,
  onAnswerChange,
  onSubmitAnswer,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实问答预演内容。";
  const backendTurns = parseBackendTurns(flowContext);
  const activeTurn = backendTurns[backendTurns.length - 1] ?? null;
  const displayJudgeText = judgeText || activeTurn?.feedback || "";
  const canSubmit = capabilityStatus === "backend_ready" && !!activeTurn;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4">
          <p className="text-sm font-semibold text-zinc-900">实时问答预演</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {lastGeneratedAt
              ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
              : "这里只展示后端返回的真实问答预演。"}
          </p>
        </div>

        {activeTurn ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <MessagesSquare className="h-4 w-4" />
                <span>当前发言学生：{activeTurn.student}</span>
              </div>
              <p className="mt-3 text-sm text-zinc-900">
                {activeTurn.question}
              </p>
              {activeTurn.teacherHint ? (
                <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-700">
                  教师提示：{activeTurn.teacherHint}
                </p>
              ) : null}
              {typeof activeTurn.score === "number" ? (
                <p className="mt-2 text-[11px] text-zinc-500">
                  当前评分：{activeTurn.score}
                </p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Input
                value={answer}
                onChange={(event) => onAnswerChange(event.target.value)}
                placeholder="输入你的回答，直接提交给当前虚拟学生"
                className="h-9 text-xs"
              />
              <Button
                type="button"
                size="sm"
                className="h-9 text-xs"
                onClick={onSubmitAnswer}
                disabled={isSubmittingTurn || !answer.trim() || !canSubmit}
              >
                {isSubmittingTurn ? "提交中" : "提交作答"}
              </Button>
            </div>

            {displayJudgeText ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {displayJudgeText}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <MessageSquareText className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              暂未收到后端真实预演内容
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              当前不再展示前端虚拟群聊示意，等待后端 turns
              返回后会直接进入真实预演。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
