import { describe, expect, it } from "vitest";
import { InvalidStateTransitionError, transitionAiRun, transitionAiRunAttempt } from "./run-state";

describe("AI Run transitions", () => {
  it.each([
    ["claimed", "running"],
    ["running", "publishing"],
    ["publishing", "succeeded"],
    ["failed", "publishing"],
    ["interrupted", "publishing"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(transitionAiRun(from, to)).toBe(to);
  });

  it.each([
    ["succeeded", "running"],
    ["cancelled", "publishing"],
    ["superseded", "failed"],
    ["failed", "running"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(() => transitionAiRun(from, to)).toThrow(InvalidStateTransitionError);
  });
});

describe("AI Run attempt transitions", () => {
  it.each([
    "succeeded",
    "failed",
    "interrupted",
    "cancelled",
  ] as const)("allows running -> %s", (state) =>
    expect(transitionAiRunAttempt("running", state)).toBe(state));

  it("rejects rewriting a terminal attempt", () => {
    expect(() => transitionAiRunAttempt("failed", "succeeded")).toThrow(
      InvalidStateTransitionError,
    );
  });
});
