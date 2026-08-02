import { describe, expect, it } from "vitest";
import { quizModelOutputSchema } from "./generation";

const base = {
  descriptionMarkdown: "Description",
  settings: { feedbackMode: "after_submission", navigationMode: "free" },
  title: "Quiz",
} as const;

describe("Quiz model output", () => {
  it("fails closed on invalid answer indexes instead of normalizing them", () => {
    for (const question of [
      {
        correctAnswer: null,
        correctOptionIndexes: [2],
        difficulty: "easy",
        explanationMarkdown: "Explanation",
        options: ["A", "B"],
        points: 1,
        promptMarkdown: "Prompt",
        type: "single_choice",
      },
      {
        correctAnswer: null,
        correctOptionIndexes: [0, 0],
        difficulty: "medium",
        explanationMarkdown: "Explanation",
        options: ["A", "B", "C"],
        points: 1,
        promptMarkdown: "Prompt",
        type: "multiple_choice",
      },
      {
        correctAnswer: null,
        correctOptionIndexes: [0, 1],
        difficulty: "medium",
        explanationMarkdown: "Explanation",
        options: ["A", "B"],
        points: 1,
        promptMarkdown: "Prompt",
        type: "multiple_choice",
      },
    ]) {
      expect(quizModelOutputSchema.safeParse({ ...base, questions: [question] }).success).toBe(
        false,
      );
    }
  });

  it("accepts a mixed flat transport and rejects irrelevant answer fields", () => {
    const questions = [
      {
        correctAnswer: null,
        correctOptionIndexes: [1],
        difficulty: "easy",
        explanationMarkdown: "Explanation",
        options: ["A", "B"],
        points: 1,
        promptMarkdown: "Prompt",
        type: "single_choice",
      },
      {
        correctAnswer: null,
        correctOptionIndexes: [0, 2],
        difficulty: "medium",
        explanationMarkdown: "Explanation",
        options: ["A", "B", "C"],
        points: 2,
        promptMarkdown: "Prompt",
        type: "multiple_choice",
      },
      {
        correctAnswer: true,
        correctOptionIndexes: [],
        difficulty: "easy",
        explanationMarkdown: "Explanation",
        options: [],
        points: 1,
        promptMarkdown: "Prompt",
        type: "true_false",
      },
    ];
    expect(quizModelOutputSchema.safeParse({ ...base, questions }).success).toBe(true);
    expect(
      quizModelOutputSchema.safeParse({
        ...base,
        questions: [{ ...questions[2], correctOptionIndexes: [0] }],
      }).success,
    ).toBe(false);
  });

  it("rejects wrapped and duplicate option labels without rewriting them", () => {
    const question = {
      correctAnswer: null,
      correctOptionIndexes: [0],
      difficulty: "easy",
      explanationMarkdown: "Explanation",
      options: ["网络层", "数据链路层"],
      points: 1,
      promptMarkdown: "Prompt",
      type: "single_choice",
    } as const;

    for (const options of [
      ["{text: '网络层'}", "数据链路层"],
      ['{"label":"网络层"}', "数据链路层"],
      ['["网络层"]', "数据链路层"],
      ["网络层", " 网络层 "],
    ]) {
      expect(
        quizModelOutputSchema.safeParse({ ...base, questions: [{ ...question, options }] }).success,
      ).toBe(false);
    }
    expect(
      quizModelOutputSchema.safeParse({
        ...base,
        questions: [{ ...question, options: ["集合 {x: x > 0}", "区间 [0, 1]"] }],
      }).success,
    ).toBe(true);
  });
});
