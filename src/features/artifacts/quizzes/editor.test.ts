import { describe, expect, it } from "vitest";
import type { QuizRevisionContent } from "./contract";
import { applyQuizEdits } from "./editor";

const ids = {
  optionA: "00000000-0000-4000-8000-000000000011",
  optionB: "00000000-0000-4000-8000-000000000012",
  question: "00000000-0000-4000-8000-000000000010",
};

const content: QuizRevisionContent = {
  descriptionMarkdown: "Description",
  questions: [
    {
      correctOptionId: ids.optionA,
      difficulty: "easy",
      explanationMarkdown: "Explanation",
      options: [
        { optionId: ids.optionA, text: "A" },
        { optionId: ids.optionB, text: "B" },
      ],
      points: 1,
      promptMarkdown: "Prompt",
      questionId: ids.question,
      type: "single_choice",
    },
  ],
  schemaVersion: 1,
  settings: { feedbackMode: "after_submission", navigationMode: "free" },
  title: "Quiz",
};

function idFactory() {
  const generated = [
    "00000000-0000-4000-8000-000000000020",
    "00000000-0000-4000-8000-000000000021",
    "00000000-0000-4000-8000-000000000022",
  ];
  return () => {
    const next = generated.shift();
    if (!next) throw new Error("fixture_ids_exhausted");
    return next;
  };
}

describe("Quiz structural edits", () => {
  it("preserves existing question and option identities on an update", () => {
    const updated = applyQuizEdits(content, [
      {
        questionId: ids.question,
        question: {
          correctOptionIndex: 1,
          difficulty: "medium",
          explanationMarkdown: "Updated explanation",
          options: ["B", "A renamed"],
          points: 2,
          promptMarkdown: "Updated prompt",
          type: "single_choice",
        },
        type: "update_question",
      },
    ]);
    expect(updated.questions[0]).toMatchObject({
      correctOptionId: ids.optionA,
      questionId: ids.question,
      options: [
        { optionId: ids.optionB, text: "B" },
        { optionId: ids.optionA, text: "A renamed" },
      ],
    });
  });

  it("copies a question with new server identities", () => {
    const copied = applyQuizEdits(
      content,
      [{ questionId: ids.question, type: "copy_question" }],
      idFactory(),
    );
    expect(copied.questions).toHaveLength(2);
    expect(copied.questions[1]?.questionId).not.toBe(ids.question);
    expect(copied.questions[1]).toMatchObject({
      correctOptionId: "00000000-0000-4000-8000-000000000021",
    });
    expect(
      copied.questions[1]?.type === "single_choice" ? copied.questions[1].options : [],
    ).toEqual([
      { optionId: "00000000-0000-4000-8000-000000000021", text: "A" },
      { optionId: "00000000-0000-4000-8000-000000000022", text: "B" },
    ]);
  });
});
