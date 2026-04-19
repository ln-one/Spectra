import {
  Clock3,
  MessageSquareText,
  MessagesSquare,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArtifactWorkbenchShell } from "../ArtifactWorkbenchShell";
import type { ToolFlowContext } from "../types";
import { buildArtifactWorkbenchViewModel } from "../workbenchViewModel";

interface PreviewStepProps {
  answer: string;
  judgeText: string;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  isSubmittingTurn?: boolean;
  turnRuntimeState?: Record<string, unknown> | null;
  turnResult?: {
    turnAnchor?: string;
    studentQuestion?: string;
    score?: number | null;
    nextFocus?: string;
    studentProfile?: string;
  } | null;
  onAnswerChange: (value: string) => void;
  onSubmitAnswer: () => void;
}

interface BackendTurnItem {
  turnAnchor?: string;
  student: string;
  question: string;
  teacherAnswer?: string;
  feedback?: string;
  score?: number;
  nextFocus?: string;
  teacherHint?: string;
}

interface BackendSimulationSummary {
  summary: string;
  keyPoints: string[];
  questionFocus?: string;
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
      turnAnchor:
        typeof row.turn_anchor === "string" && row.turn_anchor.trim()
          ? row.turn_anchor.trim()
          : undefined,
      student,
      question,
      teacherAnswer:
        typeof row.teacher_answer === "string" && row.teacher_answer.trim()
          ? row.teacher_answer.trim()
          : undefined,
      feedback:
        typeof row.feedback === "string" && row.feedback.trim()
          ? row.feedback.trim()
          : undefined,
      score: typeof row.score === "number" ? row.score : undefined,
      nextFocus:
        typeof row.next_focus === "string" && row.next_focus.trim()
          ? row.next_focus.trim()
          : undefined,
      teacherHint:
        typeof row.teacher_hint === "string" && row.teacher_hint.trim()
          ? row.teacher_hint.trim()
          : undefined,
    });
  }
  return turns;
}

function parseBackendSummary(
  flowContext?: ToolFlowContext
): BackendSimulationSummary | null {
  if (!flowContext?.resolvedArtifact) return null;
  if (flowContext.resolvedArtifact.contentKind !== "json") return null;
  if (
    !flowContext.resolvedArtifact.content ||
    typeof flowContext.resolvedArtifact.content !== "object"
  ) {
    return null;
  }

  const content = flowContext.resolvedArtifact.content as Record<
    string,
    unknown
  >;
  const summary =
    typeof content.summary === "string" ? content.summary.trim() : "";
  const keyPoints = Array.isArray(content.key_points)
    ? content.key_points
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0
        )
        .map((item) => item.trim())
    : [];
  const questionFocus =
    typeof content.question_focus === "string" && content.question_focus.trim()
      ? content.question_focus.trim()
      : undefined;

  if (!summary && keyPoints.length === 0 && !questionFocus) return null;
  return { summary, keyPoints, questionFocus };
}

