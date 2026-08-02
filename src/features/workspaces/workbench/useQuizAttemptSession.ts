"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  QuizAnswer,
  QuizAttemptDetail,
  QuizDeliverySnapshot,
} from "@/features/artifacts/quizzes/contract";
import { isQuizAnswerEmpty } from "@/features/artifacts/quizzes/grading";
import type { QuizArtifact } from "@/features/artifacts/quizzes/types";
import {
  checkQuizAnswer,
  fetchQuizAttempt,
  fetchQuizAttempts,
  type QuizFeedback,
  saveQuizAnswer,
  startQuizAttempt,
  submitQuizAttempt,
} from "./quiz-workspace-client";

export type QuizView = "overview" | "attempt" | "result" | "edit" | "preview";
export type QuizSaveState = "idle" | "saving" | "saved" | "failed" | "retrying";

type PendingQuizSave = {
  answer: QuizAnswer;
  artifactId: string;
  attemptId: string;
  flagged: boolean;
  questionId: string;
};

export function emptyQuizAnswerFor(
  question: QuizDeliverySnapshot["questions"][number],
): QuizAnswer {
  if (question.type === "single_choice") return { optionId: null, type: question.type };
  if (question.type === "multiple_choice") return { optionIds: [], type: question.type };
  return { type: question.type, value: null };
}

