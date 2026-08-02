import {
  type QuizAnswer,
  type QuizQuestion,
  type QuizRevisionContent,
  quizAnswerSchema,
} from "./contract";

const QUIZ_GRADER_VERSION = "quiz-grader-v1";

export type QuizQuestionGrade = {
  correct: boolean;
  earnedPoints: number;
  questionId: string;
};

function sameSet(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function isQuizAnswerEmpty(answer: QuizAnswer | null | undefined) {
  if (!answer) return true;
  if (answer.type === "single_choice") return answer.optionId === null;
  if (answer.type === "multiple_choice") return answer.optionIds.length === 0;
  return answer.value === null;
}

export function gradeQuizQuestion(question: QuizQuestion, rawAnswer: unknown): QuizQuestionGrade {
  const parsed = quizAnswerSchema.safeParse(rawAnswer);
  let correct = false;
  if (parsed.success && parsed.data.type === question.type) {
    const answer = parsed.data;
    if (question.type === "single_choice" && answer.type === "single_choice") {
      correct = answer.optionId !== null && answer.optionId === question.correctOptionId;
    } else if (question.type === "multiple_choice" && answer.type === "multiple_choice") {
      correct = sameSet(answer.optionIds, question.correctOptionIds);
    } else if (question.type === "true_false" && answer.type === "true_false") {
      correct = answer.value !== null && answer.value === question.correctAnswer;
    }
  }
  return {
    correct,
    earnedPoints: correct ? question.points : 0,
    questionId: question.questionId,
  };
}

export function gradeQuiz(content: QuizRevisionContent, answers: ReadonlyMap<string, unknown>) {
  const questions = content.questions.map((question) =>
    gradeQuizQuestion(question, answers.get(question.questionId)),
  );
  return {
    graderVersion: QUIZ_GRADER_VERSION,
    questions,
    score: questions.reduce((sum, question) => sum + question.earnedPoints, 0),
    totalPoints: content.questions.reduce((sum, question) => sum + question.points, 0),
  };
}
