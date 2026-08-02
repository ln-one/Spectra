"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useMutation } from "@tanstack/react-query";
import { ClipboardCheck, Eye, Pencil, Play, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuizEditProposal } from "@/features/artifacts/proposal-contract";
import type {
  QuizAnswer,
  QuizDeliverySnapshot,
  QuizRevisionContent,
} from "@/features/artifacts/quizzes/contract";
import { createQuizDeliverySnapshot } from "@/features/artifacts/quizzes/delivery";
import { isQuizAnswerEmpty } from "@/features/artifacts/quizzes/grading";
import type { QuizFocus } from "@/features/artifacts/quizzes/refine";
import type { QuizArtifact } from "@/features/artifacts/quizzes/types";
import {
  artifactSuggestionQueryKeys,
  fetchArtifactSuggestions,
  regenerateArtifactSuggestions,
} from "@/features/artifacts/suggestions/queries";
import {
  ArtifactGenerationView,
  ArtifactStartView,
  ArtifactWorkspaceShell,
} from "./ArtifactWorkspacePrimitives";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";
import { QuizEditor } from "./QuizEditor";
import { QuizMarkdown } from "./QuizMarkdown";
import { QuizPlayerFrame } from "./QuizPlayerFrame";
import { QuizProposalReview } from "./QuizProposalReview";
import { acceptQuizProposal, issueQuizIds, saveQuizRevision } from "./quiz-workspace-client";
import { useArtifactSuggestions } from "./useArtifactSuggestions";
import { emptyQuizAnswerFor, type QuizView, useQuizAttemptSession } from "./useQuizAttemptSession";

function currentView(value: string | null): QuizView {
  return value === "attempt" || value === "result" || value === "edit" || value === "preview"
    ? value
    : value === "submit_review"
      ? "attempt"
      : "overview";
}

export function quizFocusEqual(left: QuizFocus | null | undefined, right: QuizFocus | null) {
  if (!left || !right) return left == null && right === null;
  return (
    left.kind === right.kind &&
    left.revisionId === right.revisionId &&
    left.questionIds.length === right.questionIds.length &&
    left.questionIds.every((questionId, index) => questionId === right.questionIds[index])
  );
}

export async function leaveQuizArtifact(
  view: QuizView,
  flushPendingSaves: () => Promise<void>,
  onBack: () => void,
) {
  if (view === "attempt") await flushPendingSaves();
  onBack();
}

function describeAnswer(
  question: QuizRevisionContent["questions"][number],
  answer: QuizAnswer | null | undefined,
  labels: { false: string; true: string; unanswered: string },
) {
  if (!answer || isQuizAnswerEmpty(answer)) return labels.unanswered;
  if (question.type === "true_false" && answer.type === "true_false") {
    return answer.value ? labels.true : labels.false;
  }
  if (question.type === "single_choice" && answer.type === "single_choice") {
    return question.options.find((option) => option.optionId === answer.optionId)?.text ?? "—";
  }
  if (question.type === "multiple_choice" && answer.type === "multiple_choice") {
    const selected = new Set(answer.optionIds);
    return question.options
      .filter((option) => selected.has(option.optionId))
      .map((option) => option.text)
      .join("、");
  }
  return "—";
}

function describeDeliveryAnswer(
  question: QuizDeliverySnapshot["questions"][number],
  answer: QuizAnswer,
  labels: { false: string; true: string },
) {
  if (question.type === "true_false" && answer.type === "true_false") {
    return answer.value ? labels.true : labels.false;
  }
  if (question.type === "single_choice" && answer.type === "single_choice") {
    return question.options.find((option) => option.optionId === answer.optionId)?.text ?? "—";
  }
  if (question.type === "multiple_choice" && answer.type === "multiple_choice") {
    const selected = new Set(answer.optionIds);
    return question.options
      .filter((option) => selected.has(option.optionId))
      .map((option) => option.text)
      .join("、");
  }
  return "—";
}

function correctAnswerFor(question: QuizRevisionContent["questions"][number]): QuizAnswer {
  if (question.type === "single_choice")
    return { optionId: question.correctOptionId, type: question.type };
  if (question.type === "multiple_choice")
    return { optionIds: question.correctOptionIds, type: question.type };
  return { type: question.type, value: question.correctAnswer };
}

