import { describe, expect, it } from "vitest";
import {
  artifactEditProposalEnvelopeSchema,
  teachingDocumentEditProposalSchema,
} from "./proposal-contract";

const proposal = {
  artifactId: "00000000-0000-4000-8000-000000000001",
  baseRevisionId: "00000000-0000-4000-8000-000000000002",
  edits: [{ blockId: "paragraph-1", operation: "delete_block" as const }],
  kind: "teaching_document" as const,
  request: "Delete the duplicate paragraph",
  runId: "00000000-0000-4000-8000-000000000003",
  summary: "Deleted one duplicate paragraph",
  title: "Canonical proposal",
};

const envelope = {
  groundingReceipt: { operationEvidence: [], version: 1 as const },
  proposal,
  version: 1 as const,
};

describe("Artifact edit proposal envelope", () => {
  it("accepts the canonical persisted envelope", () => {
    expect(artifactEditProposalEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it.each([
    ["a bare proposal", proposal],
    ["a missing grounding receipt", { proposal, version: 1 }],
    ["an extra field", { ...envelope, compatibilityPayload: proposal }],
  ])("rejects %s", (_label, input) => {
    expect(artifactEditProposalEnvelopeSchema.safeParse(input).success).toBe(false);
  });

  it("does not accept transient repair states as proposals", () => {
    expect(
      teachingDocumentEditProposalSchema.safeParse({
        allowedBlockIds: ["paragraph-1"],
        attempt: 1,
        status: "needs_revision",
      }).success,
    ).toBe(false);
  });
});
