import { describe, expect, test } from "vitest";
import type { QuizRevisionContent } from "./contract";
import { buildQuizProposalDiff } from "./proposal-diff";

const optionA = { optionId: "00000000-0000-4000-8000-000000000003", text: "A" };
const optionB = { optionId: "00000000-0000-4000-8000-000000000004", text: "B" };

const question = {
  correctOptionId: optionA.optionId,
  difficulty: "medium" as const,
  explanationMarkdown: "Because A.",
  options: [optionA, optionB],
  points: 1,
  promptMarkdown: "Original prompt",
  questionId: "00000000-0000-4000-8000-000000000002",
  type: "single_choice" as const,
};

const base: QuizRevisionContent = {
  descriptionMarkdown: "Description",
  questions: [question],
  schemaVersion: 1,
  settings: { feedbackMode: "after_submission", navigationMode: "free" },
  title: "Quiz",
};

describe("buildQuizProposalDiff", () => {
  test("classifies stable question and option updates", () => {
    const next: QuizRevisionContent = {
      ...base,
      questions: [
        {
          ...question,
          correctOptionId: optionB.optionId,
          options: [
            optionA,
            { ...optionB, text: "Better B" },
            { optionId: "00000000-0000-4000-8000-000000000005", text: "C" },
          ],
          promptMarkdown: "Expanded prompt",
        },
      ],
    };

    const diff = buildQuizProposalDiff(base, next);

    expect(diff.changeCount).toBe(1);
    expect(diff.questions[0]).toMatchObject({
      fields: ["prompt", "options", "answer"],
      moved: false,
      status: "updated",
    });
    expect(diff.questions[0]?.options.map((option) => option.status)).toEqual([
      "unchanged",
      "updated",
      "added",
    ]);
  });

  test("detects option reordering without treating it as text replacement", () => {
    const next: QuizRevisionContent = {
      ...base,
      questions: [{ ...question, options: [optionB, optionA] }],
    };

    const diff = buildQuizProposalDiff(base, next);

    expect(diff.questions[0]?.fields).toContain("options");
    expect(diff.questions[0]?.options).toEqual([
      { after: optionB, before: optionB, moved: true, status: "unchanged" },
      { after: optionA, before: optionA, moved: true, status: "unchanged" },
    ]);
  });

  test("keeps deleted questions and detects movement", () => {
    const second = {
      ...question,
      questionId: "00000000-0000-4000-8000-000000000006",
    };
    const third = {
      ...question,
      questionId: "00000000-0000-4000-8000-000000000007",
    };
    const previous = { ...base, questions: [question, second, third] };
    const next = { ...base, questions: [third, question] };

    const diff = buildQuizProposalDiff(previous, next);

    expect(diff.questions.find((item) => item.questionId === second.questionId)).toMatchObject({
      after: null,
      previousIndex: 1,
      status: "deleted",
    });
    expect(diff.questions.find((item) => item.questionId === third.questionId)).toMatchObject({
      moved: true,
      nextIndex: 0,
      previousIndex: 2,
    });
  });

  test("does not report stable questions as moved when another question is inserted", () => {
    const added = {
      ...question,
      questionId: "00000000-0000-4000-8000-000000000008",
    };
    const diff = buildQuizProposalDiff(base, { ...base, questions: [added, question] });

    expect(diff.questions.find((item) => item.questionId === question.questionId)?.moved).toBe(
      false,
    );
  });

  test("counts Quiz-level settings independently from questions", () => {
    const diff = buildQuizProposalDiff(base, {
      ...base,
      settings: { feedbackMode: "immediate", navigationMode: "sequential" },
      title: "Revised Quiz",
    });

    expect(diff.changeCount).toBe(3);
    expect(diff.settings).toEqual({
      description: false,
      feedbackMode: true,
      navigationMode: true,
      title: true,
    });
  });
});
