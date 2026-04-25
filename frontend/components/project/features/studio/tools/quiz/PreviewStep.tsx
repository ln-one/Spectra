import { useCallback, useEffect, useMemo, useState } from "react";
import { useMachine } from "@xstate/react";
import { assign, createMachine } from "xstate";
import { ClipboardList } from "lucide-react";
import type { ToolFlowContext } from "../types";
import { WorkbenchCenteredState } from "../WorkbenchCenteredState";
import { EditQuestionSurface, type EditQuestionFormValues } from "./EditQuestionSurface";
import {
  QuizSurfaceAdapter,
  isOptionCorrect,
  parseBackendQuestions,
} from "./QuizSurfaceAdapter";
import type {
  QuizAttemptState,
  QuizQuestionItem,
  QuizSurfaceMode,
} from "./types";

type NavigationDirection = "previous" | "next";

interface QuizMachineContext {
  currentIndex: number;
  focusedQuestionId: string | null;
  questionIds: string[];
  attempts: Record<string, QuizAttemptState>;
  isEditDirty: boolean;
  pendingNavigation: NavigationDirection | null;
  saveError: string | null;
  questionCount: number;
}

type QuizMachineEvent =
  | { type: "SYNC_QUESTIONS"; questions: QuizQuestionItem[]; resetAttempts?: boolean }
  | { type: "SWITCH_TO_BROWSE" }
  | { type: "SWITCH_TO_EDIT" }
  | { type: "ANSWER_SELECT"; questionId: string; option: string }
  | { type: "ANSWER_SUBMIT"; question: QuizQuestionItem; selectedOption: string }
  | { type: "QUESTION_PREV" }
  | { type: "QUESTION_NEXT" }
  | { type: "EDIT_CHANGE"; isDirty: boolean }
  | { type: "SAVE_REQUEST"; pendingNavigation?: NavigationDirection | null }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_FAILURE"; message: string };

function moveIndex(
  currentIndex: number,
  questionCount: number,
  direction: NavigationDirection
): number {
  if (questionCount <= 0) return 0;
  if (direction === "previous") return Math.max(currentIndex - 1, 0);
  return Math.min(currentIndex + 1, questionCount - 1);
}

