"use client";

import { Check, MoveVertical, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { QuizQuestion, QuizRevisionContent } from "@/features/artifacts/quizzes/contract";
import {
  buildQuizProposalDiff,
  type QuizProposalQuestionDiff,
} from "@/features/artifacts/quizzes/proposal-diff";
import { QuizMarkdown } from "./QuizMarkdown";

type ReviewMode = "preview" | "saving";

function questionTypeLabel(question: QuizQuestion, t: ReturnType<typeof useTranslations<"Quiz">>) {
  if (question.type === "single_choice") return t("singleChoice");
  if (question.type === "multiple_choice") return t("multipleChoice");
  return t("trueFalse");
}

function difficultyLabel(question: QuizQuestion, t: ReturnType<typeof useTranslations<"Quiz">>) {
  if (question.difficulty === "easy") return t("easy");
  if (question.difficulty === "hard") return t("hard");
  return t("medium");
}

function answerLabel(question: QuizQuestion, t: ReturnType<typeof useTranslations<"Quiz">>) {
  if (question.type === "true_false") return question.correctAnswer ? t("true") : t("false");
  const ids =
    question.type === "single_choice"
      ? new Set([question.correctOptionId])
      : new Set(question.correctOptionIds);
  return question.options
    .filter((option) => ids.has(option.optionId))
    .map((option) => option.text)
    .join("、");
}

function isCorrectOption(question: QuizQuestion, optionId: string) {
  if (question.type === "true_false") return false;
  if (question.type === "single_choice") return question.correctOptionId === optionId;
  return question.correctOptionIds.includes(optionId);
}

function statusLabel(
  item: QuizProposalQuestionDiff,
  t: ReturnType<typeof useTranslations<"Quiz">>,
) {
  if (item.status === "added") return t("proposalAdded");
  if (item.status === "deleted") return t("proposalDeleted");
  if (item.status === "updated") return t("proposalUpdated");
  if (item.moved) return t("proposalMoved");
  return null;
}

function QuestionBadge({
  item,
  t,
}: {
  item: QuizProposalQuestionDiff;
  t: ReturnType<typeof useTranslations<"Quiz">>;
}) {
  if (item.status === "added") return <Plus className="h-3.5 w-3.5" aria-hidden />;
  if (item.status === "deleted") return <Trash2 className="h-3.5 w-3.5" aria-hidden />;
  if (item.moved && item.status === "unchanged")
    return <MoveVertical className="h-3.5 w-3.5" aria-hidden />;
  if (item.status === "updated") return <span aria-hidden>～</span>;
  return <span className="sr-only">{t("proposalUnchanged")}</span>;
}

function MarkdownDiff({
  after,
  before,
  changed,
  t,
}: {
  after: string;
  before: string;
  changed: boolean;
  t: ReturnType<typeof useTranslations<"Quiz">>;
}) {
  if (!changed)
    return (
      <div className="text-[var(--workspace-text-primary)]">
        <QuizMarkdown markdown={after} />
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-[var(--workspace-surface-muted)] px-3 py-2.5 text-[var(--workspace-text-muted)]">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide">
          {t("proposalBefore")}
        </p>
        <div className="opacity-70 line-through decoration-current/45">
          <QuizMarkdown markdown={before} />
        </div>
      </div>
      <div className="border-l-2 border-violet-500 px-3 py-1 text-[var(--workspace-text-primary)]">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
          {t("proposalAfter")}
        </p>
        <QuizMarkdown markdown={after} />
      </div>
    </div>
  );
}

function ValueDiff({
  after,
  before,
  label,
  t,
}: {
  after: string;
  before: string;
  label: string;
  t: ReturnType<typeof useTranslations<"Quiz">>;
}) {
  return (
    <div className="rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]/45 p-3">
      <p className="text-[10px] font-semibold text-[var(--workspace-text-muted)]">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--workspace-text-muted)] line-through decoration-current/45">
          <span className="sr-only">{t("proposalBefore")}: </span>
          {before}
        </span>
        <span aria-hidden>→</span>
        <span className="font-semibold text-[var(--workspace-text-primary)]">
          <span className="sr-only">{t("proposalAfter")}: </span>
          {after}
        </span>
      </div>
    </div>
  );
}

