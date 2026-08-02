"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import type { QuizAnswer, QuizQuestionDelivery } from "@/features/artifacts/quizzes/contract";
import {
  quizAnswersEqual,
  quizAnswerToSurveyValue,
  quizDeliveryToSurveyJson,
  surveyValueToQuizAnswer,
} from "@/features/artifacts/quizzes/survey-adapter";
import { QuizMarkdown } from "./QuizMarkdown";
import { quizMarkdownToSafeHtml } from "./quiz-markdown";

function renderSurveyMarkdown(
  _sender: Model,
  options: {
    html?: string;
    text: string;
  },
) {
  options.html = quizMarkdownToSafeHtml(options.text);
}

export function QuizSurveyRuntime({
  answers,
  onAnswer,
  onPageChanged,
  pageIndex,
  readOnly = false,
  showChrome = true,
  showPrompt = true,
  snapshot,
}: {
  answers: ReadonlyMap<string, QuizAnswer>;
  onAnswer?: (questionId: string, answer: QuizAnswer) => void;
  onPageChanged?: (pageIndex: number) => void;
  pageIndex: number;
  readOnly?: boolean;
  showChrome?: boolean;
  showPrompt?: boolean;
  snapshot: QuizQuestionDelivery;
}) {
  const t = useTranslations("Quiz");
  const falseLabel = t("false");
  const trueLabel = t("true");
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const synchronizingAnswers = useRef(false);
  const model = useMemo(() => {
    const next = new Model(
      quizDeliveryToSurveyJson(snapshot, { false: falseLabel, true: trueLabel }),
    );
    next.onTextMarkdown.add(renderSurveyMarkdown);
    next.mode = readOnly ? "display" : "edit";
    for (const [questionId, answer] of answersRef.current) {
      next.setValue(questionId, quizAnswerToSurveyValue(answer));
    }
    return next;
  }, [falseLabel, readOnly, snapshot, trueLabel]);
  const [currentPage, setCurrentPage] = useState(pageIndex);

  useEffect(
    () => () => {
      model.onTextMarkdown.remove(renderSurveyMarkdown);
    },
    [model],
  );

  useEffect(() => {
    model.currentPageNo = Math.min(pageIndex, snapshot.questions.length - 1);
    setCurrentPage(model.currentPageNo);
  }, [model, pageIndex, snapshot.questions.length]);

  useEffect(() => {
    synchronizingAnswers.current = true;
    try {
      for (const question of snapshot.questions) {
        const answer = answers.get(question.questionId);
        if (!answer) {
          if (model.getValue(question.questionId) !== undefined) {
            model.clearValue(question.questionId);
          }
          continue;
        }
        const modelAnswer = surveyValueToQuizAnswer(
          snapshot,
          question.questionId,
          model.getValue(question.questionId),
        );
        if (!quizAnswersEqual(answer, modelAnswer)) {
          model.setValue(question.questionId, quizAnswerToSurveyValue(answer));
        }
      }
    } finally {
      synchronizingAnswers.current = false;
    }
  }, [answers, model, snapshot]);

  useEffect(() => {
    const valueChanged = (_sender: Model, options: { name: string; value: unknown }) => {
      if (synchronizingAnswers.current) return;
      const nextAnswer = surveyValueToQuizAnswer(snapshot, options.name, options.value);
      if (quizAnswersEqual(answersRef.current.get(options.name), nextAnswer)) return;
      onAnswer?.(options.name, nextAnswer);
    };
    const pageChanged = () => {
      setCurrentPage(model.currentPageNo);
      onPageChanged?.(model.currentPageNo);
    };
    model.onValueChanged.add(valueChanged);
    model.onCurrentPageChanged.add(pageChanged);
    return () => {
      model.onValueChanged.remove(valueChanged);
      model.onCurrentPageChanged.remove(pageChanged);
    };
  }, [model, onAnswer, onPageChanged, snapshot]);

  const question = snapshot.questions[currentPage];
  if (!question) return null;
  return (
    <div className="quiz-survey-runtime">
      {showChrome ? (
        <div className="mb-5 flex items-center justify-between text-xs text-[var(--workspace-text-muted)]">
          <span>
            {t("surveyPosition", { current: currentPage + 1, total: snapshot.questions.length })}
          </span>
          <span>{t("surveyPoints", { points: question.points })}</span>
        </div>
      ) : null}
      {showChrome && snapshot.navigationMode === "free" ? (
        <nav aria-label={t("questionNavigation")} className="mb-5 flex flex-wrap gap-2">
          {snapshot.questions.map((candidate, index) => (
            <button
              type="button"
              aria-current={index === currentPage ? "step" : undefined}
              aria-label={t("questionNumber", { number: index + 1 })}
              key={candidate.questionId}
              onClick={() => {
                model.currentPageNo = index;
              }}
              className={`h-8 min-w-8 rounded-lg border px-2 text-xs ${
                index === currentPage
                  ? "border-[var(--app-primary)] bg-[var(--app-primary)] text-[var(--app-on-primary)]"
                  : answers.has(candidate.questionId)
                    ? "border-[var(--studio-accent-text)] text-[var(--studio-accent-text)]"
                    : "border-[var(--workspace-border)]"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </nav>
      ) : null}
      {showPrompt ? <QuizMarkdown markdown={question.promptMarkdown} /> : null}
      <Survey model={model} />
      {showChrome ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={currentPage === 0 || snapshot.navigationMode === "sequential"}
            onClick={() => model.prevPage()}
            className="rounded-lg border border-[var(--workspace-border)] px-4 py-2 text-sm disabled:opacity-40"
          >
            {t("previous")}
          </button>
          <button
            type="button"
            disabled={currentPage >= snapshot.questions.length - 1}
            onClick={() => model.nextPage()}
            className="rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm text-[var(--app-on-primary)] disabled:opacity-40"
          >
            {t("next")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
