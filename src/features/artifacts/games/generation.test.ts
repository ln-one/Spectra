import { describe, expect, it } from "vitest";
import { buildGameGenerationPrompt, gameModelOutputSchema } from "./generation";

const base = {
  descriptionMarkdown: "Description",
  skin: "city_sunset",
  title: "Game",
} as const;

describe("Game model output", () => {
  it("makes each question type's answer and null contract explicit in the model prompt", () => {
    const prompt = buildGameGenerationPrompt({
      locale: "zh-CN",
      prompt: "创建 12 道以太坊题目",
    });

    expect(prompt).toContain(
      "For single_choice, set type=single_choice, provide 2-6 unique plain-string options",
    );
    expect(prompt).toContain("correctOptionIndex to the zero-based index");
    expect(prompt).toContain("correctAnswer=null");
    expect(prompt).toContain(
      "For true_false, set type=true_false, set options=[], set correctOptionIndex=null",
    );
    expect(prompt).toContain("Always include correctOptionIndex and correctAnswer explicitly");
    expect(prompt).toContain("Reusing a meaningful option set across questions is allowed");
  });

  it("adds a complete-regeneration instruction after invalid structured output", () => {
    expect(
      buildGameGenerationPrompt({
        correctionAttempt: 1,
        locale: "zh-CN",
        prompt: "创建 12 道以太坊题目",
      }),
    ).toContain("Regenerate the complete game question bank");
  });

  it("keeps all answer fields required in the provider-facing schema", () => {
    const questions = Array.from({ length: 6 }, (_, index) =>
      index % 3 === 2
        ? {
            correctAnswer: true,
            difficulty: "easy",
            explanationMarkdown: "True/false explanation",
            promptMarkdown: `Statement ${index + 1}`,
            type: "true_false",
          }
        : {
            correctOptionIndex: 0,
            difficulty: "medium",
            explanationMarkdown: "Choice explanation",
            options: [`Correct ${index + 1}`, `Distractor ${index + 1}`],
            promptMarkdown: `Question ${index + 1}`,
            type: "single_choice",
          },
    );

    expect(gameModelOutputSchema.safeParse({ ...base, questions }).success).toBe(false);
  });

  it("ignores irrelevant answer fields once the selected question type has a valid answer", () => {
    const questions = Array.from({ length: 6 }, (_, index) =>
      index % 3 === 2
        ? {
            correctAnswer: true,
            correctOptionIndex: 0,
            difficulty: "easy",
            explanationMarkdown: "True/false explanation",
            options: ["True", "False"],
            promptMarkdown: `Statement ${index + 1}`,
            type: "true_false",
          }
        : {
            correctAnswer: false,
            correctOptionIndex: 0,
            difficulty: "medium",
            explanationMarkdown: "Choice explanation",
            options: [`Correct ${index + 1}`, `Distractor ${index + 1}`],
            promptMarkdown: `Question ${index + 1}`,
            type: "single_choice",
          },
    );

    expect(gameModelOutputSchema.safeParse({ ...base, questions }).success).toBe(true);
  });

  it("still rejects questions without the answer required by their selected type", () => {
    const invalidQuestions = Array.from({ length: 6 }, (_, index) =>
      index < 2
        ? {
            correctAnswer: null,
            correctOptionIndex: 0,
            difficulty: "easy",
            explanationMarkdown: "Explanation",
            options: ["正确", "错误"],
            promptMarkdown: "Prompt",
            type: "true_false",
          }
        : {
            correctAnswer: true,
            correctOptionIndex: null,
            difficulty: "easy",
            explanationMarkdown: "Explanation",
            options: [],
            promptMarkdown: "Prompt",
            type: "single_choice",
          },
    );

    expect(gameModelOutputSchema.safeParse({ ...base, questions: invalidQuestions }).success).toBe(
      false,
    );
  });

  it("allows a meaningful option set to be reused across different questions", () => {
    const repeatedOptions = ["垃圾邮件", "正常邮件"];
    const questions = Array.from({ length: 6 }, (_, index) => ({
      correctAnswer: null,
      correctOptionIndex: index % repeatedOptions.length,
      difficulty: "easy",
      explanationMarkdown: "Subject-specific explanation",
      options: repeatedOptions,
      promptMarkdown: `Subject question ${index + 1}`,
      type: "single_choice",
    }));

    expect(gameModelOutputSchema.safeParse({ ...base, questions }).success).toBe(true);
  });
});
