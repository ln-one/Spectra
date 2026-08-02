import { describe, expect, it } from "vitest";
import { scoreExpectedToolCall } from "./tool-policy-eval";

describe("official Mastra tool-call accuracy policy", () => {
  it("scores the requested creation tool without leaking framework details", async () => {
    await expect(
      scoreExpectedToolCall(["create_teaching_document"], "create_teaching_document"),
    ).resolves.toMatchObject({ score: 1 });
    await expect(
      scoreExpectedToolCall(["create_mind_map"], "create_teaching_document"),
    ).resolves.toMatchObject({ score: 0 });
  });
});
