import { describe, expect, it } from "vitest";
import { validateEvidenceSelection } from "./citation";
import { buildContextView, packEvidence } from "./context";
import { projectMarkdownRepresentation } from "./projection";

describe("knowledge context and evidence", () => {
  it("marks the target and includes one adjacent structural block", () => {
    const projected = projectMarkdownRepresentation({
      representationId: "r1",
      text: "# H\n\nbefore\n\ntarget\n\nafter",
      profile: {
        id: "test",
        capacityCounter: "unicode-codepoint-v1",
        chunk: { maxUnits: 7, overlap: 0 },
        context: { neighborBlocks: 1, maxUnits: 2048 },
        retrieval: { candidateLimit: 20, outputLimit: 10, wrrfK: 60, weights: [1, 1] },
        packing: { maxUnits: 12_000, maxEvidenceUnits: 32 },
      },
    });
    const target = projected.chunks[1];
    if (!target) throw new Error("Target Chunk was not projected");
    const view = buildContextView({ chunk: target, blocks: projected.blocks });
    expect(view).toContain("<TARGET_CHUNK>\n\ntarget\n\n</TARGET_CHUNK>");
    expect(view).toContain("before");
    expect(view).toContain("after");
  });

  it("packs by exact locator without merging different sources", () => {
    const projected = projectMarkdownRepresentation({
      representationId: "r1",
      text: "one. two.",
    });
    const chunk = projected.chunks[0];
    if (!chunk) throw new Error("Chunk was not projected");
    const packed = packEvidence([
      {
        sourceId: "s1",
        workspaceId: "w1",
        workspaceName: "Current Workspace",
        workspaceRelation: "current",
        sourceRevision: 1,
        representationHash: "a".repeat(64),
        chunk,
        evidence: projected.evidenceUnits,
      },
      {
        sourceId: "s2",
        workspaceId: "w2",
        workspaceName: "Referenced Workspace",
        workspaceRelation: "referenced",
        sourceRevision: 1,
        representationHash: "a".repeat(64),
        chunk,
        evidence: projected.evidenceUnits,
      },
    ]);
    expect(new Set(packed.evidence.map((unit) => unit.sourceId))).toEqual(new Set(["s1", "s2"]));
  });

  it("rejects citations outside the returned bundle", () => {
    const projected = projectMarkdownRepresentation({ representationId: "r1", text: "one." });
    const evidence = projected.evidenceUnits[0];
    if (!evidence) throw new Error("EvidenceUnit was not projected");
    const unit = {
      ...evidence,
      sourceId: "s1",
      workspaceId: "w1",
      workspaceName: "Current Workspace",
      workspaceRelation: "current" as const,
      sourceRevision: 1,
      representationHash: "a".repeat(64),
    };
    expect(validateEvidenceSelection([unit], [unit.id]).valid).toBe(true);
    expect(validateEvidenceSelection([unit], ["unknown"])).toEqual({
      valid: false,
      reason: "evidence_outside_bundle",
    });
  });
});
