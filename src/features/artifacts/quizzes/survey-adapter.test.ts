import { Model } from "survey-core";
import { describe, expect, it } from "vitest";
import type { QuizDeliverySnapshot } from "./contract";
import {
  quizAnswersEqual,
  quizDeliveryToSurveyJson,
  surveyValueToQuizAnswer,
} from "./survey-adapter";

const snapshot: QuizDeliverySnapshot = {
  artifactId: "00000000-0000-4000-8000-000000000001",
  descriptionMarkdown: "Description",
  feedbackMode: "after_submission",
  navigationMode: "free",
  questions: [
    {
      difficulty: "easy",
      options: [
        { optionId: "00000000-0000-4000-8000-000000000004", text: "A" },
        { optionId: "00000000-0000-4000-8000-000000000005", text: "B" },
      ],
      points: 1,
      promptMarkdown: "Single",
      questionId: "00000000-0000-4000-8000-000000000003",
      type: "single_choice",
    },
    {
      difficulty: "medium",
      options: [
        { optionId: "00000000-0000-4000-8000-000000000007", text: "A" },
        { optionId: "00000000-0000-4000-8000-000000000008", text: "B" },
      ],
      points: 2,
      promptMarkdown: "Multiple",
      questionId: "00000000-0000-4000-8000-000000000006",
      type: "multiple_choice",
    },
    {
      difficulty: "easy",
      points: 1,
      promptMarkdown: "True false",
      questionId: "00000000-0000-4000-8000-000000000009",
      type: "true_false",
    },
  ],
  revisionId: "00000000-0000-4000-8000-000000000002",
  title: "Quiz",
  totalPoints: 4,
};

describe("SurveyJS Quiz adapter", () => {
  it("maps all supported types to one question per page", () => {
    const json = quizDeliveryToSurveyJson(snapshot, { false: "错误", true: "正确" });
    expect(json.pages).toHaveLength(3);
    expect(json.pages.map((page) => page.elements[0]?.type)).toEqual([
      "radiogroup",
      "checkbox",
      "radiogroup",
    ]);
    expect(json.pages[2]?.elements[0]?.choices).toEqual([
      { text: "正确", value: true },
      { text: "错误", value: false },
    ]);
  });

  it("uses question IDs as names and option IDs as values", () => {
    const json = quizDeliveryToSurveyJson(snapshot, { false: "False", true: "True" });
    const firstQuestion = snapshot.questions[0];
    if (!firstQuestion || firstQuestion.type === "true_false") throw new Error("Invalid fixture");
    expect(json.pages[0]?.elements[0]?.name).toBe(firstQuestion.questionId);
    expect(json.pages[0]?.elements[0]?.choices).toContainEqual({
      text: "A",
      value: firstQuestion.options[0]?.optionId,
    });
  });

  it("converts SurveyJS values back to owned answer contracts", () => {
    const question = snapshot.questions[1];
    if (question?.type !== "multiple_choice") throw new Error("Invalid fixture");
    expect(
      surveyValueToQuizAnswer(snapshot, question.questionId, [question.options[1]?.optionId]),
    ).toEqual({ optionIds: [question.options[1]?.optionId], type: "multiple_choice" });
  });

  it("supports one-page navigation and emits stable owned question identities", () => {
    const model = new Model(quizDeliveryToSurveyJson(snapshot, { false: "False", true: "True" }));
    const changed: Array<{ name: string; value: unknown }> = [];
    model.onValueChanged.add((_sender, event) => {
      changed.push({ name: event.name, value: event.value });
    });
    const first = snapshot.questions[0];
    if (first?.type !== "single_choice") throw new Error("Invalid fixture");
    model.setValue(first.questionId, first.options[1]?.optionId);
    model.currentPageNo = 2;

    expect(model.pageCount).toBe(3);
    expect(model.currentPageNo).toBe(2);
    expect(changed).toEqual([{ name: first.questionId, value: first.options[1]?.optionId }]);
  });

  it("treats reordered multiple-choice values as the same answer", () => {
    expect(
      quizAnswersEqual(
        { optionIds: ["a", "b"], type: "multiple_choice" },
        { optionIds: ["b", "a"], type: "multiple_choice" },
      ),
    ).toBe(true);
    expect(
      quizAnswersEqual(
        { optionId: "a", type: "single_choice" },
        { optionId: "b", type: "single_choice" },
      ),
    ).toBe(false);
  });
});