export function QuizProposalReview({
  after,
  before,
  error,
  initialQuestionId,
  mode,
  onAccept,
  onDiscard,
  summary,
}: {
  after: QuizRevisionContent;
  before: QuizRevisionContent;
  error: boolean;
  initialQuestionId?: string | null;
  mode: ReviewMode;
  onAccept: () => void;
  onDiscard: () => void;
  summary: string;
}) {
  const t = useTranslations("Quiz");
  const diff = useMemo(() => buildQuizProposalDiff(before, after), [after, before]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    initialQuestionId ?? null,
  );
  const visibleQuestions = diff.questions;

  const selected =
    visibleQuestions.find((question) => question.questionId === selectedQuestionId) ??
    visibleQuestions.find((question) => question.questionId === initialQuestionId) ??
    visibleQuestions.find((question) => question.status !== "unchanged" || question.moved) ??
    visibleQuestions[0] ??
    null;
  const displayedQuestion = selected?.after ?? selected?.before ?? null;
  const settingsChanged = Object.values(diff.settings).some(Boolean);

  return (
    <div
      data-testid="quiz-proposal-review"
      className="flex h-[calc(100dvh-10rem)] min-h-[540px] max-h-[820px] flex-col overflow-hidden bg-[var(--workspace-surface)]"
    >
      <header className="z-10 flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--workspace-text-primary)]">
              {t("proposalPreviewCount", { count: diff.changeCount })}
            </p>
            <p className="truncate text-xs text-[var(--workspace-text-muted)]">{summary}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={mode === "saving"}
            onClick={onAccept}
            className="rounded-lg border border-violet-500/45 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-500/20 disabled:opacity-50 dark:text-violet-200"
          >
            {mode === "saving" ? t("savingRevision") : t("applyProposal")}
          </button>
          <button
            type="button"
            disabled={mode === "saving"}
            onClick={onDiscard}
            className="rounded-lg border border-[var(--workspace-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {t("discardProposal")}
          </button>
        </div>
        {error ? (
          <p role="alert" className="basis-full text-xs text-[var(--app-danger)]">
            {t("proposalSaveFailed")}
          </p>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[68px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col items-center border-r border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]/55 px-2 py-4">
          <nav
            aria-label={t("proposalQuestionList")}
            className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-1"
          >
            {visibleQuestions.map((item) => {
              const index = item.nextIndex ?? item.previousIndex ?? 0;
              const label = statusLabel(item, t);
              const selectedItem = item.questionId === selected?.questionId;
              return (
                <button
                  type="button"
                  aria-current={selectedItem ? "step" : undefined}
                  aria-label={`${t("questionNumber", { number: index + 1 })}${label ? `，${label}` : ""}`}
                  key={item.questionId}
                  onClick={() => setSelectedQuestionId(item.questionId)}
                  className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                    selectedItem
                      ? "border-[var(--studio-emphasis)] bg-[var(--studio-emphasis)] text-[var(--studio-on-emphasis)] shadow-sm"
                      : "border-[var(--workspace-border)] bg-[var(--workspace-surface)] text-[var(--workspace-text-muted)]"
                  }`}
                >
                  {index + 1}
                  {label ? (
                    <span
                      className={`absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-[var(--workspace-surface-muted)] px-0.5 text-[9px] ${
                        item.status === "deleted"
                          ? "bg-rose-600 text-white"
                          : "bg-violet-600 text-white"
                      }`}
                    >
                      <QuestionBadge item={item} t={t} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-h-0 overflow-y-auto overscroll-y-contain px-6 py-7 2xl:px-10">
          <div className="mx-auto w-full max-w-[820px] space-y-5">
            {settingsChanged ? (
              <section className="rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold text-[var(--workspace-text-primary)]">
                  {t("proposalQuizSettingsChanged")}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {diff.settings.title ? (
                    <ValueDiff
                      after={after.title}
                      before={before.title}
                      label={t("editorTitle")}
                      t={t}
                    />
                  ) : null}
                  {diff.settings.description ? (
                    <div className="sm:col-span-2">
                      <p className="mb-2 text-[10px] font-semibold text-[var(--workspace-text-muted)]">
                        {t("editorDescription")}
                      </p>
                      <MarkdownDiff
                        after={after.descriptionMarkdown}
                        before={before.descriptionMarkdown}
                        changed
                        t={t}
                      />
                    </div>
                  ) : null}
                  {diff.settings.feedbackMode ? (
                    <ValueDiff
                      after={
                        after.settings.feedbackMode === "immediate"
                          ? t("immediateFeedback")
                          : t("afterSubmissionFeedback")
                      }
                      before={
                        before.settings.feedbackMode === "immediate"
                          ? t("immediateFeedback")
                          : t("afterSubmissionFeedback")
                      }
                      label={t("feedbackMode")}
                      t={t}
                    />
                  ) : null}
                  {diff.settings.navigationMode ? (
                    <ValueDiff
                      after={
                        after.settings.navigationMode === "free"
                          ? t("freeNavigation")
                          : t("sequentialNavigation")
                      }
                      before={
                        before.settings.navigationMode === "free"
                          ? t("freeNavigation")
                          : t("sequentialNavigation")
                      }
                      label={t("navigationMode")}
                      t={t}
                    />
                  ) : null}
                </div>
              </section>
            ) : null}

            {selected && displayedQuestion ? (
              <section className="rounded-2xl p-4 text-[var(--workspace-text-primary)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {t("questionNumber", {
                          number: (selected.nextIndex ?? selected.previousIndex ?? 0) + 1,
                        })}
                      </h3>
                      {statusLabel(selected, t) ? (
                        <span className="rounded-full border border-violet-500/30 bg-violet-500/8 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                          {statusLabel(selected, t)}
                        </span>
                      ) : null}
                      {selected.moved ? (
                        <span className="rounded-full border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-300">
                          {t("proposalMovePosition", {
                            after: (selected.nextIndex ?? 0) + 1,
                            before: (selected.previousIndex ?? 0) + 1,
                          })}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--workspace-text-muted)]">
                      {questionTypeLabel(displayedQuestion, t)} ·{" "}
                      {difficultyLabel(displayedQuestion, t)} ·{" "}
                      {t("surveyPoints", { points: displayedQuestion.points })}
                    </p>
                  </div>
                </div>

                {selected.status === "deleted" ? (
                  <div className="mt-5 rounded-xl border border-rose-500/30 bg-[var(--workspace-surface-muted)] p-4 opacity-70">
                    <p className="mb-2 text-[11px] font-semibold text-rose-600 dark:text-rose-300">
                      {t("proposalWillDelete")}
                    </p>
                    <div className="line-through decoration-rose-500/70">
                      <QuizMarkdown markdown={displayedQuestion.promptMarkdown} />
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-5">
                    {selected.before && selected.after ? (
                      <div className="grid gap-2 sm:grid-cols-3">
                        {selected.fields.includes("type") ? (
                          <ValueDiff
                            after={questionTypeLabel(selected.after, t)}
                            before={questionTypeLabel(selected.before, t)}
                            label={t("questionType")}
                            t={t}
                          />
                        ) : null}
                        {selected.fields.includes("difficulty") ? (
                          <ValueDiff
                            after={difficultyLabel(selected.after, t)}
                            before={difficultyLabel(selected.before, t)}
                            label={t("difficulty")}
                            t={t}
                          />
                        ) : null}
                        {selected.fields.includes("points") ? (
                          <ValueDiff
                            after={t("surveyPoints", { points: selected.after.points })}
                            before={t("surveyPoints", { points: selected.before.points })}
                            label={t("points")}
                            t={t}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-[var(--workspace-text-muted)]">
                        {t("proposalPrompt")}
                      </p>
                      <MarkdownDiff
                        after={selected.after?.promptMarkdown ?? displayedQuestion.promptMarkdown}
                        before={selected.before?.promptMarkdown ?? displayedQuestion.promptMarkdown}
                        changed={selected.fields.includes("prompt")}
                        t={t}
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold text-[var(--workspace-text-muted)]">
                        {t("answerOptions")}
                      </p>
                      {displayedQuestion.type === "true_false" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {[true, false].map((value) => (
                            <div
                              key={String(value)}
                              className="flex items-center gap-2 rounded-xl border border-[var(--workspace-border)] p-3 text-sm"
                            >
                              {displayedQuestion.correctAnswer === value ? (
                                <Check className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <span className="h-4 w-4 rounded-full border border-[var(--workspace-border)]" />
                              )}
                              {value ? t("true") : t("false")}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selected.options.map((option) => {
                            const value = option.after ?? option.before;
                            if (!value) return null;
                            const correct = selected.after
                              ? isCorrectOption(selected.after, value.optionId)
                              : false;
                            return (
                              <div
                                key={value.optionId}
                                className={`rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-3 py-2.5 text-sm ${
                                  option.status === "added"
                                    ? "border-l-2 border-l-violet-500"
                                    : option.status === "deleted"
                                      ? "border-l-2 border-l-rose-500 opacity-55 line-through"
                                      : option.status === "updated"
                                        ? "border-l-2 border-l-violet-500"
                                        : option.moved
                                          ? "border-l-2 border-l-violet-500 border-dashed"
                                          : ""
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`flex h-5 min-w-5 items-center justify-center rounded-full border text-[10px] ${correct ? "border-emerald-500 text-emerald-600" : "border-[var(--workspace-border)]"}`}
                                  >
                                    {correct ? <Check className="h-3 w-3" /> : null}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    {option.after?.text ?? option.before?.text}
                                  </span>
                                  {option.status !== "unchanged" || option.moved ? (
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                        option.status === "added"
                                          ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                          : option.status === "deleted"
                                            ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                                            : "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                      }`}
                                    >
                                      {option.status === "added"
                                        ? t("proposalAdded")
                                        : option.status === "deleted"
                                          ? t("proposalDeleted")
                                          : option.status === "updated"
                                            ? t("proposalUpdated")
                                            : t("proposalMoved")}
                                    </span>
                                  ) : null}
                                </div>
                                {option.status === "updated" && option.before ? (
                                  <p className="mt-1 pl-7 text-xs text-[var(--workspace-text-muted)] line-through decoration-current/45">
                                    {t("proposalBefore")}: {option.before.text}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {selected.before && selected.after && selected.fields.includes("answer") ? (
                      <div className="grid gap-3 rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]/35 p-4 text-sm sm:grid-cols-2">
                        <div>
                          <span className="text-xs text-[var(--workspace-text-muted)]">
                            {t("proposalBeforeAnswer")}
                          </span>
                          <p className="mt-1 line-through opacity-65">
                            {answerLabel(selected.before, t)}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-[var(--workspace-text-muted)]">
                            {t("proposalAfterAnswer")}
                          </span>
                          <p className="mt-1 font-semibold text-violet-700 dark:text-violet-300">
                            {answerLabel(selected.after, t)}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {selected.status === "added" || selected.fields.includes("explanation") ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold text-[var(--workspace-text-muted)]">
                          {t("explanation")}
                        </p>
                        <MarkdownDiff
                          after={
                            selected.after?.explanationMarkdown ??
                            displayedQuestion.explanationMarkdown
                          }
                          before={
                            selected.before?.explanationMarkdown ??
                            displayedQuestion.explanationMarkdown
                          }
                          changed={selected.fields.includes("explanation")}
                          t={t}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
