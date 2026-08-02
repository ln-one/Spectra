import { expect, test } from "vitest";
import { isArtifactSourceKind } from "./types";

test("allows games and presentations to participate in Artifact Source membership", () => {
  expect(isArtifactSourceKind("game")).toBe(true);
  expect(isArtifactSourceKind("presentation")).toBe(true);
  expect(isArtifactSourceKind("animation")).toBe(false);
});
