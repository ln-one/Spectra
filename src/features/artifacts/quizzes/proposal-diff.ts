import type { QuizQuestion, QuizRevisionContent } from "./contract";

type QuizProposalField =
  | "answer"
  | "difficulty"
  | "explanation"
  | "options"
  | "points"
  | "prompt"
  | "type";

type QuizProposalOptionDiff = {
  after: { optionId: string; text: string } | null;
  before: { optionId: string; text: string } | null;
  moved: boolean;
  status: "added" | "deleted" | "unchanged" | "updated";
};

export type QuizProposalQuestionDiff = {
  after: QuizQuestion | null;
  before: QuizQuestion | null;
  fields: QuizProposalField[];
  moved: boolean;
  nextIndex: number | null;
  options: QuizProposalOptionDiff[];
  previousIndex: number | null;
  questionId: string;
  status: "added" | "deleted" | "unchanged" | "updated";
};

export type QuizProposalDiff = {
  changeCount: number;
  questions: QuizProposalQuestionDiff[];
  settings: {
    description: boolean;
    feedbackMode: boolean;
    navigationMode: boolean;
    title: boolean;
  };
};

function choiceOptions(question: QuizQuestion | null) {
  return question && question.type !== "true_false" ? question.options : [];
}

function correctAnswerKey(question: QuizQuestion) {
  if (question.type === "true_false") return `${question.type}:${question.correctAnswer}`;
  if (question.type === "single_choice") return `${question.type}:${question.correctOptionId}`;
  return `${question.type}:${[...question.correctOptionIds].sort().join(",")}`;
}

function buildOptionDiff(before: QuizQuestion | null, after: QuizQuestion | null) {
  const beforeOptions = choiceOptions(before);
  const afterOptions = choiceOptions(after);
  const beforeById = new Map(beforeOptions.map((option) => [option.optionId, option]));
  const afterById = new Map(afterOptions.map((option) => [option.optionId, option]));
  const beforeCommonOrder = new Map(
    beforeOptions
      .filter((option) => afterById.has(option.optionId))
      .map((option, index) => [option.optionId, index]),
  );
  const afterCommonOrder = new Map(
    afterOptions
      .filter((option) => beforeById.has(option.optionId))
      .map((option, index) => [option.optionId, index]),
  );
  const result: QuizProposalOptionDiff[] = afterOptions.map((option) => {
    const previous = beforeById.get(option.optionId) ?? null;
    return {
      after: option,
      before: previous,
      moved:
        previous !== null &&
        beforeCommonOrder.get(option.optionId) !== afterCommonOrder.get(option.optionId),
      status: previous === null ? "added" : previous.text === option.text ? "unchanged" : "updated",
    };
  });

  for (const [index, option] of beforeOptions.entries()) {
    if (afterById.has(option.optionId)) continue;
    result.splice(Math.min(index, result.length), 0, {
      after: null,
      before: option,
      moved: false,
      status: "deleted",
    });
  }
  return result;
}

function changedFields(before: QuizQuestion, after: QuizQuestion) {
  const fields: QuizProposalField[] = [];
  if (before.type !== after.type) fields.push("type");
  if (before.promptMarkdown !== after.promptMarkdown) fields.push("prompt");
  if (before.difficulty !== after.difficulty) fields.push("difficulty");
  if (before.points !== after.points) fields.push("points");
  if (before.explanationMarkdown !== after.explanationMarkdown) fields.push("explanation");
  const options = buildOptionDiff(before, after);
  if (options.some((option) => option.status !== "unchanged" || option.moved))
    fields.push("options");
  if (correctAnswerKey(before) !== correctAnswerKey(after)) fields.push("answer");
  return fields;
}

export function buildQuizProposalDiff(
  before: QuizRevisionContent,
  after: QuizRevisionContent,
): QuizProposalDiff {
  const beforeById = new Map(
    before.questions.map((question, index) => [question.questionId, { index, question }]),
  );
  const afterById = new Map(
    after.questions.map((question, index) => [question.questionId, { index, question }]),
  );
  const beforeCommonOrder = new Map(
    before.questions
      .filter((question) => afterById.has(question.questionId))
      .map((question, index) => [question.questionId, index]),
  );
  const afterCommonOrder = new Map(
    after.questions
      .filter((question) => beforeById.has(question.questionId))
      .map((question, index) => [question.questionId, index]),
  );

  const questions: QuizProposalQuestionDiff[] = after.questions.map((question, nextIndex) => {
    const previous = beforeById.get(question.questionId) ?? null;
    const fields = previous ? changedFields(previous.question, question) : [];
    return {
      after: question,
      before: previous?.question ?? null,
      fields,
      moved:
        previous !== null &&
        beforeCommonOrder.get(question.questionId) !== afterCommonOrder.get(question.questionId),
      nextIndex,
      options: buildOptionDiff(previous?.question ?? null, question),
      previousIndex: previous?.index ?? null,
      questionId: question.questionId,
      status: previous === null ? "added" : fields.length > 0 ? "updated" : "unchanged",
    };
  });

  for (const [previousIndex, question] of before.questions.entries()) {
    if (afterById.has(question.questionId)) continue;
    questions.splice(Math.min(previousIndex, questions.length), 0, {
      after: null,
      before: question,
      fields: [],
      moved: false,
      nextIndex: null,
      options: buildOptionDiff(question, null),
      previousIndex,
      questionId: question.questionId,
      status: "deleted",
    });
  }

  const settings = {
    description: before.descriptionMarkdown !== after.descriptionMarkdown,
    feedbackMode: before.settings.feedbackMode !== after.settings.feedbackMode,
    navigationMode: before.settings.navigationMode !== after.settings.navigationMode,
    title: before.title !== after.title,
  };
  const settingChangeCount = Object.values(settings).filter(Boolean).length;
  const questionChangeCount = questions.filter(
    (question) => question.status !== "unchanged" || question.moved,
  ).length;

  return { changeCount: settingChangeCount + questionChangeCount, questions, settings };
}
