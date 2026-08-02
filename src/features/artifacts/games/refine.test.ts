import { describe, expect, it } from "vitest";
import type { FlapRevivalGameRevisionContent } from "./contract";
import { applyGameRefineEdits, gameRefineEditsSchema } from "./refine";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function singleChoiceQuestion(index: number) {
  return {
    correctOptionId: id(100 + index * 2),
    difficulty: "easy" as const,
    explanationMarkdown: `Explanation ${index}`,
    options: [
      { optionId: id(100 + index * 2), text: "Correct" },
      { optionId: id(101 + index * 2), text: "Distractor" },
    ],
    points: 1 as const,
    promptMarkdown: `Question ${index}`,
    questionId: id(index),
    type: "single_choice" as const,
  };
}

function gameContent(): FlapRevivalGameRevisionContent {
  return {
    descriptionMarkdown: "Description",
    questions: Array.from({ length: 6 }, (_, index) => singleChoiceQuestion(index)),
    revival: { questionCount: 3, requiredCorrect: 2 },
    schemaVersion: 1,
    skin: "skyline_day",
    template: "flap_revival",
    title: "Game",
  };
}

describe("Game question edits", () => {
  it("allows an unbounded question pool and arbitrary-sized additions", () => {
    const nextIds = Array.from({ length: 25 }, (_, index) => id(200 + index));
    let cursor = 0;
    const updated = applyGameRefineEdits(
      gameContent(),
      nextIds.map((questionId) => ({
        question: {
          correctAnswer: true,
          difficulty: "medium" as const,
          explanationMarkdown: "Added explanation",
          points: 1 as const,
          promptMarkdown: `Added ${questionId}`,
          type: "true_false" as const,
        },
        type: "add_question" as const,
      })),
      () => nextIds[cursor++] ?? id(999),
    );

    expect(updated.questions).toHaveLength(31);
  });

  it("preserves question and option IDs when updating and creates fresh IDs when copying", () => {
    const content = gameContent();
    const updated = applyGameRefineEdits(content, [
      {
        questionId: id(0),
        question: {
          correctOptionIndex: 1,
          difficulty: "medium",
          explanationMarkdown: "Updated explanation",
          options: ["Distractor", "Renamed correct"],
          points: 1,
          promptMarkdown: "Updated prompt",
          type: "single_choice",
        },
        type: "update_question",
      },
    ]);
    expect(updated.questions[0]).toMatchObject({
      correctOptionId: id(100),
      questionId: id(0),
      options: [
        { optionId: id(101), text: "Distractor" },
        { optionId: id(100), text: "Renamed correct" },
      ],
    });

    const copied = applyGameRefineEdits(
      content,
      [{ questionId: id(0), type: "copy_question" }],
      (() => {
        const values = [id(300), id(301), id(302)];
        return () => values.shift() ?? id(399);
      })(),
    );
    expect(copied.questions).toHaveLength(7);
    expect(copied.questions[1]?.questionId).toBe(id(300));
    expect(copied.questions[1]).toMatchObject({
      correctOptionId: id(301),
      options: [
        { optionId: id(301), text: "Correct" },
        { optionId: id(302), text: "Distractor" },
      ],
    });
  });

  it("does not allow the game pool to shrink below six questions", () => {
    expect(() =>
      applyGameRefineEdits(gameContent(), [
        { questionId: id(0), type: "delete_question" },
        { questionId: id(1), type: "delete_question" },
        { questionId: id(2), type: "delete_question" },
        { questionId: id(3), type: "delete_question" },
        { questionId: id(4), type: "delete_question" },
        { questionId: id(5), type: "delete_question" },
      ]),
    ).toThrow("game_requires_question_pool");
  });

  it("moves questions without changing their identities", () => {
    const moved = applyGameRefineEdits(gameContent(), [
      { direction: "down", questionId: id(0), type: "move_question" },
    ]);
    expect(moved.questions[0]?.questionId).toBe(id(1));
    expect(moved.questions[1]?.questionId).toBe(id(0));
  });

  it("rejects multiple-choice and non-one-point drafts", () => {
    expect(
      gameRefineEditsSchema.safeParse([
        {
          question: {
            correctOptionIndexes: [0],
            difficulty: "easy",
            explanationMarkdown: "Explanation",
            options: ["A", "B"],
            points: 1,
            promptMarkdown: "Prompt",
            type: "multiple_choice",
          },
          type: "add_question",
        },
      ]).success,
    ).toBe(false);
    expect(
      gameRefineEditsSchema.safeParse([
        {
          question: {
            correctAnswer: true,
            difficulty: "easy",
            explanationMarkdown: "Explanation",
            points: 2,
            promptMarkdown: "Prompt",
            type: "true_false",
          },
          type: "add_question",
        },
      ]).success,
    ).toBe(false);
  });
});
