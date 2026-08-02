import { describe, expect, it } from "vitest";
import { parseArtifactSelection } from "./contract";

describe("Artifact interaction contracts", () => {
  it("validates selection through the owning Artifact schema", () => {
    const selection = {
      kind: "quiz_questions",
      questionIds: ["00000000-0000-4000-8000-000000000001"],
      revisionId: "00000000-0000-4000-8000-000000000002",
    } as const;

    expect(parseArtifactSelection("quiz", selection)).toEqual(selection);
    expect(() => parseArtifactSelection("mind_map", selection)).toThrow();
  });

  it("rejects oversized serialized selection state", () => {
    expect(() =>
      parseArtifactSelection("teaching_document", {
        blockIds: ["block-1"],
        kind: "teaching_document_blocks",
        revisionId: "00000000-0000-4000-8000-000000000002",
        selectedText: "x".repeat(32_769),
      }),
    ).toThrow("artifact_selection_too_large");
  });

  it("uses null as the explicit no-selection contract", () => {
    expect(parseArtifactSelection("game", null)).toBeNull();
    expect(() => parseArtifactSelection("game", {})).toThrow();
  });
});
