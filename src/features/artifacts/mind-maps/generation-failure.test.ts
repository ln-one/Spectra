import { NoOutputGeneratedError } from "ai";
import { expect, test } from "vitest";
import { mindMapGenerationFailureCode } from "./generation-failure";

test("classifies invalid mind map output", () => {
  expect(mindMapGenerationFailureCode(new NoOutputGeneratedError())).toBe(
    "mind_map_invalid_output",
  );
  expect(mindMapGenerationFailureCode(new Error("mind_map_invalid_output"))).toBe(
    "mind_map_invalid_output",
  );
});
