import { describe, expect, it } from "vitest";
import { type QuizRevisionContent, quizRevisionContentSchema } from "./contract";
import { createQuizDeliverySnapshot } from "./delivery";
import { gradeQuiz } from "./grading";

const ids = {
  artifact: "00000000-0000-4000-8000-000000000001",
  revision: "00000000-0000-4000-8000-000000000002",
  q1: "00000000-0000-4000-8000-000000000003",
  q2: "00000000-0000-4000-8000-000000000004",
  a: "00000000-0000-4000-8000-000000000005",
  b: "00000000-0000-4000-8000-000000000006",
  c: "00000000-0000-4000-8000-000000000007",
};

const content: QuizRevisionContent = quizRevisionContentSchema.parse({
  descriptionMarkdown: "检查基础概念。",
  questions: [
    {
      correctOptionIds: [ids.a, ids.c],
      difficulty: "medium",
      explanationMarkdown: "A、C 正确。",
      options: [
        { optionId: ids.a, text: "A" },
        { optionId: ids.b, text: "B" },
        { optionId: ids.c, text: "C" },
      ],
      points: 3,
      promptMarkdown: "选择正确项",
      questionId: ids.q1,
      type: "multiple_choice",
    },
    {
      correctAnswer: true,
      difficulty: "easy",
      explanationMarkdown: "这是正确陈述。",
      points: 2,
      promptMarkdown: "判断题",
      questionId: ids.q2,
      type: "true_false",
    },
  ],
  schemaVersion: 1,
  settings: { feedbackMode: "after_submission", navigationMode: "free" },
  title: "测试测验",
});

describe("Quiz contract", () => {
  it("redacts answers and explanations from delivery snapshots", () => {
    const snapshot = createQuizDeliverySnapshot({
      artifactId: ids.artifact,
      content,
      revisionId: ids.revision,
    });
    expect(JSON.stringify(snapshot)).not.toContain("correct");
    expect(JSON.stringify(snapshot)).not.toContain("explanation");
  });

  it("grades multiple choice independent of answer order and leaves unanswered at zero", () => {
    const result = gradeQuiz(
      content,
      new Map([
        [ids.q1, { optionIds: [ids.c, ids.a], type: "multiple_choice" }],
        [ids.q2, { type: "true_false", value: null }],
      ]),
    );
    expect(result).toMatchObject({ score: 3, totalPoints: 5 });
    expect(result.questions.map((question) => question.correct)).toEqual([true, false]);
  });

  it("rejects duplicate question IDs and multiple choice without a distractor", () => {
    const invalid = structuredClone(content);
    const firstQuestion = invalid.questions[0];
    if (!firstQuestion) throw new Error("Fixture requires a question");
    invalid.questions[1] = structuredClone(firstQuestion);
    expect(quizRevisionContentSchema.safeParse(invalid).success).toBe(false);

    const noDistractor = structuredClone(content);
    const first = noDistractor.questions[0];
    if (first?.type === "multiple_choice") {
      first.correctOptionIds = first.options.map((option) => option.optionId);
    }
    expect(quizRevisionContentSchema.safeParse(noDistractor).success).toBe(false);
  });
});
