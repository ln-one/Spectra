"use client";

import { Flag } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { QuizAnswer, QuizDeliverySnapshot } from "@/features/artifacts/quizzes/contract";
import { isQuizAnswerEmpty } from "@/features/artifacts/quizzes/grading";
import { QuizMarkdown } from "./QuizMarkdown";

const QuizSurveyRuntime = dynamic(
  () => import("./QuizSurveyRuntime").then((module) => module.QuizSurveyRuntime),
  { ssr: false },
);

export function QuizPlayerFrame({
  afterQuestion,
  answers,
  className = "h-[calc(100dvh-10rem)] min-h-[540px] max-h-[820px]",
  finishLabel,
  flagged = new Set<string>(),
  footerStatus,
  focusedQuestionId,
  onAnswer,
  onFinish,
  onPageIndexChange,
  onToggleFlag,
  pageIndex,
  snapshot,
}: {
  afterQuestion?: ReactNode;
  answers: ReadonlyMap<string, QuizAnswer>;
  className?: string;
  finishLabel: string;
  flagged?: ReadonlySet<string>;
  footerStatus?: ReactNode;
  focusedQuestionId?: string | null;
  onAnswer?: (questionId: string, answer: QuizAnswer) => void;
  onFinish: () => void;
  onPageIndexChange: (pageIndex: number) => void;
  onToggleFlag?: (questionId: string) => void;
  pageIndex: number;
  snapshot: QuizDeliverySnapshot;
}) {
  const t = useTranslations("Quiz");
  const currentQuestion = snapshot.questions[pageIndex];
  if (!currentQuestion) return null;
  const answeredCount = snapshot.questions.filter(
    (question) => !isQuizAnswerEmpty(answers.get(question.questionId)),
  ).length;
  const isLastQuestion = pageIndex === snapshot.questions.length - 1;
  const currentQuestionFlagged = flagged.has(currentQuestion.questionId);

  return (
    <div
      data-testid="quiz-player-frame"
      className={`grid w-full grid-cols-[68px_minmax(0,1fr)] overflow-hidden bg-[var(--workspace-surface)] ${className}`}
    >
      <aside className="flex min-h-0 flex-col items-center border-r border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]/55 px-2 py-4">
        <nav
          aria-label={t("questionNavigation")}
          className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-1"
        >
          {snapshot.questions.map((question, index) => {
            const answered = !isQuizAnswerEmpty(answers.get(question.questionId));
            const isFlagged = flagged.has(question.questionId);
            const answerStatus = answered
              ? t("answeredQuestion", { number: index + 1 })
              : t("unansweredQuestion", { number: index + 1 });
            return (
              <button
                type="button"
                aria-current={index === pageIndex ? "step" : undefined}
                aria-label={
                  isFlagged ? t("flaggedQuestion", { status: answerStatus }) : answerStatus
                }
                disabled={snapshot.navigationMode === "sequential" && index > pageIndex}
                key={question.questionId}
                onClick={() => onPageIndexChange(index)}
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  index === pageIndex
                    ? "border-[var(--studio-emphasis)] bg-[var(--studio-emphasis)] text-[var(--studio-on-emphasis)] shadow-sm"
                    : answered
                      ? "border-emerald-500/55 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "border-[var(--workspace-border)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)]"
                }`}
              >
                {index + 1}
                {isFlagged ? (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--workspace-surface-muted)] bg-amber-500" />
                ) : null}
              </button>
            );
          })}
        </nav>
        <span className="mt-3 text-[10px] font-medium text-[var(--workspace-text-muted)]">
          {answeredCount}/{snapshot.questions.length}
        </span>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-7 2xl:px-10">
          <div
            data-ai-focus={focusedQuestionId === currentQuestion.questionId ? "true" : undefined}
            className={`mx-auto w-full max-w-[820px] rounded-2xl p-4 transition-shadow ${
              focusedQuestionId === currentQuestion.questionId
                ? "ring-2 ring-violet-500/70 shadow-lg shadow-violet-500/10"
                : ""
            }`}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--workspace-text-muted)]">
                <span>{t("questionNumber", { number: pageIndex + 1 })}</span>
                <span aria-hidden>·</span>
                <span>{t("surveyPoints", { points: currentQuestion.points })}</span>
              </div>
              {onToggleFlag ? (
                <button
                  type="button"
                  aria-pressed={currentQuestionFlagged}
                  onClick={() => onToggleFlag(currentQuestion.questionId)}
                  className={`group flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs outline-none transition-[color,background-color,border-color,box-shadow,transform] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-amber-500/45 ${
                    currentQuestionFlagged
                      ? "border-amber-500/70 bg-amber-500/12 text-amber-700 shadow-sm hover:bg-amber-500/18 dark:text-amber-300"
                      : "border-[var(--workspace-border)] text-[var(--workspace-text-muted)] hover:border-amber-500/45 hover:bg-amber-500/8 hover:text-amber-700 dark:hover:text-amber-300"
                  }`}
                >
                  <Flag
                    className="h-3.5 w-3.5 transition-transform group-active:scale-90"
                    fill={currentQuestionFlagged ? "currentColor" : "none"}
                  />
                  {currentQuestionFlagged ? t("unflag") : t("flag")}
                </button>
              ) : null}
            </div>
            <QuizMarkdown markdown={currentQuestion.promptMarkdown} />
            <QuizSurveyRuntime
              answers={answers}
              pageIndex={pageIndex}
              onPageChanged={onPageIndexChange}
              showChrome={false}
              showPrompt={false}
              snapshot={snapshot}
              {...(onAnswer ? { onAnswer } : {})}
            />
            {afterQuestion}
          </div>
        </div>
        <div className="grid min-h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-5 py-3">
          <button
            type="button"
            disabled={pageIndex === 0 || snapshot.navigationMode === "sequential"}
            onClick={() => onPageIndexChange(Math.max(0, pageIndex - 1))}
            className="w-fit rounded-lg border border-[var(--workspace-border)] px-4 py-2 text-sm disabled:opacity-35"
          >
            {t("previous")}
          </button>
          <div className="text-xs text-[var(--workspace-text-muted)]">
            {footerStatus ??
              t("answeredProgress", { answered: answeredCount, total: snapshot.questions.length })}
          </div>
          <button
            type="button"
            onClick={() =>
              isLastQuestion
                ? onFinish()
                : onPageIndexChange(Math.min(snapshot.questions.length - 1, pageIndex + 1))
            }
            className="ml-auto rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm font-medium text-[var(--app-on-primary)]"
          >
            {isLastQuestion ? finishLabel : t("next")}
          </button>
        </div>
      </section>
    </div>
  );
}
