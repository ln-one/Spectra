import { describe, expect, it } from "vitest";
import type { QuizRevisionContent } from "./contract";
import { reviewQuizProposalScope, validateQuizFocus } from "./refine";

const questionId = "00000000-0000-4000-8000-000000000010";
const otherQuestionId = "00000000-0000-4000-8000-000000000020";
const content: QuizRevisionContent = {
  descriptionMarkdown: "Description",
  questions: [questionId, otherQuestionId].map((id, index) => ({
    correctAnswer: index === 0,
    difficulty: "easy" as const,
    explanationMarkdown: `Explanation ${index + 1}`,
    points: 1,
    promptMarkdown: `Prompt ${index + 1}`,
    questionId: id,
    type: "true_false" as const,
  })),
  schemaVersion: 1,
  settings: { feedbackMode: "after_submission", navigationMode: "free" },
  title: "Quiz",
};

describe("Quiz scoped refine", () => {
  it("projects only focused questions", () => {
    const focus = validateQuizFocus(content, {
      kind: "quiz_questions",
      questionIds: [questionId],
      revisionId: "00000000-0000-4000-8000-000000000001",
    });
    expect(focus?.contextMarkdown).toContain("Prompt 1");
    expect(focus?.contextMarkdown).not.toContain("Prompt 2");
  });

  it("maps choice option IDs to the zero-based indexes required by refine edits", () => {
    const choiceQuestionId = "00000000-0000-4000-8000-000000000030";
    const firstOptionId = "00000000-0000-4000-8000-000000000031";
    const secondOptionId = "00000000-0000-4000-8000-000000000032";
    const focus = validateQuizFocus(
      {
        ...content,
        questions: [
          {
            correctOptionId: secondOptionId,
            difficulty: "medium",
            explanationMarkdown: "Because B is correct",
            options: [
              { optionId: firstOptionId, text: "A" },
              { optionId: secondOptionId, text: "B" },
            ],
            points: 2,
            promptMarkdown: "Choose one",
            questionId: choiceQuestionId,
            type: "single_choice",
          },
        ],
      },
      {
        kind: "quiz_questions",
        questionIds: [choiceQuestionId],
        revisionId: "00000000-0000-4000-8000-000000000001",
      },
    );

    expect(focus?.contextMarkdown).toContain(`Option 0 [option:${firstOptionId}]: A`);
    expect(focus?.contextMarkdown).toContain(`Option 1 [option:${secondOptionId}]: B`);
    expect(focus?.contextMarkdown).toContain("Correct option index: 1");
    expect(focus?.contextMarkdown).not.toContain("Correct option ID:");
  });

  it("allows selected-question edits and rejects global or unselected edits", () => {
    const focus = validateQuizFocus(content, {
      kind: "quiz_questions",
      questionIds: [questionId],
      revisionId: "00000000-0000-4000-8000-000000000001",
    });
    expect(reviewQuizProposalScope(focus, [{ questionId, type: "copy_question" }])).toEqual({
      status: "allowed",
    });
    expect(
      reviewQuizProposalScope(focus, [{ questionId: otherQuestionId, type: "delete_question" }]),
    ).toMatchObject({ status: "outside_scope" });
    expect(
      reviewQuizProposalScope(focus, [{ title: "New title", type: "update_settings" }]),
    ).toMatchObject({ status: "outside_scope" });
    expect(
      reviewQuizProposalScope(focus, [
        {
          question: {
            correctAnswer: true,
            difficulty: "easy",
            explanationMarkdown: "Explanation",
            points: 1,
            promptMarkdown: "Prompt",
            type: "true_false",
          },
          type: "add_question",
        },
      ]),
    ).toMatchObject({ status: "outside_scope" });
  });
});