const quizWorkbenchMachine = createMachine({
  id: "quizWorkbench",
  initial: "browse",
  context: {
    currentIndex: 0,
    focusedQuestionId: null,
    questionIds: [],
    attempts: {},
    isEditDirty: false,
    pendingNavigation: null,
    saveError: null,
    questionCount: 0,
  } as QuizMachineContext,
  on: {
    SYNC_QUESTIONS: {
      actions: assign(({ context, event }) => {
        const questions = event.type === "SYNC_QUESTIONS" ? event.questions : [];
        if (questions.length === 0) {
          return {
            currentIndex: 0,
            focusedQuestionId: null,
            questionIds: [],
            questionCount: 0,
            attempts: event.type === "SYNC_QUESTIONS" && event.resetAttempts
              ? {}
              : context.attempts,
          };
        }
        const preservedIndex = context.focusedQuestionId
          ? questions.findIndex(
              (item: QuizQuestionItem) => item.id === context.focusedQuestionId
            )
          : -1;
        const nextIndex =
          preservedIndex >= 0
            ? preservedIndex
            : Math.min(context.currentIndex, questions.length - 1);
        return {
          currentIndex: nextIndex,
          focusedQuestionId: questions[nextIndex]?.id ?? questions[0]?.id ?? null,
          questionIds: questions.map((item: QuizQuestionItem) => item.id),
          questionCount: questions.length,
          attempts:
            event.type === "SYNC_QUESTIONS" && event.resetAttempts
              ? {}
              : context.attempts,
        };
      }),
    },
  },
  states: {
    browse: {
      on: {
        SWITCH_TO_EDIT: {
          target: "edit",
          actions: assign(() => ({
            saveError: null,
            pendingNavigation: null,
          })),
        },
        ANSWER_SELECT: {
          actions: assign(({ context, event }) => {
            if (event.type !== "ANSWER_SELECT") return {};
            return {
              attempts: {
                ...context.attempts,
                [event.questionId]: {
                  ...context.attempts[event.questionId],
                  selectedOption: event.option,
                  submitted: false,
                  isCorrect: null,
                },
              },
            };
          }),
        },
        ANSWER_SUBMIT: {
          actions: assign(({ context, event }) => {
            if (event.type !== "ANSWER_SUBMIT") return {};
            const questionId = event.question.id;
            return {
              attempts: {
                ...context.attempts,
                [questionId]: {
                  ...context.attempts[questionId],
                  submitted: true,
                  isCorrect: isOptionCorrect(event.question, event.selectedOption),
                },
              },
            };
          }),
        },
        QUESTION_PREV: {
          actions: assign(({ context }) => {
            const nextIndex = moveIndex(
              context.currentIndex,
              context.questionCount,
              "previous"
            );
            return {
              currentIndex: nextIndex,
              focusedQuestionId: context.questionIds[nextIndex] ?? context.focusedQuestionId,
            };
          }),
        },
        QUESTION_NEXT: {
          actions: assign(({ context }) => {
            const nextIndex = moveIndex(
              context.currentIndex,
              context.questionCount,
              "next"
            );
            return {
              currentIndex: nextIndex,
              focusedQuestionId: context.questionIds[nextIndex] ?? context.focusedQuestionId,
            };
          }),
        },
      },
    },
    edit: {
      on: {
        SWITCH_TO_BROWSE: {
          target: "browse",
          actions: assign(() => ({
            isEditDirty: false,
            saveError: null,
            pendingNavigation: null,
          })),
        },
        EDIT_CHANGE: {
          actions: assign(({ event }) =>
            event.type === "EDIT_CHANGE"
              ? { isEditDirty: event.isDirty, saveError: null }
              : {}
          ),
        },
        QUESTION_PREV: {
          actions: assign(({ context }) => {
            const nextIndex = moveIndex(
              context.currentIndex,
              context.questionCount,
              "previous"
            );
            return {
              currentIndex: nextIndex,
              focusedQuestionId: context.questionIds[nextIndex] ?? context.focusedQuestionId,
            };
          }),
        },
        QUESTION_NEXT: {
          actions: assign(({ context }) => {
            const nextIndex = moveIndex(
              context.currentIndex,
              context.questionCount,
              "next"
            );
            return {
              currentIndex: nextIndex,
              focusedQuestionId: context.questionIds[nextIndex] ?? context.focusedQuestionId,
            };
          }),
        },
        SAVE_REQUEST: {
          target: "saving",
          actions: assign(({ event }) =>
            event.type === "SAVE_REQUEST"
              ? {
                  pendingNavigation: event.pendingNavigation ?? null,
                  saveError: null,
                }
              : {}
          ),
        },
      },
    },
    saving: {
      on: {
        SAVE_SUCCESS: {
          target: "edit",
          actions: assign(({ context }) => {
            const nextIndex = context.pendingNavigation
              ? moveIndex(
                  context.currentIndex,
                  context.questionCount,
                  context.pendingNavigation
                )
              : context.currentIndex;
            return {
              currentIndex: nextIndex,
              focusedQuestionId:
                context.questionIds[nextIndex] ?? context.focusedQuestionId,
              pendingNavigation: null,
              isEditDirty: false,
              saveError: null,
            };
          }),
        },
        SAVE_FAILURE: {
          target: "edit",
          actions: assign(({ event }) =>
            event.type === "SAVE_FAILURE"
              ? {
                  pendingNavigation: null,
                  saveError: event.message,
                }
              : {}
          ),
        },
      },
    },
  },
});

interface PreviewStepProps {
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  surfaceMode?: QuizSurfaceMode;
  onAnswering?: () => void;
  onRefining?: () => void;
  onIdle?: () => void;
}

