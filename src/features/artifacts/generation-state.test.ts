import { describe, expect, it } from "vitest";
import {
  InvalidArtifactGenerationTransitionError,
  transitionArtifactGeneration,
} from "./generation-state";

describe("Artifact generation transitions", () => {
  it.each([
    ["queued", "generating"],
    ["generating", "generating"],
    ["generating", "finalizing"],
    ["finalizing", "ready"],
    ["failed", "queued"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(transitionArtifactGeneration(from, to)).toBe(to);
  });

  it.each([
    ["queued", "ready"],
    ["ready", "generating"],
    ["failed", "generating"],
    ["failed", "ready"],
    ["cancelled", "ready"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(() => transitionArtifactGeneration(from, to)).toThrow(
      InvalidArtifactGenerationTransitionError,
    );
  });
});
