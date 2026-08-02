import { randomUUID } from "node:crypto";

export type QuestionDraft =
  | {
      correctOptionIndex: number;
      difficulty: "easy" | "medium" | "hard";
      explanationMarkdown: string;
      options: string[];
      points: number;
      promptMarkdown: string;
      type: "single_choice";
    }
  | {
      correctOptionIndexes: number[];
      difficulty: "easy" | "medium" | "hard";
      explanationMarkdown: string;
      options: string[];
      points: number;
      promptMarkdown: string;
      type: "multiple_choice";
    }
  | {
      correctAnswer: boolean;
      difficulty: "easy" | "medium" | "hard";
      explanationMarkdown: string;
      points: number;
      promptMarkdown: string;
      type: "true_false";
    };

export type QuestionEdit<Draft> =
  | { position?: number | undefined; question: Draft; type: "add_question" }
  | { questionId: string; type: "copy_question" }
  | { questionId: string; type: "delete_question" }
  | { direction: "up" | "down"; questionId: string; type: "move_question" }
  | { question: Draft; questionId: string; type: "update_question" };

export type QuestionOption = { optionId: string; text: string };

export function projectQuestionOptions(
  texts: readonly string[],
  previousOptions: readonly QuestionOption[],
  idFactory: () => string,
) {
  const used = new Set<string>();
  const exactMatches = texts.map((text) => {
    const exact = previousOptions.find(
      (option) => !used.has(option.optionId) && option.text === text,
    );
    if (exact) used.add(exact.optionId);
    return exact;
  });
  return texts.map((text, index) => {
    const exact = exactMatches[index];
    const positional = previousOptions[index];
    const remaining = previousOptions.find((option) => !used.has(option.optionId));
    const optionId =
      exact?.optionId ??
      (positional && !used.has(positional.optionId)
        ? positional.optionId
        : (remaining?.optionId ?? idFactory()));
    used.add(optionId);
    return { optionId, text };
  });
}

type CloneableQuestion =
  | { questionId: string; type: "true_false"; correctAnswer: boolean }
  | {
      questionId: string;
      type: "single_choice";
      correctOptionId: string;
      options: QuestionOption[];
    }
  | {
      questionId: string;
      type: "multiple_choice";
      correctOptionIds: string[];
      options: QuestionOption[];
    };

export function cloneQuestionWithOptions<Question extends CloneableQuestion>(
  question: Question,
  idFactory: () => string,
) {
  const copy = structuredClone(question);
  copy.questionId = idFactory();
  if (copy.type === "true_false") return copy;

  const idMap = new Map(copy.options.map((option) => [option.optionId, idFactory()]));
  copy.options = copy.options.map((option) => ({
    ...option,
    optionId: idMap.get(option.optionId) ?? idFactory(),
  }));
  if (copy.type === "single_choice") {
    copy.correctOptionId = idMap.get(copy.correctOptionId) ?? idFactory();
  } else {
    copy.correctOptionIds = copy.correctOptionIds.map((id) => idMap.get(id) ?? idFactory());
  }
  return copy;
}

export function applyQuestionEdits<Question extends { questionId: string }, Draft>(
  questions: readonly Question[],
  edits: readonly QuestionEdit<Draft>[],
  options: {
    cloneQuestion: (question: Question, idFactory: () => string) => Question;
    idFactory?: () => string;
    minQuestions: number;
    minQuestionsError: string;
    projectQuestion: (
      draft: Draft,
      questionId: string,
      previous: Question | undefined,
      idFactory: () => string,
    ) => Question;
    questionNotFoundError: string;
  },
) {
  const idFactory = options.idFactory ?? randomUUID;
  const next: Question[] = structuredClone(Array.from(questions));

  for (const edit of edits) {
    if (edit.type === "add_question") {
      const question = options.projectQuestion(edit.question, idFactory(), undefined, idFactory);
      const position = Math.min(next.length, Math.max(0, edit.position ?? next.length));
      next.splice(position, 0, question);
      continue;
    }

    const index = next.findIndex((question) => question.questionId === edit.questionId);
    if (index < 0) throw new Error(options.questionNotFoundError);
    const current = next[index];
    if (!current) throw new Error(options.questionNotFoundError);

    if (edit.type === "delete_question") {
      if (next.length <= options.minQuestions) throw new Error(options.minQuestionsError);
      next.splice(index, 1);
    } else if (edit.type === "move_question") {
      const target = edit.direction === "up" ? index - 1 : index + 1;
      if (target >= 0 && target < next.length) {
        next.splice(index, 1);
        next.splice(target, 0, current);
      }
    } else if (edit.type === "copy_question") {
      next.splice(index + 1, 0, options.cloneQuestion(current, idFactory));
    } else {
      next[index] = options.projectQuestion(edit.question, current.questionId, current, idFactory);
    }
  }

  return next;
}
