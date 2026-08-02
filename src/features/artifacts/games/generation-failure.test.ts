import { APICallError, NoObjectGeneratedError } from "ai";
import { expect, test } from "vitest";
import { gameGenerationFailureCode } from "./generation-failure";

test("classifies safe terminal game generation failure codes", () => {
  expect(gameGenerationFailureCode(new Error("artifact_generation_budget_exhausted"))).toBe(
    "game_budget_exhausted",
  );
  expect(
    gameGenerationFailureCode(
      new APICallError({
        message: "rate limited",
        requestBodyValues: {},
        statusCode: 429,
        url: "https://provider.invalid",
      }),
    ),
  ).toBe("game_rate_limited");
  expect(
    gameGenerationFailureCode(
      new NoObjectGeneratedError({
        finishReason: "error",
        response: { id: "response", modelId: "model", timestamp: new Date(0) },
        usage: {
          inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            noCacheTokens: 0,
          },
          inputTokens: 0,
          outputTokenDetails: { reasoningTokens: 0, textTokens: 0 },
          outputTokens: 0,
          totalTokens: 0,
        },
      }),
    ),
  ).toBe("game_invalid_output");
  expect(gameGenerationFailureCode(new Error("Request timed out"))).toBe("game_generation_timeout");
  expect(gameGenerationFailureCode(new Error("game_invalid_output"))).toBe("game_invalid_output");
  expect(gameGenerationFailureCode(new Error("connection reset"))).toBe("game_provider_failed");
});
