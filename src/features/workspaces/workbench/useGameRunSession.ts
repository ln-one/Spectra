"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuizAnswer, QuizQuestionDelivery } from "@/features/artifacts/quizzes/contract";
import { isQuizAnswerEmpty } from "@/features/artifacts/quizzes/grading";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";
import type { GameCanvasHandle } from "./GameCanvas";
import {
  abandonGameRun,
  fetchGameOverview,
  fetchGameRunResult,
  finishGameRun,
  type GameRevivalDelivery,
  type GameRun,
  type GameRunResultPayload,
  recordGameDeath,
  requestGameRevival,
  startGameRun,
  submitGameRevival,
} from "./game-workspace-client";

export type GameShellState =
  | "overview"
  | "starting"
  | "playing"
  | "paused"
  | "dead"
  | "answering"
  | "countdown"
  | "result"
  | "error";

function emptyGameAnswer(question: GameRevivalDelivery["questions"][number]): QuizAnswer {
  return question.type === "single_choice"
    ? { optionId: null, type: "single_choice" }
    : { type: "true_false", value: null };
}

export function useGameRunSession(input: {
  artifactId: string | null;
  phase: ArtifactWorkspacePhase;
  revisionId: string | null;
  workspaceId: string;
}) {
  const { artifactId, phase, revisionId, workspaceId } = input;
  const queryClient = useQueryClient();
  const [shellState, setShellState] = useState<GameShellState>("overview");
  const [run, setRun] = useState<GameRun | null>(null);
  const [score, setScore] = useState(0);
  const [personalBest, setPersonalBest] = useState(0);
  const [deathId, setDeathId] = useState<string | null>(null);
  const [revivalAvailable, setRevivalAvailable] = useState(false);
  const [delivery, setDelivery] = useState<GameRevivalDelivery | null>(null);
  const [answers, setAnswers] = useState<Map<string, QuizAnswer>>(new Map());
  const [questionIndex, setQuestionIndex] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [reviveCorrectCount, setReviveCorrectCount] = useState<number | null>(null);
  const [revivalSubmitFailed, setRevivalSubmitFailed] = useState(false);
  const [revivalSubmitting, setRevivalSubmitting] = useState(false);
  const [result, setResult] = useState<GameRunResultPayload | null>(null);
  const canvasRef = useRef<GameCanvasHandle>(null);
  const deathBusy = useRef(false);
  const revivalSubmitBusy = useRef(false);
  const revivalSubmitRequestId = useRef<string | null>(null);

  const overview = useQuery({
    enabled: artifactId !== null && phase === "ready",
    queryKey: ["game-overview", artifactId, revisionId, workspaceId],
    queryFn: () => {
      if (!artifactId) throw new Error("game_not_ready");
      return fetchGameOverview(artifactId, workspaceId);
    },
  });

  useEffect(() => {
    if (overview.data) setPersonalBest(overview.data.personalBest);
  }, [overview.data]);

  useEffect(() => {
    if (!artifactId || !run) return;
    const abandonOnPageExit = () => {
      void abandonGameRun(artifactId, run.id, workspaceId);
    };
    window.addEventListener("pagehide", abandonOnPageExit);
    return () => window.removeEventListener("pagehide", abandonOnPageExit);
  }, [artifactId, run, workspaceId]);

  const loadResult = useCallback(
    async (activeRun: GameRun) => {
      if (!artifactId) return;
      setResult(await fetchGameRunResult(artifactId, activeRun.id, workspaceId));
      setShellState("result");
      await queryClient.invalidateQueries({
        queryKey: ["game-overview", artifactId, revisionId, workspaceId],
      });
    },
    [artifactId, queryClient, revisionId, workspaceId],
  );

  const startMutation = useMutation({
    mutationFn: () => {
      if (!artifactId) throw new Error("game_not_ready");
      return startGameRun(artifactId, workspaceId);
    },
    onMutate: () => setShellState("starting"),
    onSuccess: (value) => {
      deathBusy.current = false;
      setRun(value.run);
      setScore(0);
      setPersonalBest(value.personalBest);
      setDeathId(null);
      setRevivalAvailable(false);
      setDelivery(null);
      setAnswers(new Map());
      setRevivalSubmitFailed(false);
      setRevivalSubmitting(false);
      revivalSubmitBusy.current = false;
      revivalSubmitRequestId.current = null;
      setResult(null);
      setShellState("starting");
    },
    onError: () => setShellState("error"),
  });

  const onDeath = useCallback(
    async (summary: { elapsedMs: number; flapCount: number; score: number }) => {
      if (!artifactId || !run || deathBusy.current) return;
      deathBusy.current = true;
      try {
        const death = await recordGameDeath({
          artifactId,
          runId: run.id,
          summary,
          workspaceId,
        });
        setScore(summary.score);
        setDeathId(death.death.id);
        setRevivalAvailable(death.revivalAvailable);
        if (!death.revivalAvailable) {
          await loadResult(run);
          return;
        }
        setShellState("dead");
      } catch {
        setShellState("error");
      }
    },
    [artifactId, loadResult, run, workspaceId],
  );

  const requestRevival = useCallback(async () => {
    if (!artifactId || !run || !deathId) return;
    try {
      const revival = await requestGameRevival({
        artifactId,
        deathId,
        runId: run.id,
        workspaceId,
      });
      if (!revival.available) {
        setPersonalBest(revival.personalBest);
        await loadResult(run);
        return;
      }
      setDelivery(revival.delivery);
      setAnswers(
        new Map(
          revival.delivery.questions.map((question) => [
            question.questionId,
            emptyGameAnswer(question),
          ]),
        ),
      );
      setRevivalSubmitFailed(false);
      setRevivalSubmitting(false);
      revivalSubmitBusy.current = false;
      revivalSubmitRequestId.current = crypto.randomUUID();
      setQuestionIndex(0);
      setShellState("answering");
    } catch {
      setShellState("error");
    }
  }, [artifactId, deathId, loadResult, run, workspaceId]);

  const revivalComplete = Boolean(
    delivery?.questions.every((question) => !isQuizAnswerEmpty(answers.get(question.questionId))),
  );

  const submitRevival = useCallback(async () => {
    if (!artifactId || !run || !delivery || revivalSubmitBusy.current || !revivalComplete) return;
    revivalSubmitBusy.current = true;
    setRevivalSubmitting(true);
    setRevivalSubmitFailed(false);
    const idempotencyKey = revivalSubmitRequestId.current ?? crypto.randomUUID();
    revivalSubmitRequestId.current = idempotencyKey;
    try {
      const submission = await submitGameRevival({
        answers: delivery.questions.map((question) => ({
          answer: answers.get(question.questionId),
          questionId: question.questionId,
        })),
        artifactId,
        idempotencyKey,
        roundId: delivery.roundId,
        runId: run.id,
        workspaceId,
      });
      setPersonalBest(submission.personalBest);
      if (!submission.revived) {
        await loadResult(run);
        return;
      }
      setCountdown(3);
      setReviveCorrectCount(submission.correctCount);
      setShellState("countdown");
    } catch {
      revivalSubmitBusy.current = false;
      setRevivalSubmitting(false);
      setRevivalSubmitFailed(true);
    }
  }, [answers, artifactId, delivery, loadResult, revivalComplete, run, workspaceId]);

  useEffect(() => {
    if (shellState !== "countdown") return;
    if (countdown === 0) {
      deathBusy.current = false;
      setDelivery(null);
      setDeathId(null);
      setRevivalSubmitFailed(false);
      setRevivalSubmitting(false);
      revivalSubmitBusy.current = false;
      revivalSubmitRequestId.current = null;
      setShellState("playing");
      canvasRef.current?.resumeAfterRevival();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 700);
    return () => window.clearTimeout(timer);
  }, [countdown, shellState]);

  const finish = useCallback(async () => {
    if (!artifactId || !run) return;
    try {
      setResult(
        await finishGameRun({
          artifactId,
          runId: run.id,
          score,
          workspaceId,
        }),
      );
      setShellState("result");
      await queryClient.invalidateQueries({
        queryKey: ["game-overview", artifactId, revisionId, workspaceId],
      });
    } catch {
      setShellState("error");
    }
  }, [artifactId, queryClient, revisionId, run, score, workspaceId]);

  const deliverySnapshot = useMemo<QuizQuestionDelivery | null>(
    () => (delivery ? { navigationMode: "sequential", questions: delivery.questions } : null),
    [delivery],
  );

  const answerRevivalQuestion = useCallback((questionId: string, answer: QuizAnswer) => {
    setAnswers((current) => new Map(current).set(questionId, answer));
  }, []);

  const pauseGame = useCallback(() => {
    canvasRef.current?.pause();
    setShellState("paused");
  }, []);

  const resumeGame = useCallback(() => {
    canvasRef.current?.start();
    setShellState("playing");
  }, []);

  const onCanvasPause = useCallback(() => {
    setShellState((current) => (current === "playing" ? "paused" : current));
  }, []);

  return {
    answers,
    answerRevivalQuestion,
    canvasRef,
    countdown,
    deliverySnapshot,
    finish,
    onCanvasError: () => setShellState("error"),
    onCanvasPause,
    onCanvasReady: () => setShellState("playing"),
    onDeath,
    overview,
    pauseGame,
    personalBest,
    questionIndex,
    requestRevival,
    result,
    revivalAvailable,
    revivalComplete,
    revivalSubmitFailed,
    revivalSubmitting,
    reviveCorrectCount,
    resumeGame,
    run,
    score,
    setQuestionIndex,
    setScore,
    shellState,
    startMutation,
    submitRevival,
  };
}
