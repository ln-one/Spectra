import { describe, expect, it } from "vitest";
import { artifactSourceProjectableBlocks } from "./artifact-source-projection";

describe("artifactSourceProjectableBlocks", () => {
  it("projects mind-map nodes with their complete root path and note", () => {
    const blocks = artifactSourceProjectableBlocks("mind_map", {
      generation: { outcome: "complete", rawOutput: "{}", warnings: [] },
      schemaVersion: 2,
      rootId: "root",
      nodes: [
        { id: "child", label: "朴素贝叶斯", note: "条件独立假设", order: 0, parentId: "root" },
        { id: "root", label: "贝叶斯分类器", order: 0, parentId: null },
      ],
    });

    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({
      headingPath: ["贝叶斯分类器", "朴素贝叶斯"],
      locator: { kind: "structured_path", path: "/nodes/0" },
    });
    expect(blocks[1]?.exactText).toContain("贝叶斯分类器 > 朴素贝叶斯");
    expect(blocks[1]?.exactText).toContain("条件独立假设");
  });

  it("projects each quiz question with choices, answer, and explanation only", () => {
    const blocks = artifactSourceProjectableBlocks("quiz", {
      schemaVersion: 1,
      title: "贝叶斯小测",
      descriptionMarkdown: "",
      settings: { feedbackMode: "after_submission", navigationMode: "free" },
      questions: [
        {
          questionId: "00000000-0000-4000-8000-000000000001",
          type: "single_choice",
          difficulty: "easy",
          points: 10,
          promptMarkdown: "哪个公式表示后验概率？",
          explanationMarkdown: "使用贝叶斯定理。",
          correctOptionId: "00000000-0000-4000-8000-000000000002",
          options: [
            {
              optionId: "00000000-0000-4000-8000-000000000002",
              text: "P(c|x)",
            },
            {
              optionId: "00000000-0000-4000-8000-000000000003",
              text: "P(x)",
            },
          ],
        },
      ],
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.exactText).toContain("哪个公式表示后验概率？");
    expect(blocks[0]?.exactText).toContain("P(c|x)");
    expect(blocks[0]?.exactText).toContain("Correct answer: P(c|x)");
    expect(blocks[0]?.exactText).toContain("使用贝叶斯定理。");
    expect(blocks[0]?.exactText).not.toMatch(/score|attempt|earned/i);
  });

  it("reuses the quiz projection for game questions without indexing gameplay state", () => {
    const blocks = artifactSourceProjectableBlocks("game", {
      schemaVersion: 1,
      title: "贝叶斯飞跃复活",
      descriptionMarkdown: "答对题目即可复活。",
      template: "flap_revival",
      skin: "city_night",
      revival: { questionCount: 3, requiredCorrect: 2 },
      questions: Array.from({ length: 6 }, (_, index) => ({
        questionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        type: "true_false",
        difficulty: "easy",
        points: 1,
        promptMarkdown: `第 ${index + 1} 题：后验概率需要结合先验概率。`,
        explanationMarkdown: "依据贝叶斯定理。",
        correctAnswer: true,
      })),
    });

    expect(blocks).toHaveLength(6);
    expect(blocks[0]).toMatchObject({
      headingPath: ["贝叶斯飞跃复活", "Question 1"],
      locator: { kind: "structured_path", path: "/questions/0" },
    });
    expect(blocks[0]?.exactText).toContain("Correct answer: True");
    expect(blocks[0]?.exactText).toContain("依据贝叶斯定理。");
    expect(JSON.stringify(blocks)).not.toMatch(/city_night|flap_revival|score|attempt/i);
  });
});