export function useQuizAttemptSession(input: {
  artifact: QuizArtifact | null;
  attemptId: string | null;
  navigate: (view: QuizView, attemptId?: string | null) => void;
  view: QuizView;
  workspaceId: string;
}) {
  const { artifact, attemptId, navigate, view, workspaceId } = input;
  const queryClient = useQueryClient();
  const [pageIndex, setPageIndex] = useState(0);
  const [saveState, setSaveState] = useState<QuizSaveState>("idle");
  const [localAnswers, setLocalAnswers] = useState<Map<string, QuizAnswer>>(new Map());
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [feedbackByQuestion, setFeedbackByQuestion] = useState(new Map<string, QuizFeedback>());
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingSaveDrafts = useRef(new Map<string, PendingQuizSave>());
  const inFlightSaves = useRef(new Set<Promise<unknown>>());
  const hydratedAttemptId = useRef<string | null>(null);
  const attemptRevisionSyncKey = useRef<string | null>(null);
  const flushPendingSavesRef = useRef<() => Promise<void>>(async () => undefined);
  const selectedAttemptId = useRef(attemptId);
  selectedAttemptId.current = attemptId;
  const artifactId = artifact?.id ?? null;

  const attemptsQuery = useQuery({
    enabled: artifactId !== null,
    queryKey: ["quiz-attempts", workspaceId, artifactId],
    queryFn: () => {
      if (!artifactId) return [];
      return fetchQuizAttempts(artifactId, workspaceId);
    },
  });
  const attemptQuery = useQuery({
    enabled: artifactId !== null && attemptId !== null,
    queryKey: ["quiz-attempt", workspaceId, artifactId, attemptId],
    queryFn: () => {
      if (!artifactId || !attemptId) throw new Error("quiz_attempt_not_selected");
      return fetchQuizAttempt(artifactId, attemptId, workspaceId);
    },
  });

  const startMutation = useMutation({
    mutationFn: () => {
      if (!artifactId) throw new Error("quiz_not_ready");
      return startQuizAttempt(artifactId, workspaceId);
    },
    onSuccess: (attempt) => {
      queryClient.setQueryData(["quiz-attempt", workspaceId, artifactId, attempt.id], attempt);
      void attemptsQuery.refetch();
      navigate("attempt", attempt.id);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (draft: PendingQuizSave) => {
      const expectedVersion =
        queryClient
          .getQueryData<QuizAttemptDetail>([
            "quiz-attempt",
            workspaceId,
            draft.artifactId,
            draft.attemptId,
          ])
          ?.answers.find((item) => item.questionId === draft.questionId)?.version ?? 0;
      return saveQuizAnswer({ ...draft, expectedVersion, workspaceId });
    },
    onError: (_error, draft) => {
      if (
        draft.attemptId === selectedAttemptId.current &&
        !pendingSaveDrafts.current.has(draft.questionId)
      ) {
        pendingSaveDrafts.current.set(draft.questionId, draft);
        setSaveState("failed");
      }
      void queryClient.refetchQueries({
        queryKey: ["quiz-attempt", workspaceId, draft.artifactId, draft.attemptId],
      });
    },
    onSuccess: (answer, draft) => {
      queryClient.setQueryData<QuizAttemptDetail>(
        ["quiz-attempt", workspaceId, draft.artifactId, draft.attemptId],
        (current) =>
          current
            ? {
                ...current,
                answers: [
                  ...current.answers.filter((item) => item.questionId !== answer.questionId),
                  answer,
                ],
              }
            : current,
      );
    },
    scope: { id: `quiz-attempt-save:${attemptId ?? "none"}` },
  });

  const persistPendingSave = useCallback(
    async (questionId: string) => {
      const timer = saveTimers.current.get(questionId);
      if (timer) clearTimeout(timer);
      saveTimers.current.delete(questionId);
      const draft = pendingSaveDrafts.current.get(questionId);
      if (!draft) return;
      pendingSaveDrafts.current.delete(questionId);
      const operation = saveMutation.mutateAsync(draft);
      inFlightSaves.current.add(operation);
      try {
        await operation;
      } finally {
        inFlightSaves.current.delete(operation);
      }
      if (
        draft.attemptId === selectedAttemptId.current &&
        pendingSaveDrafts.current.size === 0 &&
        saveTimers.current.size === 0
      ) {
        setSaveState("saved");
      }
    },
    [saveMutation],
  );

  const queueSave = useCallback(
    (questionId: string, answer: QuizAnswer, nextFlagged: boolean) => {
      if (!artifactId || !attemptId) return;
      setLocalAnswers((current) => new Map(current).set(questionId, answer));
      pendingSaveDrafts.current.set(questionId, {
        answer,
        artifactId,
        attemptId,
        flagged: nextFlagged,
        questionId,
      });
      const existingTimer = saveTimers.current.get(questionId);
      if (existingTimer) clearTimeout(existingTimer);
      setSaveState("saving");
      saveTimers.current.set(
        questionId,
        setTimeout(() => {
          void persistPendingSave(questionId).catch(() => undefined);
        }, 450),
      );
    },
    [artifactId, attemptId, persistPendingSave],
  );

  const flushPendingSaves = useCallback(async () => {
    while (pendingSaveDrafts.current.size > 0 || inFlightSaves.current.size > 0) {
      await Promise.all([...pendingSaveDrafts.current.keys()].map(persistPendingSave));
      await Promise.all([...inFlightSaves.current]);
    }
  }, [persistPendingSave]);
  flushPendingSavesRef.current = flushPendingSaves;

  // Attempt identity owns all in-memory answer, feedback, and debounce state.
  // Cleanup starts every queued mutation before the next Attempt clears local state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when URL Attempt identity changes
  useEffect(() => {
    setPageIndex(0);
    hydratedAttemptId.current = null;
    setLocalAnswers(new Map());
    setFlagged(new Set());
    setFeedbackByQuestion(new Map());
    setSaveState("idle");
    return () => {
      for (const timer of saveTimers.current.values()) clearTimeout(timer);
      saveTimers.current.clear();
      void flushPendingSavesRef.current().catch(() => undefined);
    };
  }, [attemptId]);

  useEffect(() => {
    const attempt = attemptQuery.data;
    if (!attempt || hydratedAttemptId.current === attempt.id) return;
    hydratedAttemptId.current = attempt.id;
    setLocalAnswers(new Map(attempt.answers.map((answer) => [answer.questionId, answer.answer])));
    setFlagged(
      new Set(
        attempt.answers.filter((answer) => answer.flagged).map((answer) => answer.questionId),
      ),
    );
  }, [attemptQuery.data]);

  useEffect(() => {
    const attempt = attemptQuery.data;
    const syncKey =
      artifact && attempt
        ? `${attempt.id}:${attempt.delivery.revisionId}:${artifact.currentRevision.id}`
        : null;
    if (
      view !== "attempt" ||
      !artifact ||
      !attempt ||
      attempt.state !== "in_progress" ||
      attempt.delivery.revisionId === artifact.currentRevision.id ||
      attemptRevisionSyncKey.current === syncKey ||
      startMutation.isPending
    ) {
      return;
    }
    attemptRevisionSyncKey.current = syncKey;
    startMutation.mutate();
  }, [artifact, attemptQuery.data, startMutation.isPending, startMutation.mutate, view]);

  const checkMutation = useMutation({
    mutationFn: async (questionId: string) => {
      if (!artifactId || !attemptId) throw new Error("quiz_attempt_not_selected");
      await flushPendingSaves();
      return checkQuizAnswer(artifactId, attemptId, questionId, workspaceId);
    },
    onSuccess: (feedback) => {
      setFeedbackByQuestion((current) => new Map(current).set(feedback.questionId, feedback));
      void attemptQuery.refetch();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!artifactId || !attemptId) throw new Error("quiz_attempt_not_selected");
      await flushPendingSaves();
      return submitQuizAttempt(artifactId, attemptId, workspaceId);
    },
    onSuccess: (attempt) => {
      setSubmitDialogOpen(false);
      queryClient.setQueryData(["quiz-attempt", workspaceId, artifactId, attempt.id], attempt);
      void attemptsQuery.refetch();
      navigate("result", attempt.id);
    },
  });

  const attempt = attemptQuery.data;
  const currentQuestion = attempt?.delivery.questions[pageIndex];
  const unansweredQuestions =
    attempt?.delivery.questions.filter((question) =>
      isQuizAnswerEmpty(localAnswers.get(question.questionId)),
    ) ?? [];
  const history = attemptsQuery.data ?? [];
  const activeAttempt = history.find((item) => item.state === "in_progress") ?? null;
  const submittedAttempts = history.filter((item) => item.state === "submitted");

  useEffect(() => {
    if (view !== "attempt" || !attempt) return;
    if (attempt.state === "submitted") navigate("result", attempt.id);
    if (attempt.state === "abandoned") navigate("overview", null);
  }, [attempt, navigate, view]);

  const toggleCurrentFlag = useCallback(() => {
    if (!currentQuestion) return;
    const next = new Set(flagged);
    if (next.has(currentQuestion.questionId)) next.delete(currentQuestion.questionId);
    else next.add(currentQuestion.questionId);
    setFlagged(next);
    queueSave(
      currentQuestion.questionId,
      localAnswers.get(currentQuestion.questionId) ?? emptyQuizAnswerFor(currentQuestion),
      next.has(currentQuestion.questionId),
    );
  }, [currentQuestion, flagged, localAnswers, queueSave]);

  const retryCurrentSave = useCallback(() => {
    if (!currentQuestion || !artifactId || !attemptId) return;
    setSaveState("retrying");
    if (!pendingSaveDrafts.current.has(currentQuestion.questionId)) {
      pendingSaveDrafts.current.set(currentQuestion.questionId, {
        answer: localAnswers.get(currentQuestion.questionId) ?? emptyQuizAnswerFor(currentQuestion),
        artifactId,
        attemptId,
        flagged: flagged.has(currentQuestion.questionId),
        questionId: currentQuestion.questionId,
      });
    }
    void persistPendingSave(currentQuestion.questionId).catch(() => undefined);
  }, [artifactId, attemptId, currentQuestion, flagged, localAnswers, persistPendingSave]);

  const promoteAttempt = useCallback(
    async (nextAttempt: QuizAttemptDetail) => {
      if (!artifactId || !attemptId) return;
      await queryClient.cancelQueries({
        queryKey: ["quiz-attempt", workspaceId, artifactId, attemptId],
      });
      queryClient.setQueryData(["quiz-attempt", workspaceId, artifactId, attemptId], nextAttempt);
      hydratedAttemptId.current = nextAttempt.id;
      setLocalAnswers(
        new Map(nextAttempt.answers.map((answer) => [answer.questionId, answer.answer] as const)),
      );
      setFlagged(
        new Set(
          nextAttempt.answers.filter((answer) => answer.flagged).map((answer) => answer.questionId),
        ),
      );
      setFeedbackByQuestion(new Map());
      setPageIndex((current) =>
        Math.min(current, Math.max(0, nextAttempt.delivery.questions.length - 1)),
      );
      void attemptsQuery.refetch();
    },
    [artifactId, attemptId, attemptsQuery.refetch, queryClient, workspaceId],
  );

  return {
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
  };
}
