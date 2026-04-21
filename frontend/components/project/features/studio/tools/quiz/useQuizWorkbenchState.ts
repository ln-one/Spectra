import { useEffect, useMemo, useRef, useState } from "react";
import type { ToolFlowContext } from "../types";
import {
  isOptionCorrect,
  parseBackendQuestions,
} from "./QuizSurfaceAdapter";
import type { QuizAttemptState, QuizQuestionItem } from "./types";

interface UseQuizWorkbenchStateParams {
  flowContext?: ToolFlowContext;
  onAnswering?: () => void;
  onRefining?: () => void;
  onIdle?: () => void;
}

interface UseQuizWorkbenchStateResult {
  backendQuestions: QuizQuestionItem[];
  currentIndex: number;
  attempts: Record<string, QuizAttemptState>;
  currentQuestion: QuizQuestionItem | null;
  selectOption: (option: string) => void;
  submitAnswer: () => void;
  goToPreviousQuestion: () => void;
  goToNextQuestion: () => void;
}

export function useQuizWorkbenchState({
  flowContext,
  onAnswering,
  onRefining,
  onIdle,
}: UseQuizWorkbenchStateParams): UseQuizWorkbenchStateResult {
  const backendQuestions = useMemo(
    () =>
      flowContext?.resolvedArtifact?.contentKind === "json"
        ? parseBackendQuestions(flowContext?.resolvedArtifact?.content)
        : [],
    [flowContext?.resolvedArtifact?.content, flowContext?.resolvedArtifact?.contentKind]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, QuizAttemptState>>({});
  const preferredQuestionIdRef = useRef<string | null>(null);
  const currentQuestion = backendQuestions[currentIndex] ?? null;
  const currentArtifactId = flowContext?.resolvedArtifact?.artifactId ?? null;

  useEffect(() => {
    preferredQuestionIdRef.current = currentQuestion?.id ?? null;
  }, [currentQuestion?.id]);

  useEffect(() => {
    setAttempts({});
    onIdle?.();
  }, [currentArtifactId, onIdle]);

  useEffect(() => {
    if (backendQuestions.length === 0) {
      setCurrentIndex(0);
      preferredQuestionIdRef.current = null;
      onIdle?.();
      return;
    }
    const preferredQuestionId = preferredQuestionIdRef.current;
    const preservedIndex = preferredQuestionId
      ? backendQuestions.findIndex((item) => item.id === preferredQuestionId)
      : -1;
    setCurrentIndex((previous) => {
      if (preservedIndex >= 0) {
        return preservedIndex;
      }
      return Math.min(previous, Math.max(backendQuestions.length - 1, 0));
    });
  }, [backendQuestions, onIdle]);

  const selectOption = (option: string) => {
    if (!currentQuestion) return;
    onAnswering?.();
    setAttempts((previous) => ({
      ...previous,
      [currentQuestion.id]: {
        ...previous[currentQuestion.id],
        selectedOption: option,
        submitted: false,
        isCorrect: null,
      },
    }));
  };

  const submitAnswer = () => {
    if (!currentQuestion) return;
    const currentAttempt = attempts[currentQuestion.id];
    if (!currentAttempt?.selectedOption) return;
    onAnswering?.();
    const selectedOption = currentAttempt.selectedOption;
    setAttempts((previous) => ({
      ...previous,
      [currentQuestion.id]: {
        ...previous[currentQuestion.id],
        submitted: true,
        isCorrect: isOptionCorrect(currentQuestion, selectedOption),
      },
    }));
  };

  return {
    backendQuestions,
    currentIndex,
    attempts,
    currentQuestion,
    selectOption,
    submitAnswer,
    goToPreviousQuestion: () => {
      setCurrentIndex((previous) => {
        const nextIndex = Math.max(previous - 1, 0);
        preferredQuestionIdRef.current = backendQuestions[nextIndex]?.id ?? null;
        return nextIndex;
      });
      onIdle?.();
    },
    goToNextQuestion: () => {
      setCurrentIndex((previous) => {
        const nextIndex = Math.min(previous + 1, backendQuestions.length - 1);
        preferredQuestionIdRef.current = backendQuestions[nextIndex]?.id ?? null;
        return nextIndex;
      });
      onIdle?.();
    },
  };
}
