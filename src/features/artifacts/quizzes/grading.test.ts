import { describe, expect, it } from "vitest";
import type { QuizRevisionContent } from "./contract";
import { gradeQuiz, gradeQuizQuestion, isQuizAnswerEmpty } from "./grading";

const q1 = "00000000-0000-4000-8000-000000000001";
const q2 = "00000000-0000-4000-8000-000000000002";
const a = "00000000-0000-4000-8000-000000000003";
const b = "00000000-0000-4000-8000-000000000004";
const c = "00000000-0000-4000-8000-000000000005";

const content: QuizRevisionContent = {
  descriptionMarkdown: "Description",
  questions: [
    {
      correctOptionIds: [a, c],
      difficulty: "medium",
      explanationMarkdown: "Explanation",
      options: [
        { optionId: a, text: "A" },
        { optionId: b, text: "B" },
        { optionId: c, text: "C" },
      ],
      points: 3,
      promptMarkdown: "Select two",
      questionId: q1,
      type: "multiple_choice",
    },
    {
      correctAnswer: true,
      difficulty: "easy",
      explanationMarkdown: "Explanation",
      points: 2,
      promptMarkdown: "True?",
      questionId: q2,
      type: "true_false",
    },
  ],
  schemaVersion: 1,
  settings: { feedbackMode: "after_submission", navigationMode: "free" },
  title: "Quiz",
};

describe("Quiz grading", () => {
  it("grades multiple choice independent of answer order", () => {
    const question = content.questions[0];
    if (!question) throw new Error("Invalid fixture");
    expect(
      gradeQuizQuestion(question, {
        optionIds: [c, a],
        type: "multiple_choice",
      }),
    ).toMatchObject({ correct: true, earnedPoints: 3 });
  });

  it("gives unanswered questions zero points", () => {
    const grade = gradeQuiz(content, new Map());
    expect(grade).toMatchObject({ score: 0, totalPoints: 5 });
    expect(grade.questions.every((question) => !question.correct)).toBe(true);
    expect(isQuizAnswerEmpty({ type: "true_false", value: null })).toBe(true);
  });
});
