import { useEffect, useMemo, useState } from "react";
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
  canRefineCurrentQuestion: boolean;
  selectOption: (option: string) => void;
  submitAnswer: () => void;
  goToPreviousQuestion: () => void;
  goToNextQuestion: () => void;
  refineCurrentQuestion: () => Promise<void>;
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
  const currentQuestion = backendQuestions[currentIndex] ?? null;
  const currentArtifactId = flowContext?.resolvedArtifact?.artifactId ?? null;
  const canRefineCurrentQuestion =
    Boolean(currentQuestion && currentArtifactId && flowContext?.onStructuredRefineArtifact);

  useEffect(() => {
    setCurrentIndex(0);
    setAttempts({});
    onIdle?.();
  }, [currentArtifactId, onIdle]);

  useEffect(() => {
    if (backendQuestions.length === 0) {
      setCurrentIndex(0);
      onIdle?.();
      return;
    }
    setCurrentIndex((previous) =>
      Math.min(previous, Math.max(backendQuestions.length - 1, 0))
    );
  }, [backendQuestions.length, onIdle]);

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

  const refineCurrentQuestion = async () => {
    if (!currentQuestion || !currentArtifactId || !flowContext?.onStructuredRefineArtifact) {
      return;
    }
    onRefining?.();
    try {
      await flowContext.onStructuredRefineArtifact({
        artifactId: currentArtifactId,
        message: `请围绕当前题干优化这道题：${currentQuestion.question}`,
        refineMode: "structured_refine",
        selectionAnchor: {
          scope: "question",
          anchor_id: currentQuestion.id,
          artifact_id: currentArtifactId,
          label: `第 ${currentIndex + 1} 题`,
        },
        config: {
          current_question_id: currentQuestion.id,
          selection_anchor: {
            scope: "question",
            anchor_id: currentQuestion.id,
            artifact_id: currentArtifactId,
            label: `第 ${currentIndex + 1} 题`,
          },
        },
      });
    } finally {
      onIdle?.();
    }
  };

  return {
    backendQuestions,
    currentIndex,
    attempts,
    currentQuestion,
    canRefineCurrentQuestion,
    selectOption,
    submitAnswer,
    goToPreviousQuestion: () => {
      setCurrentIndex((previous) => Math.max(previous - 1, 0));
      onIdle?.();
    },
    goToNextQuestion: () => {
      setCurrentIndex((previous) =>
        Math.min(previous + 1, backendQuestions.length - 1)
      );
      onIdle?.();
    },
    refineCurrentQuestion,
  };
}
