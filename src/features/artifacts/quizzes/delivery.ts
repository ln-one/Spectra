import type {
  QuizDeliveryQuestion,
  QuizDeliverySnapshot,
  QuizQuestion,
  QuizRevisionContent,
} from "./contract";

export function createQuizDeliveryQuestions(
  questions: readonly QuizQuestion[],
): QuizDeliveryQuestion[] {
  return questions.map((question) => {
    const base = {
      difficulty: question.difficulty,
      points: question.points,
      promptMarkdown: question.promptMarkdown,
      questionId: question.questionId,
    };
    return question.type === "true_false"
      ? { ...base, type: question.type }
      : { ...base, options: question.options, type: question.type };
  });
}

export function createQuizDeliverySnapshot(input: {
  artifactId: string;
  content: QuizRevisionContent;
  revisionId: string;
}): QuizDeliverySnapshot {
  const { content } = input;
  return {
    artifactId: input.artifactId,
    descriptionMarkdown: content.descriptionMarkdown,
    feedbackMode: content.settings.feedbackMode,
    navigationMode: content.settings.navigationMode,
    questions: createQuizDeliveryQuestions(content.questions),
    revisionId: input.revisionId,
    title: content.title,
    totalPoints: content.questions.reduce((sum, question) => sum + question.points, 0),
  };
}