export function PreviewStep({
  answer,
  judgeText,
  lastGeneratedAt,
  flowContext,
  isSubmittingTurn = false,
  turnRuntimeState = null,
  turnResult = null,
  onAnswerChange,
  onSubmitAnswer,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ??
    "正在等待后端返回真实课堂预演内容。";
  const backendTurns = parseBackendTurns(flowContext);
  const backendSummary = parseBackendSummary(flowContext);
  const activeTurn = backendTurns[backendTurns.length - 1] ?? null;
  const displayJudgeText = judgeText || activeTurn?.feedback || "";
  const canSubmit = Boolean(
    capabilityStatus === "backend_ready" && flowContext?.canFollowUpTurn
  );
  const canChatRefine =
    flowContext?.supportsChatRefine && typeof flowContext?.onRefine === "function";
  const refineLabel =
    flowContext?.display?.actionLabels.refine ?? "调整追问方向";
  const followUpTurnLabel = flowContext?.followUpTurnLabel ?? "继续追问";
  const activeFocus = turnResult?.nextFocus ?? backendSummary?.questionFocus ?? null;
  const viewModel = buildArtifactWorkbenchViewModel(
    flowContext,
    lastGeneratedAt,
    activeTurn?.feedback || backendSummary?.summary || "等待后端返回真实课堂预演内容。"
  );

  return (
    <ArtifactWorkbenchShell
      flowContext={{
        ...flowContext,
        capabilityStatus,
        capabilityReason,
        latestRunnableState:
          flowContext?.latestRunnableState ?? turnRuntimeState ?? null,
      }}
      viewModel={viewModel}
      emptyState={
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
          <MessageSquareText className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-3 text-sm font-medium text-zinc-700">
            暂未收到后端真实预演内容
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            当前不再渲染前端模拟对话，只展示后端真实返回结果。
          </p>
        </div>
      }
    >
      {activeTurn || backendSummary ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900">课堂预演工作面</div>
            {canChatRefine ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => void flowContext?.onRefine?.()}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {refineLabel}
              </Button>
            ) : null}
          </div>

        {activeFocus ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            当前轮焦点：{activeFocus}
          </div>
        ) : null}

          <div className="space-y-3">
            {activeTurn ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <MessagesSquare className="h-4 w-4" />
                  <span>当前学生画像：{activeTurn.student}</span>
                  {activeTurn.turnAnchor ? (
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                      {activeTurn.turnAnchor}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-zinc-900">
                  {activeTurn.question}
                </p>
                {activeTurn.teacherAnswer ? (
                  <p className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] text-violet-700">
                    上一轮教师回应：{activeTurn.teacherAnswer}
                  </p>
                ) : null}
                {activeTurn.teacherHint ? (
                  <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-700">
                    教师提示：{activeTurn.teacherHint}
                  </p>
                ) : null}
                {typeof activeTurn.score === "number" ? (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    当前得分：{activeTurn.score}
                  </p>
                ) : null}
                {activeTurn.nextFocus ? (
                  <p className="mt-2 text-[11px] text-amber-600">
                    下一轮焦点：{activeTurn.nextFocus}
                  </p>
                ) : null}
              </div>
            ) : null}

            {!activeTurn && backendSummary ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                {backendSummary.questionFocus ? (
                  <p className="text-xs font-medium text-zinc-500">
                    追问焦点：{backendSummary.questionFocus}
                  </p>
                ) : null}
                {backendSummary.summary ? (
                  <p className="mt-2 text-sm leading-6 text-zinc-900">
                    {backendSummary.summary}
                  </p>
                ) : null}
                {backendSummary.keyPoints.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-700">
                    {backendSummary.keyPoints.map((point, index) => (
                      <li key={`${point}-${index}`}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {turnResult?.studentQuestion ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                新一轮学生提问：{turnResult.studentQuestion}
              </div>
            ) : null}
            {typeof turnResult?.score === "number" ? (
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                本轮得分：{turnResult.score}
              </div>
            ) : null}
            {turnResult?.nextFocus ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                下一轮建议关注：{turnResult.nextFocus}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Input
                value={answer}
                onChange={(event) => onAnswerChange(event.target.value)}
                placeholder="输入你的教师回应，继续这轮课堂预演"
                className="h-9 text-xs"
              />
              <Button
                type="button"
                size="sm"
                className="h-9 text-xs"
                onClick={onSubmitAnswer}
                disabled={isSubmittingTurn || !answer.trim() || !canSubmit}
              >
                {isSubmittingTurn ? "续轮中..." : followUpTurnLabel}
              </Button>
            </div>

            {displayJudgeText ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {displayJudgeText}
              </div>
            ) : null}

            {backendTurns.length > 1 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-zinc-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  轮次历史
                </div>
                <div className="mt-3 space-y-3">
                  {backendTurns.slice(-4).map((turn, index, turns) => (
                    <div
                      key={`${turn.turnAnchor ?? "turn"}-${index}`}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                        <span>
                          第 {backendTurns.length - turns.length + index + 1} 轮
                        </span>
                        {turn.turnAnchor ? <span>{turn.turnAnchor}</span> : null}
                      </div>
                      <p className="mt-2 text-xs font-medium text-zinc-800">
                        学生提问：{turn.question}
                      </p>
                      {turn.teacherAnswer ? (
                        <p className="mt-1 text-xs text-zinc-600">
                          教师回应：{turn.teacherAnswer}
                        </p>
                      ) : null}
                      {turn.feedback ? (
                        <p className="mt-1 text-xs text-emerald-700">
                          反馈：{turn.feedback}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-600">
                <p className="font-semibold text-zinc-800">当前轮续接锚点</p>
                <p className="mt-1 break-all">
                  {turnResult?.turnAnchor ?? activeTurn?.turnAnchor ?? "等待下一轮生成"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-600">
                <p className="font-semibold text-zinc-800">历史轮次</p>
                <p className="mt-1 break-all">
                  已记录 {backendTurns.length} 轮真实对话
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </ArtifactWorkbenchShell>
  );
}
