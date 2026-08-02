import { describe, expect, it } from "vitest";
import { parsePlanningQuestion, parsePlanningQuestionBatch } from "./planning-tools";

describe("parsePlanningQuestion", () => {
  it("normalizes provider-encoded option arrays", () => {
    expect(
      parsePlanningQuestion({
        options: '[{"label":"初学者","description":"零基础"}]',
        question: "目标受众是谁？",
        selectionMode: "single_select",
      }),
    ).toEqual({
      options: [{ description: "零基础", label: "初学者" }],
      question: "目标受众是谁？",
      selectionMode: "single_select",
    });
  });

  it("normalizes a grouped planning round", () => {
    expect(
      parsePlanningQuestionBatch({
        questions: JSON.stringify([
          { options: [{ label: "教师" }], question: "受众是谁？" },
          { options: [{ label: "20页" }], question: "篇幅多长？" },
        ]),
      }),
    ).toEqual({
      questions: [
        { options: [{ label: "教师" }], question: "受众是谁？" },
        { options: [{ label: "20页" }], question: "篇幅多长？" },
      ],
    });
  });
});
