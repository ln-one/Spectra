import { expect, test } from "vitest";
import { artifactSuggestionsDifferFrom } from "./suggestions";

const previous = [
  { prompt: "创建一份区块链技术基础演示。", title: "区块链技术基础" },
  { prompt: "制作一份贝叶斯分类器教学课件。", title: "贝叶斯分类器" },
  { prompt: "生成人机交互设计原则演示。", title: "人机交互原则" },
  { prompt: "制作机器学习基础课程课件。", title: "机器学习基础" },
];

test("requires every regenerated suggestion card to differ from the previous cards", () => {
  expect(
    artifactSuggestionsDifferFrom(
      previous.map((suggestion, index) =>
        index === 0 ? { ...suggestion, title: "区块链：技术基础" } : suggestion,
      ),
      previous,
    ),
  ).toBe(false);

  expect(
    artifactSuggestionsDifferFrom(
      [
        { prompt: "设计一份共识机制对比演示。", title: "共识机制对比" },
        { prompt: "制作概率推断案例分析课件。", title: "概率推断案例" },
        { prompt: "创建可用性测试实践演示。", title: "可用性测试实践" },
        { prompt: "制作特征工程工作流课件。", title: "特征工程工作流" },
      ],
      previous,
    ),
  ).toBe(true);
});