function toEditFormValues(question: QuizQuestionItem): EditQuestionFormValues {
  const answerValue =
    typeof question.answer === "string"
      ? question.answer
      : typeof question.answer === "number"
        ? question.options[question.answer] ?? ""
        : Array.isArray(question.answer)
          ? question.answer
              .map((item) =>
                typeof item === "number"
                  ? question.options[item] ?? ""
                  : String(item ?? "")
              )
              .filter(Boolean)
              .join(" / ")
          : "";

  return {
    id: question.id,
    question: question.question,
    options: question.options.length > 0 ? question.options : ["", ""],
    answer: answerValue,
    explanation: question.explanation ?? "",
  };
}

export function PreviewStep({
  lastGeneratedAt,
  flowContext,
  surfaceMode = "browse",
  onAnswering,
  onRefining,
  onIdle,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实题目内容。";
  const backendQuestions = useMemo(
    () =>
      flowContext?.resolvedArtifact?.contentKind === "json"
        ? parseBackendQuestions(flowContext?.resolvedArtifact?.content)
        : [],
    [flowContext?.resolvedArtifact?.content, flowContext?.resolvedArtifact?.contentKind]
  );
  const artifactId = flowContext?.resolvedArtifact?.artifactId ?? null;
  const [state, send] = useMachine(quizWorkbenchMachine);
  const [lastArtifactId, setLastArtifactId] = useState<string | null>(artifactId);

  useEffect(() => {
    const resetAttempts = Boolean(artifactId && artifactId !== lastArtifactId);
    send({ type: "SYNC_QUESTIONS", questions: backendQuestions, resetAttempts });
    if (artifactId !== lastArtifactId) {
      setLastArtifactId(artifactId);
    }
  }, [artifactId, backendQuestions, lastArtifactId, send]);

  useEffect(() => {
    if (surfaceMode === "edit") {
      send({ type: "SWITCH_TO_EDIT" });
      return;
    }
    send({ type: "SWITCH_TO_BROWSE" });
  }, [send, surfaceMode]);

  const currentIndex = state.context.currentIndex;
  const currentQuestion = backendQuestions[currentIndex] ?? null;
  const attempts = state.context.attempts;
  const currentAttempt = currentQuestion ? attempts[currentQuestion.id] : undefined;
  const editQuestion = useMemo(
    () => (currentQuestion ? toEditFormValues(currentQuestion) : null),
    [currentQuestion]
  );
  const isSaving = state.matches("saving");
  const handleDirtyChange = useCallback(
    (isDirty: boolean) => {
      send({ type: "EDIT_CHANGE", isDirty });
    },
    [send]
  );

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("spectra:quiz:question-focus", {
        detail: {
          index: currentQuestion ? currentIndex + 1 : 0,
          total: backendQuestions.length,
          questionId: currentQuestion?.id ?? null,
        },
      })
    );
  }, [backendQuestions.length, currentIndex, currentQuestion]);

  const lastGeneratedLabel = lastGeneratedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(lastGeneratedAt))
    : null;

  const handleBrowseNavigation = useCallback(
    (direction: NavigationDirection) => {
      if (direction === "previous") {
        send({ type: "QUESTION_PREV" });
        onIdle?.();
        return;
      }
      send({ type: "QUESTION_NEXT" });
      onIdle?.();
    },
    [onIdle, send]
  );

  const saveEditedQuestion = useCallback(
    async (
      values: EditQuestionFormValues,
      pendingNavigation: NavigationDirection | null = null
    ) => {
      if (!artifactId || !currentQuestion || !flowContext?.onStructuredRefineArtifact) {
        send({
          type: "SAVE_FAILURE",
          message: "当前题不可编辑，请刷新后重试。",
        });
        return false;
      }

      send({ type: "SAVE_REQUEST", pendingNavigation });
      onRefining?.();
      try {
        const normalizedOptions = values.options
          .map((item) => item.trim())
          .filter(Boolean);
        const result = await flowContext.onStructuredRefineArtifact({
          artifactId,
          message: "直接编辑当前题",
          refineMode: "structured_refine",
          selectionAnchor: {
            scope: "question",
            anchor_id: currentQuestion.id,
            artifact_id: artifactId,
            label: `第 ${currentIndex + 1} 题`,
          },
          config: {
            operation: "direct_edit_question",
            current_question_id: currentQuestion.id,
            edited_question: {
              id: values.id,
              question: values.question.trim(),
              options: normalizedOptions,
              answer: values.answer.trim(),
              explanation: values.explanation.trim(),
            },
          },
        });
        if (!result?.ok) {
          send({
            type: "SAVE_FAILURE",
            message: "当前题保存失败，请稍后重试。",
          });
          return false;
        }
        send({ type: "SAVE_SUCCESS" });
        return true;
      } catch {
        send({
          type: "SAVE_FAILURE",
          message: "当前题保存失败，请稍后重试。",
        });
        return false;
      } finally {
        onIdle?.();
      }
    },
    [artifactId, currentIndex, currentQuestion, flowContext, onIdle, onRefining, send]
  );

  const handleEditPrevious = useCallback(
    async (values: EditQuestionFormValues) => {
      if (state.context.isEditDirty) {
        await saveEditedQuestion(values, "previous");
        return;
      }
      send({ type: "QUESTION_PREV" });
    },
    [saveEditedQuestion, send, state.context.isEditDirty]
  );

  const handleEditNext = useCallback(
    async (values: EditQuestionFormValues) => {
      if (state.context.isEditDirty) {
        await saveEditedQuestion(values, "next");
        return;
      }
      send({ type: "QUESTION_NEXT" });
    },
    [saveEditedQuestion, send, state.context.isEditDirty]
  );

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      {!currentQuestion ? (
        <div className="flex h-full min-h-0 items-center justify-center px-4 py-10">
          <div className="w-full max-w-xl">
            <WorkbenchCenteredState
              tone="violet"
              icon={ClipboardList}
              title="暂未收到后端真实题目"
              description={
                capabilityStatus !== "backend_ready"
                  ? capabilityReason
                  : "等待后端返回题目后，这里会直接进入答题工作面。"
              }
              pill={lastGeneratedLabel ? `最近生成：${lastGeneratedLabel}` : null}
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto flex h-full max-w-5xl min-h-0 flex-col">
              {state.matches("edit") || state.matches("saving") ? (
                editQuestion ? (
                <EditQuestionSurface
                  question={editQuestion}
                  currentIndex={currentIndex}
                  totalQuestions={backendQuestions.length}
                  isSaving={isSaving}
                  saveError={state.context.saveError}
                  onDirtyChange={handleDirtyChange}
                  onSave={async (values) => {
                    await saveEditedQuestion(values);
                  }}
                  onSaveAndPreview={async (values) => {
                    const saved = await saveEditedQuestion(values);
                    if (!saved) return;
                    window.dispatchEvent(
                      new CustomEvent("spectra:quiz:set-mode", {
                        detail: { mode: "browse" },
                      })
                    );
                  }}
                  onPreviousQuestion={handleEditPrevious}
                  onNextQuestion={handleEditNext}
                />
                ) : null
              ) : (
                <QuizSurfaceAdapter
                  questions={backendQuestions}
                  currentIndex={currentIndex}
                  attempts={attempts}
                  surfaceMode="browse"
                  onSelectOption={(option) => {
                    if (!currentQuestion) return;
                    onAnswering?.();
                    send({
                      type: "ANSWER_SELECT",
                      questionId: currentQuestion.id,
                      option,
                    });
                  }}
                  onSubmitAnswer={() => {
                    if (!currentQuestion || !currentAttempt?.selectedOption) return;
                    onAnswering?.();
                    send({
                      type: "ANSWER_SUBMIT",
                      question: currentQuestion,
                      selectedOption: currentAttempt.selectedOption,
                    });
                  }}
                  onPreviousQuestion={() => handleBrowseNavigation("previous")}
                  onNextQuestion={() => handleBrowseNavigation("next")}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
