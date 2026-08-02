import { randomUUID } from "node:crypto";
import {
  applyQuestionEdits,
  cloneQuestionWithOptions,
  projectQuestionOptions,
  type QuestionDraft,
  type QuestionEdit,
} from "../question-editor";
import type { QuizQuestion, QuizRevisionContent } from "./contract";
import { quizRevisionContentSchema } from "./contract";

export type QuizEdit =
  | QuestionEdit<QuestionDraft>
  | {
      descriptionMarkdown?: string | undefined;
      feedbackMode?: "after_submission" | "immediate" | undefined;
      navigationMode?: "free" | "sequential" | undefined;
      title?: string | undefined;
      type: "update_settings";
    };

function projectQuestion(
  draft: QuestionDraft,
  questionId: string,
  previous: QuizQuestion | undefined,
  idFactory: () => string,
): QuizQuestion {
  const base = {
    difficulty: draft.difficulty,
    explanationMarkdown: draft.explanationMarkdown,
    points: draft.points,
    promptMarkdown: draft.promptMarkdown,
    questionId,
  };
  if (draft.type === "true_false")
    return { ...base, correctAnswer: draft.correctAnswer, type: draft.type };
  const oldOptions = previous?.type === "true_false" ? [] : (previous?.options ?? []);
  const options = projectQuestionOptions(draft.options, oldOptions, idFactory);
  if (draft.type === "single_choice") {
    const correctOptionId = options[draft.correctOptionIndex]?.optionId;
    if (!correctOptionId) throw new Error("quiz_edit_invalid_answer");
    return { ...base, correctOptionId, options, type: draft.type };
  }
  const correctOptionIds: string[] = [];
  for (const index of draft.correctOptionIndexes) {
    const optionId = options[index]?.optionId;
    if (!optionId) throw new Error("quiz_edit_invalid_answer");
    correctOptionIds.push(optionId);
  }
  return { ...base, correctOptionIds, options, type: draft.type };
}

export function applyQuizEdits(
  content: QuizRevisionContent,
  edits: readonly QuizEdit[],
  idFactory: () => string = randomUUID,
) {
  let next = structuredClone(content);
  for (const edit of edits) {
    if (edit.type === "update_settings") {
      next = {
        ...next,
        descriptionMarkdown: edit.descriptionMarkdown ?? next.descriptionMarkdown,
        settings: {
          feedbackMode: edit.feedbackMode ?? next.settings.feedbackMode,
          navigationMode: edit.navigationMode ?? next.settings.navigationMode,
        },
        title: edit.title ?? next.title,
      };
    } else if (edit.type === "add_question") {
      next.questions = applyQuestionEdits(next.questions, [edit], {
        cloneQuestion: cloneQuestionWithOptions,
        idFactory,
        minQuestions: 1,
        minQuestionsError: "quiz_requires_question",
        projectQuestion,
        questionNotFoundError: "quiz_question_not_found",
      });
    } else {
      next.questions = applyQuestionEdits(next.questions, [edit], {
        cloneQuestion: cloneQuestionWithOptions,
        idFactory,
        minQuestions: 1,
        minQuestionsError: "quiz_requires_question",
        projectQuestion,
        questionNotFoundError: "quiz_question_not_found",
      });
    }
  }
  return quizRevisionContentSchema.parse(next);
}
