import { describe, expect, it } from "vitest";
import {
  artifactGenerationStartInputSchema,
  artifactOutcomeForFinishReason,
  settleArtifactGenerationUsage,
} from "./generation";

const validStartInput = {
  conversationId: "10000000-0000-4000-8000-000000000001",
  locale: "zh-CN",
  prompt: "Explain Bayes' theorem",
  sourceUserMessageId: "message-1",
  workspaceId: "10000000-0000-4000-8000-000000000002",
} as const;

describe("artifactGenerationStartInputSchema", () => {
  it("normalizes the shared generation boundary and supplies empty grounding", () => {
    expect(artifactGenerationStartInputSchema.parse(validStartInput)).toEqual({
      ...validStartInput,
      grounding: { evidence: [], version: 1 },
    });
  });

  it.each([
    ["unknown fields", { ...validStartInput, compatibilityMode: true }],
    ["invalid workspace IDs", { ...validStartInput, workspaceId: "workspace-1" }],
    ["empty prompts", { ...validStartInput, prompt: "   " }],
    ["oversized source message IDs", { ...validStartInput, sourceUserMessageId: "x".repeat(129) }],
  ])("rejects %s", (_label, input) => {
    expect(artifactGenerationStartInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("artifactOutcomeForFinishReason", () => {
  it.each([
    "length",
    "content-filter",
    "error",
    "other",
    "unknown",
    "tool-calls",
  ])("treats %s as a usable partial generation", (finishReason) => {
    expect(artifactOutcomeForFinishReason(finishReason)).toBe("partial");
  });

  it("only treats a natural stop as a normally completed generation", () => {
    const finishReason = "stop";
    expect(artifactOutcomeForFinishReason(finishReason)).toBe("complete");
  });
});

describe("settleArtifactGenerationUsage", () => {
  it("settles provider usage and finish reason together", async () => {
    await expect(
      settleArtifactGenerationUsage({
        finishReason: Promise.resolve("stop"),
        usage: Promise.resolve({ inputTokens: 12, outputTokens: 34, totalTokens: 46 }),
      }),
    ).resolves.toEqual({
      finishReason: "stop",
      inputTokens: 12,
      outputTokens: 34,
      totalTokens: 46,
    });
  });

  it("returns a stable error usage when provider metadata cannot settle", async () => {
    await expect(
      settleArtifactGenerationUsage({
        finishReason: Promise.resolve("stop"),
        usage: Promise.reject(new Error("usage unavailable")),
      }),
    ).resolves.toEqual({
      finishReason: "error",
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    });
  });
});
