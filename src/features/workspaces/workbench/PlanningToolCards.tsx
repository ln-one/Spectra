"use client";

import { type ToolCallMessagePartProps, useAui, useAuiState } from "@assistant-ui/react";
import { ArrowRight, ArrowUp, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parsePlanningQuestionBatch, workspacePlanSchema } from "@/features/agents/planning-tools";

type PlanningToolCardProps = ToolCallMessagePartProps & {
  onPlanningFinished?: (() => void) | undefined;
};

function appendUserMessage(aui: ReturnType<typeof useAui>, text: string, intent: "chat" | "plan") {
  aui.thread().append({
    content: [{ text, type: "text" }],
    metadata: {
      custom: {
        spectraIntent: intent,
      },
    },
  });
}

export function AskUserCard({ args, onPlanningFinished }: PlanningToolCardProps) {
  const t = useTranslations("Workbench");
  const aui = useAui();
  const isLatestMessage = useAuiState(
    (state) => state.thread.messages.at(-1)?.id === state.message.id,
  );
  const batch = parsePlanningQuestionBatch(args);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [skippedQuestions, setSkippedQuestions] = useState<number[]>([]);
  const [customQuestionIndex, setCustomQuestionIndex] = useState<number | null>(() =>
    batch?.questions[0]?.options?.length ? null : 0,
  );
  const [customAnswer, setCustomAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (customQuestionIndex !== null) customInputRef.current?.focus();
  }, [customQuestionIndex]);
  if (!batch || !isLatestMessage || typeof document === "undefined") return null;
  const target = document.getElementById("workspace-planning-composer-slot");
  if (!target) return null;
  const questions = batch.questions;
  const question = questions[currentQuestionIndex];
  if (!question) return null;
  const selected = answers[currentQuestionIndex] ?? [];
  const isMultiSelect = question.selectionMode === "multi_select";
  const customOpen = customQuestionIndex === currentQuestionIndex || !question.options?.length;

  function submitRound(nextAnswers: Record<number, string[]>, nextSkipped: number[]) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const lines = questions.flatMap((batchQuestion, index) => [
      `${index + 1}. ${batchQuestion.question}`,
      t("planAnswerLine", {
        answer: nextSkipped.includes(index)
          ? t("planSkippedAnswer")
          : (nextAnswers[index] ?? []).join("、"),
      }),
    ]);
    appendUserMessage(aui, [t("planAnswersHeading"), ...lines].join("\n"), "plan");
  }

  function finishQuestion(values: string[] | null) {
    if (isSubmitting) return;
    const nextAnswers = values ? { ...answers, [currentQuestionIndex]: values } : answers;
    const nextSkipped = values
      ? skippedQuestions.filter((index) => index !== currentQuestionIndex)
      : [...new Set([...skippedQuestions, currentQuestionIndex])];
    if (currentQuestionIndex === questions.length - 1) {
      submitRound(nextAnswers, nextSkipped);
      return;
    }
    setAnswers(nextAnswers);
    setSkippedQuestions(nextSkipped);
    setCurrentQuestionIndex((index) => index + 1);
    setCustomQuestionIndex(null);
    setCustomAnswer("");
  }

  function cancelPlanning() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    appendUserMessage(aui, t("planCancelMessage"), "chat");
    onPlanningFinished?.();
  }

  return createPortal(
    <div className="flex max-h-[min(62vh,560px)] flex-col px-1 pb-1 pt-2">
      <div className="flex items-start gap-3 px-2 pb-3">
        <p className="min-w-0 flex-1 text-base font-semibold leading-6">{question.question}</p>
        <span className="pt-0.5 text-xs text-[var(--workspace-text-muted)]">
          {currentQuestionIndex + 1}/{questions.length}
        </span>
        <button
          type="button"
          aria-label={t("planCancel")}
          onClick={cancelPlanning}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--workspace-text-muted)] hover:bg-[var(--studio-surface-subtle)] hover:text-[var(--workspace-text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {question.options?.length ? (
        <div className="space-y-2 overflow-y-auto px-1">
          {question.options.map((option, index) => {
            const isSelected = selected.includes(option.label);
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={isSelected}
                disabled={isSubmitting}
                onClick={() => {
                  setCustomQuestionIndex(null);
                  setCustomAnswer("");
                  if (!isMultiSelect) {
                    finishQuestion([option.label]);
                    return;
                  }
                  setAnswers((current) => ({
                    ...current,
                    [currentQuestionIndex]: isSelected
                      ? selected.filter((label) => label !== option.label)
                      : [...selected, option.label],
                  }));
                }}
                className="group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-transparent bg-[var(--studio-surface-subtle)] px-3 py-2.5 text-left transition-colors hover:border-[var(--workspace-border)] aria-pressed:border-[var(--studio-border-strong)]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--workspace-border)] text-sm text-[var(--workspace-text-muted)]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{option.label}</span>
                  {option.description ? (
                    <span className="ml-2 text-sm text-[var(--workspace-text-muted)]">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {!isMultiSelect || isSelected ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--workspace-text-muted)]" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-2 flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--workspace-border)] px-3 py-2 focus-within:border-[var(--studio-border-strong)]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--workspace-border)] text-[var(--workspace-text-muted)]">
          <Pencil className="h-4 w-4" />
        </span>
        {customOpen ? (
          <input
            ref={customInputRef}
            value={customAnswer}
            disabled={isSubmitting}
            onChange={(event) => setCustomAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && customAnswer.trim()) {
                event.preventDefault();
                finishQuestion([customAnswer.trim()]);
              }
            }}
            placeholder={t("planOtherAnswer")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--workspace-text-muted)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setAnswers((current) => ({ ...current, [currentQuestionIndex]: [] }));
              setCustomQuestionIndex(currentQuestionIndex);
            }}
            className="min-w-0 flex-1 text-left text-sm text-[var(--workspace-text-muted)]"
          >
            {t("planOtherOption")}
          </button>
        )}
        {customOpen ? (
          <button
            type="button"
            aria-label={t("planSubmitAnswer")}
            disabled={!customAnswer.trim() || isSubmitting}
            onClick={() => finishQuestion([customAnswer.trim()])}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--studio-emphasis)] text-[var(--studio-on-emphasis)] disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        ) : null}
        {isMultiSelect && !customOpen ? (
          <button
            type="button"
            aria-label={t("planSubmitAnswer")}
            disabled={selected.length === 0 || isSubmitting}
            onClick={() => finishQuestion(selected)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--studio-emphasis)] text-[var(--studio-on-emphasis)] disabled:opacity-40"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => finishQuestion(null)}
          className="shrink-0 rounded-full border border-[var(--workspace-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--studio-surface-subtle)]"
        >
          {t("planSkip")}
        </button>
      </div>
    </div>,
    target,
  );
}

export function SubmitPlanCard({ args, onPlanningFinished }: PlanningToolCardProps) {
  const t = useTranslations("Workbench");
  const aui = useAui();
  const isLatestMessage = useAuiState(
    (state) => state.thread.messages.at(-1)?.id === state.message.id,
  );
  const plan = workspacePlanSchema.safeParse(args);
  const [feedback, setFeedback] = useState("");
  if (!plan.success) return null;
  return (
    <div className="my-3 rounded-2xl border border-[var(--workspace-border)] p-4">
      <h3 className="text-base font-semibold">{plan.data.title}</h3>
      <p className="mt-1 text-sm text-[var(--workspace-text-muted)]">{plan.data.summary}</p>
      <div className="mt-4 space-y-3">
        {plan.data.sections.map((section) => (
          <section key={section.title}>
            <h4 className="text-sm font-semibold">{section.title}</h4>
            <p className="mt-1 whitespace-pre-line text-sm text-[var(--workspace-text-muted)]">
              {section.body}
            </p>
          </section>
        ))}
      </div>
      {isLatestMessage ? (
        <>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={t("planRevisionPlaceholder")}
            className="mt-4 min-h-11 w-full resize-none rounded-xl border border-[var(--workspace-border)] bg-transparent px-3 py-2 text-sm outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!feedback.trim()}
              onClick={() =>
                appendUserMessage(
                  aui,
                  t("planRevisionMessage", { feedback: feedback.trim() }),
                  "plan",
                )
              }
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            >
              {t("planRequestRevision")}
            </button>
            <button
              type="button"
              onClick={() => {
                appendUserMessage(aui, t("planCancelMessage"), "chat");
                onPlanningFinished?.();
              }}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {t("planCancel")}
            </button>
            <button
              type="button"
              onClick={() => {
                appendUserMessage(aui, t("planApproveMessage"), "chat");
                onPlanningFinished?.();
              }}
              className="rounded-lg bg-[var(--studio-emphasis)] px-3 py-2 text-sm font-medium text-[var(--studio-on-emphasis)]"
            >
              {t("planApprove")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