function QuizGenerationSkeleton({ status }: { status: string }) {
  return (
    <div
      data-testid="quiz-generation-skeleton"
      role="status"
      aria-live="polite"
      className="min-h-[520px]"
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--studio-accent-text)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--studio-accent)] motion-reduce:animate-none" />
        {status}
      </div>
      <div
        aria-hidden
        className="mt-8 grid min-h-[420px] grid-cols-[64px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--workspace-surface-muted)]"
      >
        <div className="flex flex-col items-center gap-3 border-r border-[var(--studio-border)] px-3 py-6">
          {[0, 1, 2, 3, 4].map((item) => (
            <span
              key={item}
              className="h-8 w-8 rounded-lg border border-[var(--studio-border)] bg-[var(--workspace-surface)]"
            />
          ))}
        </div>
        <div className="flex min-w-0 flex-col bg-[var(--workspace-surface)] p-8">
          <div className="flex items-center justify-between">
            <span className="h-4 w-24 animate-pulse rounded bg-[var(--studio-surface-subtle)] motion-reduce:animate-none" />
            <span className="h-8 w-8 rounded-lg border border-[var(--studio-border)]" />
          </div>
          <div className="mt-8 space-y-3">
            <span className="block h-4 w-[82%] animate-pulse rounded bg-[var(--studio-surface-subtle)] motion-reduce:animate-none" />
            <span className="block h-4 w-[58%] animate-pulse rounded bg-[var(--studio-surface-subtle)] motion-reduce:animate-none" />
          </div>
          <div className="mt-8 space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="flex h-12 items-center gap-3 rounded-xl border border-[var(--studio-border)] px-4"
              >
                <span className="h-4 w-4 rounded-full border border-[var(--workspace-text-muted)]" />
                <span className="h-3 w-[46%] rounded bg-[var(--studio-surface-subtle)]" />
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-[var(--studio-border)] pt-5">
            <span className="h-9 w-24 rounded-lg border border-[var(--studio-border)]" />
            <span className="h-3 w-28 rounded bg-[var(--studio-surface-subtle)]" />
            <span className="h-9 w-24 rounded-lg bg-[var(--studio-surface-subtle)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuizWorkspaceView({
  artifact,
  conversationId,
  failureCode,
  onArtifactUpdated,
  onBack,
  onSuggestion,
  pendingTitle,
  phase,
  workspaceId,
  focus,
  proposal,
  readOnly = false,
  onFocusChange,
  onProposalDismiss,
}: {
  artifact: QuizArtifact | null;
  conversationId: string;
  failureCode: string | null;
  onArtifactUpdated: (artifact: QuizArtifact) => void;
  onBack: () => void;
  onSuggestion: (prompt: string) => void;
  pendingTitle: string | null;
  phase: ArtifactWorkspacePhase;
  workspaceId: string;
  focus?: QuizFocus | null;
  proposal?: QuizEditProposal | null;
  readOnly?: boolean;
  onFocusChange?: (focus: QuizFocus | null) => void;
  onProposalDismiss?: () => void;
}) {
  const t = useTranslations("Quiz");
  const locale = useLocale() === "en-US" ? "en-US" : "zh-CN";
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = currentView(searchParams?.get("quizView") ?? null);
  const view = readOnly && requestedView === "edit" ? "overview" : requestedView;
  const attemptId = searchParams?.get("attempt") ?? null;
  const [proposalState, setProposalState] = useState<"error" | "idle" | "saving">("idle");
  const [resolvedProposalRunId, setResolvedProposalRunId] = useState<string | null>(null);
  const [acceptedPreview, setAcceptedPreview] = useState<{
    artifactId: string;
    baseRevisionId: string;
    content: QuizRevisionContent;
    revisionId: string;
  } | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<Map<string, QuizAnswer>>(new Map());
  const [previewFlagged, setPreviewFlagged] = useState<Set<string>>(new Set());
  const [exitingArtifact, setExitingArtifact] = useState(false);
  const artifactId = artifact?.id ?? null;
  const canonicalContent = artifact?.currentRevision.content ?? null;
  const proposalMatchesCurrent = Boolean(
    proposal &&
      artifact &&
      proposal.artifactId === artifact.id &&
      proposal.baseRevisionId === artifact.currentRevision.id,
  );
  const activeProposal =
    proposalMatchesCurrent && proposal?.runId !== resolvedProposalRunId ? (proposal ?? null) : null;
  const promotionPreview = acceptedPreview?.artifactId === artifactId ? acceptedPreview : null;
  const revisionContent = activeProposal?.content ?? promotionPreview?.content ?? canonicalContent;
  const answerLabels = useMemo(
    () => ({ false: t("false"), true: t("true"), unanswered: t("unanswered") }),
    [t],
  );
  const suggestions = useArtifactSuggestions({
    enabled: phase === "idle" && !artifact,
    fetchSuggestions: (afterGeneration, waitOnly) =>
      fetchArtifactSuggestions(workspaceId, locale, "quiz", afterGeneration, waitOnly),
    queryKey: artifactSuggestionQueryKeys.suggestions(workspaceId, conversationId, locale, "quiz"),
    regenerateSuggestions: (afterGeneration) =>
      regenerateArtifactSuggestions(workspaceId, locale, "quiz", afterGeneration),
  });

  const navigate = useCallback(
    (nextView: QuizView, nextAttemptId: string | null = attemptId) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      next.set("quizView", nextView);
      if (nextAttemptId) next.set("attempt", nextAttemptId);
      else next.delete("attempt");
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [attemptId, router, searchParams],
  );

  const {
    activeAttempt,
    attempt,
    attemptQuery,
    attemptsQuery,
    checkMutation,
    currentQuestion,
    feedbackByQuestion,
    flagged,
    flushPendingSaves,
    history,
    localAnswers,
    pageIndex,
    promoteAttempt,
    queueSave,
    retryCurrentSave,
    saveState,
    setPageIndex,
    setSubmitDialogOpen,
    startMutation,
    submitDialogOpen,
    submitMutation,
    submittedAttempts,
    toggleCurrentFlag,
    unansweredQuestions,
  } = useQuizAttemptSession({
    artifact,
    attemptId,
    navigate,
    view,
    workspaceId,
  });

  const proposalRunId = useRef<string | null>(proposal?.runId ?? null);
  useEffect(() => {
    if ((proposal?.runId ?? null) === proposalRunId.current) return;
    proposalRunId.current = proposal?.runId ?? null;
    if (!proposal || proposal.runId === resolvedProposalRunId) return;
    setProposalState("idle");
    setResolvedProposalRunId(null);
    setAcceptedPreview(null);
  }, [proposal, resolvedProposalRunId]);

  useEffect(() => {
    if (
      acceptedPreview &&
      (acceptedPreview.artifactId !== artifactId ||
        (artifact?.currentRevision.id !== acceptedPreview.baseRevisionId &&
          artifact?.currentRevision.id !== acceptedPreview.revisionId) ||
        artifact?.currentRevision.id === acceptedPreview.revisionId)
    ) {
      setAcceptedPreview(null);
    }
  }, [acceptedPreview, artifact?.currentRevision.id, artifactId]);

  const previewSnapshot = useMemo(
    () =>
      artifact && revisionContent
        ? createQuizDeliverySnapshot({
            artifactId: artifact.id,
            content: revisionContent,
            revisionId: artifact.currentRevision.id,
          })
        : null,
    [artifact, revisionContent],
  );
  const answersForSurvey = localAnswers;
  const focusedQuestionId =
    view === "preview"
      ? (previewSnapshot?.questions[pageIndex]?.questionId ?? null)
      : view === "attempt"
        ? (currentQuestion?.questionId ?? null)
        : null;

  const desiredFocus = useMemo<QuizFocus | null>(
    () =>
      artifact && focusedQuestionId && !activeProposal
        ? {
            kind: "quiz_questions",
            questionIds: [focusedQuestionId],
            revisionId: artifact.currentRevision.id,
          }
        : null,
    [activeProposal, artifact, focusedQuestionId],
  );

  useEffect(() => {
    if (quizFocusEqual(focus, desiredFocus)) return;
    onFocusChange?.(desiredFocus);
  }, [desiredFocus, focus, onFocusChange]);

  const exitArtifact = useCallback(async () => {
    if (exitingArtifact) return;
    setExitingArtifact(true);
    try {
      await leaveQuizArtifact(view, flushPendingSaves, onBack);
    } catch {
      // The save session exposes the failure and retry action without discarding local answers.
    } finally {
      setExitingArtifact(false);
    }
  }, [exitingArtifact, flushPendingSaves, onBack, view]);

  const acceptProposal = useCallback(async () => {
    if (!artifact || !activeProposal) return;
    setProposalState("saving");
    try {
      if (view === "attempt") await flushPendingSaves();
      const payload = await acceptQuizProposal({
        artifactId: artifact.id,
        attemptId: view === "attempt" ? attemptId : null,
        conversationId,
        expectedRevisionId: activeProposal.baseRevisionId,
        runId: activeProposal.runId,
        workspaceId,
      });
      setAcceptedPreview({
        artifactId: artifact.id,
        baseRevisionId: activeProposal.baseRevisionId,
        content: payload.artifact.currentRevision.content,
        revisionId: payload.acceptedRevisionId,
      });
      setResolvedProposalRunId(activeProposal.runId);
      setProposalState("idle");
      const promotedAttempt = payload.attempt;
      if (promotedAttempt) await promoteAttempt(promotedAttempt);
      onArtifactUpdated(payload.artifact);
      onProposalDismiss?.();
    } catch {
      setProposalState("error");
    }
  }, [
    activeProposal,
    artifact,
    attemptId,
    conversationId,
    flushPendingSaves,
    onArtifactUpdated,
    onProposalDismiss,
    promoteAttempt,
    view,
    workspaceId,
  ]);

  const questionTypeCounts = { multiple_choice: 0, single_choice: 0, true_false: 0 };
  for (const question of revisionContent?.questions ?? []) {
    questionTypeCounts[question.type] += 1;
  }

  const revisionMutation = useMutation({
    mutationFn: (content: QuizRevisionContent) => {
      if (!artifact) throw new Error("quiz_not_ready");
      return saveQuizRevision({ artifact, content, conversationId, workspaceId });
    },
    onSuccess: (nextArtifact) => {
      onArtifactUpdated(nextArtifact);
      navigate("overview", null);
    },
  });

  let body: React.ReactNode;
  if (!artifact && phase === "idle") {
    body = (
      <ArtifactStartView
        description={t("startDescription")}
        error={suggestions.error}
        errorLabel={t("suggestionsUnavailable")}
        Icon={ClipboardCheck}
        loading={suggestions.loading}
        loadingLabel={t("preparingSuggestions")}
        onRefresh={suggestions.refresh}
        onRetry={() => void suggestions.retry()}
        onSuggestion={onSuggestion}
        refreshing={suggestions.refreshing}
        refreshLabel={t("retrySuggestions")}
        suggestions={suggestions.suggestions}
        title={t("title")}
      />
    );
  } else if (!artifact) {
    const generationStatus = phase === "finalizing" ? t("finalizing") : t("generating");
    body = (
      <ArtifactGenerationView
        failedMessage={failureCode ?? t("generationFailed")}
        hasRenderableContent={phase !== "failed"}
        phase={phase}
        status={generationStatus}
        testId="quiz-generation-placeholder"
      >
        <QuizGenerationSkeleton status={generationStatus} />
      </ArtifactGenerationView>
    );
  } else if (view === "edit") {
    body = (
      <QuizEditor
        content={artifact.currentRevision.content}
        issueIds={(count) => issueQuizIds(count, workspaceId)}
        onCancel={() => navigate("overview", null)}
        onSave={(content) => revisionMutation.mutate(content)}
        saveError={revisionMutation.isError}
        saving={revisionMutation.isPending}
      />
    );
  } else if (view === "preview" && previewSnapshot) {
    body = (
      <QuizPlayerFrame
        answers={previewAnswers}
        finishLabel={t("finishPreview")}
        flagged={previewFlagged}
        footerStatus={t("previewNoAttempt")}
        focusedQuestionId={focus?.questionIds[0] ?? null}
        onAnswer={(questionId, answer) =>
          setPreviewAnswers((current) => new Map(current).set(questionId, answer))
        }
        onFinish={() => navigate("overview", null)}
        onPageIndexChange={setPageIndex}
        onToggleFlag={(questionId) =>
          setPreviewFlagged((current) => {
            const next = new Set(current);
            if (next.has(questionId)) next.delete(questionId);
            else next.add(questionId);
            return next;
          })
        }
        pageIndex={pageIndex}
        snapshot={previewSnapshot}
      />
    );
  } else if ((view === "attempt" || view === "result") && attemptQuery.isLoading) {
    body = (
      <div className="flex h-[calc(100dvh-10rem)] min-h-[540px] items-center justify-center">
        <div
          role="status"
          className="flex items-center gap-2 text-sm text-[var(--workspace-text-muted)]"
        >
          <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {t("loadingAttempt")}
        </div>
      </div>
    );
  } else if ((view === "attempt" || view === "result") && attemptQuery.isError) {
    body = (
      <div className="flex h-[calc(100dvh-10rem)] min-h-[540px] flex-col items-center justify-center gap-4">
        <p role="alert" className="text-sm text-[var(--app-danger)]">
          {t("attemptLoadFailed")}
        </p>
        <button
          type="button"
          onClick={() => void attemptQuery.refetch()}
          className="rounded-lg border border-[var(--workspace-border)] px-4 py-2 text-sm"
        >
          {t("retry")}
        </button>
      </div>
    );
  } else if (view === "attempt" && attempt?.state === "in_progress") {
    const currentFeedback = currentQuestion
      ? feedbackByQuestion.get(currentQuestion.questionId)
      : null;
    body = (
      <QuizPlayerFrame
        afterQuestion={
          currentQuestion && currentFeedback ? (
            <div className="mt-5 rounded-xl bg-[var(--workspace-surface-muted)] p-4">
              <strong>{currentFeedback.correct ? t("answerCorrect") : t("answerIncorrect")}</strong>
              <p className="mt-2 text-sm text-[var(--workspace-text-muted)]">
                {t("correctAnswerPrefix")}
                {describeDeliveryAnswer(
                  currentQuestion,
                  currentFeedback.correctAnswer ?? emptyQuizAnswerFor(currentQuestion),
                  answerLabels,
                )}
              </p>
              <div className="mt-2">
                <QuizMarkdown markdown={currentFeedback.explanationMarkdown ?? ""} />
              </div>
            </div>
          ) : null
        }
        answers={answersForSurvey}
        finishLabel={t("submitQuiz")}
        flagged={flagged}
        footerStatus={
          attempt.delivery.feedbackMode === "immediate" && currentQuestion ? (
            <button
              type="button"
              disabled={
                checkMutation.isPending ||
                saveState === "saving" ||
                isQuizAnswerEmpty(localAnswers.get(currentQuestion.questionId))
              }
              onClick={() => checkMutation.mutate(currentQuestion.questionId)}
              className="rounded-lg border border-[var(--workspace-border)] px-4 py-2 text-sm disabled:opacity-40"
            >
              {t("checkAnswer")}
            </button>
          ) : undefined
        }
        focusedQuestionId={focus?.questionIds[0] ?? null}
        onAnswer={(questionId, answer) => queueSave(questionId, answer, flagged.has(questionId))}
        onFinish={() => {
          submitMutation.reset();
          setSubmitDialogOpen(true);
        }}
        onPageIndexChange={setPageIndex}
        onToggleFlag={() => toggleCurrentFlag()}
        pageIndex={pageIndex}
        snapshot={attempt.delivery}
      />
    );
  } else if (view === "result" && attempt?.result) {
    const answerById = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
    const correctCount = attempt.result.content.questions.filter(
      (question) => answerById.get(question.questionId)?.correct === true,
    ).length;
    const unansweredCount = attempt.result.content.questions.filter((question) =>
      isQuizAnswerEmpty(answerById.get(question.questionId)?.answer),
    ).length;
    const incorrectCount = attempt.result.content.questions.length - correctCount - unansweredCount;
    body = (
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-7">
          <p className="text-sm text-[var(--workspace-text-muted)]">{t("score")}</p>
          <p className="mt-2 text-4xl font-bold">
            {attempt.result.score} / {attempt.result.totalPoints}
          </p>
          <p className="mt-4 text-sm text-[var(--workspace-text-muted)]">
            {t("resultStats", {
              correct: correctCount,
              incorrect: incorrectCount,
              unanswered: unansweredCount,
            })}
          </p>
        </div>
        {attempt.result.content.questions.map((question, index) => {
          const answer = answerById.get(question.questionId);
          const unanswered = isQuizAnswerEmpty(answer?.answer);
          return (
            <section
              key={question.questionId}
              className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-6"
            >
              <div className="mb-3 flex justify-between">
                <strong>{t("questionNumber", { number: index + 1 })}</strong>
                <span
                  className={
                    unanswered
                      ? "text-[var(--workspace-text-muted)]"
                      : answer?.correct
                        ? "text-emerald-600"
                        : "text-[var(--app-danger)]"
                  }
                >
                  {unanswered ? t("unanswered") : answer?.correct ? t("correct") : t("incorrect")}
                </span>
              </div>
              <QuizMarkdown markdown={question.promptMarkdown} />
              <dl className="mt-4 grid gap-2 text-sm">
                <div>
                  <dt className="font-medium">{t("yourAnswer")}</dt>
                  <dd className="text-[var(--workspace-text-muted)]">
                    {describeAnswer(question, answer?.answer, answerLabels)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">{t("correctAnswer")}</dt>
                  <dd className="text-[var(--workspace-text-muted)]">
                    {describeAnswer(question, correctAnswerFor(question), answerLabels)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg bg-[var(--workspace-surface-muted)] p-4">
                <QuizMarkdown markdown={question.explanationMarkdown} />
              </div>
            </section>
          );
        })}
      </div>
    );
  } else {
    const overviewContent = revisionContent ?? artifact.currentRevision.content;
    body = (
      <div className="min-h-full p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0">
            <section className="border-b border-[var(--workspace-border)] pb-5">
              <p className="text-xs font-semibold tracking-wide text-[var(--studio-accent-text)] uppercase">
                {t("overview")}
              </p>
              <div className="mt-3 max-w-2xl text-base leading-7">
                <QuizMarkdown
                  markdown={overviewContent.descriptionMarkdown || t("readyDescription")}
                />
              </div>
              <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-border)]">
                <div className="bg-[var(--workspace-surface)] p-3">
                  <dt className="text-[11px] text-[var(--workspace-text-muted)]">
                    {t("questionCountLabel")}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold">
                    {t("questionCount", {
                      count: overviewContent.questions.length,
                    })}
                  </dd>
                </div>
                <div className="bg-[var(--workspace-surface)] p-3">
                  <dt className="text-[11px] text-[var(--workspace-text-muted)]">{t("points")}</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    {t("pointCount", {
                      count: overviewContent.questions.reduce(
                        (sum, question) => sum + question.points,
                        0,
                      ),
                    })}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--workspace-text-muted)]">
                <span>
                  {overviewContent.settings.feedbackMode === "immediate"
                    ? t("immediateFeedbackNotice")
                    : t("afterSubmissionFeedbackNotice")}
                </span>
                {overviewContent.settings.navigationMode === "sequential" ? (
                  <span>{t("sequentialNavigationNotice")}</span>
                ) : null}
              </div>
            </section>

            <section className="pt-5">
              <h3 className="text-sm font-semibold">{t("quizStructure")}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  t("singleChoiceCount", { count: questionTypeCounts.single_choice }),
                  t("multipleChoiceCount", { count: questionTypeCounts.multiple_choice }),
                  t("trueFalseCount", { count: questionTypeCounts.true_false }),
                ].map((label, index) => (
                  <div
                    key={label}
                    className="relative overflow-hidden rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-4 py-3"
                  >
                    <span
                      aria-hidden
                      className={`absolute inset-y-0 left-0 w-1 ${
                        index === 0
                          ? "bg-blue-500"
                          : index === 1
                            ? "bg-violet-500"
                            : "bg-emerald-500"
                      }`}
                    />
                    <p className="text-sm font-medium">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t border-[var(--workspace-border)] pt-4">
                <h3 className="text-sm font-semibold">{t("questionMap")}</h3>
                <ol
                  className={`mt-3 grid gap-2 ${
                    overviewContent.questions.length <= 12
                      ? "grid-cols-1 sm:grid-cols-2"
                      : "grid-cols-[repeat(auto-fit,minmax(44px,1fr))]"
                  }`}
                >
                  {overviewContent.questions.map((question, index) => {
                    const typeLabel =
                      question.type === "single_choice"
                        ? t("singleChoice")
                        : question.type === "multiple_choice"
                          ? t("multipleChoice")
                          : t("trueFalse");
                    const shortTypeLabel =
                      question.type === "single_choice"
                        ? t("singleChoiceShort")
                        : question.type === "multiple_choice"
                          ? t("multipleChoiceShort")
                          : t("trueFalseShort");
                    return (
                      <li
                        key={question.questionId}
                        aria-label={t("questionHeading", {
                          number: index + 1,
                          type: typeLabel,
                        })}
                        className={`min-w-0 rounded-lg border bg-[var(--workspace-surface)] text-xs font-semibold ${
                          overviewContent.questions.length <= 12
                            ? "flex min-h-14 items-center gap-3 px-3 py-2.5"
                            : "flex h-10 items-center justify-center gap-1"
                        } ${
                          question.type === "single_choice"
                            ? "border-blue-500/45 text-blue-400"
                            : question.type === "multiple_choice"
                              ? "border-violet-500/45 text-violet-400"
                              : "border-emerald-500/45 text-emerald-400"
                        }`}
                      >
                        <span className="shrink-0 text-[var(--workspace-text-primary)]">
                          {index + 1}
                        </span>
                        {overviewContent.questions.length <= 12 ? (
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-[var(--workspace-text-primary)]">
                              {question.promptMarkdown}
                            </span>
                            <span className="mt-1 block text-[10px] font-medium opacity-80">
                              {typeLabel} · {t("surveyPoints", { points: question.points })}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium opacity-80">
                            {shortTypeLabel}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>
          </div>

          <aside className="border-t border-[var(--workspace-border)] pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t("attemptProgress")}</h3>
                <p className="mt-1 text-xs text-[var(--workspace-text-muted)]">
                  {activeAttempt
                    ? t("activeAttemptSummary")
                    : t("completedAttemptCount", { count: submittedAttempts.length })}
                </p>
              </div>
              <span className="rounded-full bg-[var(--studio-surface-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--studio-accent-text)]">
                {history.length}
              </span>
            </div>
            <div className="mt-5">
              {attemptsQuery.isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : history.length === 0 ? (
                <p className="text-sm text-[var(--workspace-text-muted)]">{t("noAttempts")}</p>
              ) : (
                <div className="space-y-2">
                  {history.map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      disabled={item.state === "abandoned"}
                      onClick={() => {
                        if (item.state === "submitted") navigate("result", item.id);
                        if (item.state === "in_progress") navigate("attempt", item.id);
                      }}
                      className="group flex w-full items-center justify-between rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-3 py-3 text-left text-sm transition-colors hover:border-[var(--studio-border-strong)] disabled:opacity-50"
                    >
                      <span className="font-medium">
                        {t("attemptNumber", { number: history.length - index })}
                      </span>
                      <span className="text-xs text-[var(--workspace-text-muted)] group-hover:text-[var(--studio-accent-text)]">
                        {item.state === "submitted"
                          ? `${item.score} / ${item.totalPoints}`
                          : item.state === "in_progress"
                            ? t("inProgress")
                            : t("abandoned")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  let shellActions: React.ReactNode = null;
  if (artifact && view === "overview") {
    shellActions = (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => navigate("preview", null)}
          aria-label={t("preview")}
          title={t("preview")}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--studio-surface-subtle)] hover:text-[var(--studio-accent-text)]"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{t("preview")}</span>
        </button>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => navigate("edit", null)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-2.5 text-xs font-medium text-[var(--studio-accent-text)] transition-colors hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-surface)]"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{t("edit")}</span>
          </button>
        ) : null}
        <button
          type="button"
          disabled={startMutation.isPending}
          onClick={() => startMutation.mutate()}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--studio-emphasis)] px-2.5 text-xs font-medium text-[var(--studio-on-emphasis)] disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {activeAttempt ? t("continue") : t("start")}
        </button>
      </div>
    );
  } else if (artifact && view === "attempt" && attempt && currentQuestion) {
    shellActions = (
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden text-[11px] text-[var(--workspace-text-muted)] xl:inline">
          {pageIndex + 1}/{attempt.delivery.questions.length}
        </span>
        <div aria-live="polite" className="flex items-center gap-1.5">
          <span
            className={`text-[11px] ${saveState === "failed" ? "text-[var(--app-danger)]" : "text-[var(--workspace-text-muted)]"}`}
          >
            {saveState === "saving"
              ? t("saving")
              : saveState === "saved"
                ? t("saved")
                : saveState === "retrying"
                  ? t("retrying")
                  : saveState === "failed"
                    ? t("saveFailed")
                    : ""}
          </span>
          {saveState === "failed" ? (
            <button type="button" onClick={retryCurrentSave} className="text-xs underline">
              {t("retry")}
            </button>
          ) : null}
        </div>
      </div>
    );
  } else if (artifact && !readOnly && (view === "preview" || view === "result")) {
    shellActions = (
      <button
        type="button"
        onClick={() => navigate("edit", null)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-2.5 text-xs font-medium text-[var(--studio-accent-text)]"
      >
        <Pencil className="h-3.5 w-3.5" />
        {t("edit")}
      </button>
    );
  }

  const proposalProjection = activeProposal
    ? {
        after: activeProposal.content,
        before: artifact?.currentRevision.content ?? activeProposal.content,
        mode: proposalState === "saving" ? ("saving" as const) : ("preview" as const),
        summary: activeProposal.summary,
      }
    : null;

  if (proposalProjection) {
    shellActions = null;
    body = (
      <QuizProposalReview
        after={proposalProjection.after}
        before={proposalProjection.before}
        error={proposalState === "error"}
        initialQuestionId={focus?.questionIds[0] ?? null}
        mode={proposalProjection.mode}
        onAccept={() => void acceptProposal()}
        onDiscard={() => {
          setProposalState("idle");
          if (activeProposal) setResolvedProposalRunId(activeProposal.runId);
          onProposalDismiss?.();
        }}
        summary={proposalProjection.summary}
      />
    );
  }

  return (
    <>
      <ArtifactWorkspaceShell
        actions={shellActions}
        backBusy={exitingArtifact}
        backLabel={t("back")}
        groundingSources={artifact?.groundingSources ?? []}
        liveScrollTestId="quiz-workspace-scroll"
        onBack={() => void exitArtifact()}
        phase={phase}
        subtitle={t("subtitle")}
        testId="quiz-workspace"
        title={artifact?.title ?? pendingTitle ?? t("title")}
        {...(artifact && (view === "attempt" || view === "preview" || view === "edit")
          ? { contentClassName: "p-0", scrollClassName: "overflow-hidden" }
          : artifact && view === "overview"
            ? { contentClassName: "p-0" }
            : {})}
      >
        {body}
      </ArtifactWorkspaceShell>
      <AlertDialog.Root open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-[121] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl">
            <AlertDialog.Title className="text-lg font-semibold">
              {t("submitConfirmTitle")}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">
              {t("submitConfirmDescription", {
                answered: (attempt?.delivery.questions.length ?? 0) - unansweredQuestions.length,
                total: attempt?.delivery.questions.length ?? 0,
                unanswered: unansweredQuestions.length,
              })}
            </AlertDialog.Description>
            {submitMutation.isError ? (
              <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">
                {t("submitFailed")}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  onClick={() => {
                    const firstUnanswered = unansweredQuestions[0];
                    if (!firstUnanswered || !attempt) return;
                    const index = attempt.delivery.questions.findIndex(
                      (question) => question.questionId === firstUnanswered.questionId,
                    );
                    if (index >= 0) setPageIndex(index);
                  }}
                  className="rounded-lg border border-[var(--workspace-border)] px-4 py-2 text-sm"
                >
                  {unansweredQuestions.length > 0 ? t("returnToUnanswered") : t("continue")}
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                disabled={
                  submitMutation.isPending || saveState === "saving" || saveState === "retrying"
                }
                onClick={() => submitMutation.mutate()}
                className="rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm font-medium text-[var(--app-on-primary)] disabled:opacity-45"
              >
                {t("submit")}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
