import { describe, expect, test } from "vitest";
import {
  type ArtifactGroundingEvidence,
  artifactGroundingReceiptForOperation,
  artifactGroundingSourcesFromMetadata,
  operationGroundingReceiptFromBundle,
  packArtifactGroundingEvidence,
  readArtifactGroundingReceipt,
} from "./grounding";

const ids = {
  evidenceA: "11111111-1111-4111-8111-111111111111",
  evidenceB: "22222222-2222-4222-8222-222222222222",
  sourceA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function evidence(
  input: Partial<ArtifactGroundingEvidence> &
    Pick<ArtifactGroundingEvidence, "evidenceId" | "sourceId">,
): ArtifactGroundingEvidence {
  return {
    content: { kind: "exact_text", text: "reference content" },
    contentHash: hashA,
    fidelity: "source",
    locator: { end: 17, kind: "text_range", start: 0 },
    representationHash: hashB,
    sourceName: "Source A.pdf",
    sourceRevision: 1,
    ...input,
    evidenceId: input.evidenceId,
    sourceId: input.sourceId,
  };
}

describe("Artifact grounding", () => {
  test("packs in selected order, deduplicates identities, and excludes non-text visual units", () => {
    const first = evidence({ evidenceId: ids.evidenceA, sourceId: ids.sourceA });
    const visual = evidence({
      content: {
        asset: { kind: "ingestion_archive_entry", path: "private/object.png" },
        kind: "visual_region",
      },
      evidenceId: ids.evidenceB,
      sourceId: ids.sourceB,
    });

    expect(packArtifactGroundingEvidence([first, first, visual])).toEqual({
      evidence: [first],
      version: 1,
    });
  });

  test("skips whole Evidence units that exceed the codepoint budget", () => {
    const oversized = evidence({
      content: { kind: "exact_text", text: "界".repeat(12_001) },
      evidenceId: ids.evidenceA,
      sourceId: ids.sourceA,
    });
    const fitting = evidence({
      content: { kind: "exact_text", text: "fits" },
      evidenceId: ids.evidenceB,
      sourceId: ids.sourceB,
    });

    expect(packArtifactGroundingEvidence([oversized, fitting]).evidence).toEqual([fitting]);
  });

  test("builds stable lineage while keeping operation Evidence revision-scoped", () => {
    const firstBundle = packArtifactGroundingEvidence([
      evidence({
        evidenceId: ids.evidenceA,
        sourceId: ids.sourceA,
        sourcePresentation: { family: "pdf", kind: "file" },
        workspaceOrigin: {
          workspaceId: "33333333-3333-4333-8333-333333333333",
          workspaceName: "Referenced Workspace",
          workspaceRelation: "referenced",
        },
      }),
    ]);
    const firstReceipt = artifactGroundingReceiptForOperation({
      operation: operationGroundingReceiptFromBundle(firstBundle),
    });
    const secondReceipt = artifactGroundingReceiptForOperation({
      operation: operationGroundingReceiptFromBundle(
        packArtifactGroundingEvidence([
          evidence({
            evidenceId: ids.evidenceB,
            sourceId: ids.sourceB,
            sourceName: "Source B.docx",
          }),
        ]),
      ),
      parent: firstReceipt,
    });
    const manualReceipt = artifactGroundingReceiptForOperation({
      operation: { operationEvidence: [], version: 1 },
      parent: secondReceipt,
    });

    expect(secondReceipt.operationEvidence.map((item) => item.evidenceId)).toEqual([ids.evidenceB]);
    expect(manualReceipt.operationEvidence).toEqual([]);
    expect(manualReceipt.lineageSources).toEqual([
      {
        sourceId: ids.sourceA,
        sourceName: "Source A.pdf",
        sourcePresentation: { family: "pdf", kind: "file" },
        workspaceOrigin: {
          workspaceId: "33333333-3333-4333-8333-333333333333",
          workspaceName: "Referenced Workspace",
          workspaceRelation: "referenced",
        },
      },
      { sourceId: ids.sourceB, sourceName: "Source B.docx" },
    ]);
  });

  test("treats legacy metadata as empty and malformed Receipt metadata as invalid", () => {
    expect(readArtifactGroundingReceipt({ profileVersion: "legacy" }).status).toBe("missing");
    expect(readArtifactGroundingReceipt({ groundingReceipt: { version: 99 } }).status).toBe(
      "invalid",
    );
    expect(artifactGroundingSourcesFromMetadata({ groundingReceipt: { version: 99 } })).toEqual([]);
  });

  test("enriches legacy lineage when later evidence provides presentation metadata", () => {
    const legacyParent = artifactGroundingReceiptForOperation({
      operation: operationGroundingReceiptFromBundle(
        packArtifactGroundingEvidence([
          evidence({ evidenceId: ids.evidenceA, sourceId: ids.sourceA }),
        ]),
      ),
    });
    const enriched = artifactGroundingReceiptForOperation({
      operation: operationGroundingReceiptFromBundle(
        packArtifactGroundingEvidence([
          evidence({
            evidenceId: ids.evidenceB,
            sourceId: ids.sourceA,
            sourcePresentation: { family: "pdf", kind: "file" },
          }),
        ]),
      ),
      parent: legacyParent,
    });

    expect(enriched.lineageSources).toEqual([
      {
        sourceId: ids.sourceA,
        sourceName: "Source A.pdf",
        sourcePresentation: { family: "pdf", kind: "file" },
      },
    ]);
  });
});
