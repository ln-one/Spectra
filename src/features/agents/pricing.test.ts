import { describe, expect, it } from "vitest";
import { dashScopeModels } from "@/ai/dashscope";
import { aiModelRate, estimateAiCostMicrousd } from "./pricing";

describe("versioned AI pricing", () => {
  it("fails closed for an unpriced model", () => {
    expect(() => aiModelRate("future-unpriced-model")).toThrow();
  });

  it("prices known input and output usage without a silent fallback", () => {
    expect(
      estimateAiCostMicrousd({ inputTokens: 100, modelId: "qwen3.7-plus", outputTokens: 25 }),
    ).toBe(400);
  });

  it("prices every canonical DashScope model role", () => {
    for (const modelId of Object.values(dashScopeModels)) {
      expect(() => aiModelRate(modelId)).not.toThrow();
    }
  });
});
