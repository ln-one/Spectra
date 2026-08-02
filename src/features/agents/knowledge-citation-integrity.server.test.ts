import { describe, expect, it } from "vitest";
import { knowledgeStructuredContentHash } from "@/features/knowledge/integrity";
import { assertKnowledgeEvidenceIntegrity } from "./knowledge-citation-integrity.server";

const common = {
  citationNumber: 1,
  citationToken: "ke-0123456789abcdef",
  evidenceId: "00000000-0000-4000-8000-000000000031",
  sourceId: "00000000-0000-4000-8000-000000000032",
  sourceName: "部署手册.pdf",
  sourceRevision: 1,
};

describe("Knowledge citation server integrity", () => {
  it("validates structured Evidence hashes", () => {
    const exactExcerpt = "将流量切回蓝色环境。";
    const locator = { kind: "text_range" as const, start: 10, end: 21 };
    const content = { kind: "exact_text" as const, text: exactExcerpt };
    expect(
      assertKnowledgeEvidenceIntegrity([
        {
          type: "data-knowledgeEvidence",
          data: {
            schemaVersion: 2,
            evidence: [
              {
                ...common,
                content,
                contentHash: knowledgeStructuredContentHash({
                  content,
                  fidelity: "source",
                  locator,
                }),
                exactExcerpt,
                fidelity: "source",
                locator,
                representationHash: "a".repeat(64),
              },
            ],
          },
        },
      ]),
    ).toHaveLength(1);
  });

  it("rejects a valid-looking but incorrect persisted hash", () => {
    expect(() =>
      assertKnowledgeEvidenceIntegrity([
        {
          type: "data-knowledgeEvidence",
          data: {
            schemaVersion: 2,
            evidence: [
              {
                ...common,
                content: { kind: "exact_text", text: "将流量切回蓝色环境。" },
                exactExcerpt: "将流量切回蓝色环境。",
                fidelity: "source",
                locator: { kind: "text_range", start: 10, end: 21 },
                contentHash: "f".repeat(64),
                representationHash: "a".repeat(64),
              },
            ],
          },
        },
      ]),
    ).toThrow("knowledge_evidence_integrity_failed");
  });
});
