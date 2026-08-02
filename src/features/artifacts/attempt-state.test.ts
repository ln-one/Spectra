import { describe, expect, it } from "vitest";
import {
  InvalidArtifactAttemptTransitionError,
  transitionArtifactGenerationAttempt,
  transitionArtifactProviderAttempt,
} from "./attempt-state";

describe("Artifact generation attempt transitions", () => {
  it.each([
    ["queued", "running"],
    ["running", "submitted"],
    ["running", "failed"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(transitionArtifactGenerationAttempt(from, to)).toBe(to);
  });

  it("rejects terminal rewrites", () => {
    expect(() => transitionArtifactGenerationAttempt("failed", "running")).toThrow(
      InvalidArtifactAttemptTransitionError,
    );
  });
});

describe("Artifact provider attempt transitions", () => {
  it.each(["succeeded", "failed", "exhausted"] as const)("allows running -> %s", (to) => {
    expect(transitionArtifactProviderAttempt("running", to)).toBe(to);
  });

  it("rejects terminal rewrites", () => {
    expect(() => transitionArtifactProviderAttempt("failed", "succeeded")).toThrow(
      InvalidArtifactAttemptTransitionError,
    );
  });
});
