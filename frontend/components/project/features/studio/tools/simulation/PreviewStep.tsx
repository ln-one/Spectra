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
  turnResult?: {
    studentQuestion?: string;
    score?: number | null;
    nextFocus?: string;
    studentProfile?: string;
  } | null;
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

interface BackendSimulationSummary {
  summary: string;
  keyPoints: string[];
  questionFocus?: string;
}

function normalizeStudentLabel(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return "Virtual Student";
  const row = value as Record<string, unknown>;
  if (typeof row.name === "string" && row.name.trim()) return row.name.trim();
  if (typeof row.label === "string" && row.label.trim())
    return row.label.trim();
  if (typeof row.id === "string" && row.id.trim()) return row.id.trim();
  return "Virtual Student";
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
  turnResult = null,
  onAnswerChange,
  onSubmitAnswer,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ??
    "Waiting for backend classroom simulation content.";
  const backendTurns = parseBackendTurns(flowContext);
  const backendSummary = parseBackendSummary(flowContext);
  const activeTurn = backendTurns[backendTurns.length - 1] ?? null;
  const displayJudgeText = judgeText || activeTurn?.feedback || "";
  const canSubmit = capabilityStatus === "backend_ready";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4">
          <p className="text-sm font-semibold text-zinc-900">
            Real-time QA Simulation
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {lastGeneratedAt
              ? `Last generated: ${new Date(lastGeneratedAt).toLocaleString()}`
              : "Only real backend content is rendered in this view."}
          </p>
        </div>

        {activeTurn || backendSummary ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            {activeTurn ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <MessagesSquare className="h-4 w-4" />
                  <span>Current student: {activeTurn.student}</span>
                </div>
                <p className="mt-3 text-sm text-zinc-900">
                  {activeTurn.question}
                </p>
                {activeTurn.teacherHint ? (
                  <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-700">
                    Teacher hint: {activeTurn.teacherHint}
                  </p>
                ) : null}
                {typeof activeTurn.score === "number" ? (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Current score: {activeTurn.score}
                  </p>
                ) : null}
              </div>
            ) : null}

            {!activeTurn && backendSummary ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                {backendSummary.questionFocus ? (
                  <p className="text-xs font-medium text-zinc-500">
                    Focus: {backendSummary.questionFocus}
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
                New student question: {turnResult.studentQuestion}
              </div>
            ) : null}
            {typeof turnResult?.score === "number" ? (
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                Turn score: {turnResult.score}
              </div>
            ) : null}
            {turnResult?.nextFocus ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Next focus: {turnResult.nextFocus}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Input
                value={answer}
                onChange={(event) => onAnswerChange(event.target.value)}
                placeholder="Enter your teacher response"
                className="h-9 text-xs"
              />
              <Button
                type="button"
                size="sm"
                className="h-9 text-xs"
                onClick={onSubmitAnswer}
                disabled={isSubmittingTurn || !answer.trim() || !canSubmit}
              >
                {isSubmittingTurn ? "Submitting..." : "Submit"}
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
              This panel no longer renders frontend mock conversations.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
