import { describe, expect, it } from "vitest";
import { createQuizDeliveryQuestions } from "../quizzes/delivery";
import { flapRevivalGameRevisionContentSchema } from "./contract";

const questionId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const optionId = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function content() {
  return {
    descriptionMarkdown: "A deterministic test game.",
    questions: Array.from({ length: 6 }, (_, index) =>
      index % 3 === 2
        ? {
            correctAnswer: true,
            difficulty: "easy" as const,
            explanationMarkdown: "Because it is true.",
            points: 1,
            promptMarkdown: `Statement ${index}`,
            questionId: questionId(index),
            type: "true_false" as const,
          }
        : {
            correctOptionId: optionId(index * 2),
            difficulty: "medium" as const,
            explanationMarkdown: "The first option is correct.",
            options: [
              { optionId: optionId(index * 2), text: "Correct" },
              { optionId: optionId(index * 2 + 1), text: "Distractor" },
            ],
            points: 1,
            promptMarkdown: `Question ${index}`,
            questionId: questionId(index),
            type: "single_choice" as const,
          },
    ),
    revival: { questionCount: 3 as const, requiredCorrect: 2 as const },
    schemaVersion: 1 as const,
    skin: "skyline_day" as const,
    template: "flap_revival" as const,
    title: "Fixture",
  };
}

describe("flap revival game contract", () => {
  it("accepts only the fixed template, skins, and one-point revival questions", () => {
    expect(flapRevivalGameRevisionContentSchema.parse(content()).questions).toHaveLength(6);
    expect(
      flapRevivalGameRevisionContentSchema.safeParse({ ...content(), skin: "custom" }).success,
    ).toBe(false);
    const invalid = content();
    invalid.questions[0] = {
      ...invalid.questions[0],
      points: 2,
    } as (typeof invalid.questions)[number];
    expect(flapRevivalGameRevisionContentSchema.safeParse(invalid).success).toBe(false);
  });

  it("redacts answers, explanations, and the revival threshold from delivery", () => {
    const parsed = flapRevivalGameRevisionContentSchema.parse(content());
    const serialized = JSON.stringify(createQuizDeliveryQuestions(parsed.questions.slice(0, 3)));
    expect(serialized).not.toContain("correctOptionId");
    expect(serialized).not.toContain("correctAnswer");
    expect(serialized).not.toContain("explanationMarkdown");
    expect(serialized).not.toContain("requiredCorrect");
  });
});
