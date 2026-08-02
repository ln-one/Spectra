import { describe, expect, it } from "vitest";
import {
  knowledgeContentHash,
  knowledgeStructuredContentHash,
  normalizeStoredKnowledgeContentHash,
} from "./integrity";

const value = {
  content: { kind: "exact_text", text: "fact" },
  locator: { kind: "text_range", start: 0, end: 4 },
  fidelity: "source",
};

describe("Knowledge content integrity", () => {
  it("requires the structured digest for current adapters", () => {
    const structuredHash = knowledgeStructuredContentHash(value);
    expect(
      normalizeStoredKnowledgeContentHash({
        adapterId: "mineru-content-v3",
        adapterVersion: "3",
        storedHash: structuredHash,
        exactText: "fact",
        ...value,
      }),
    ).toBe(structuredHash);
    expect(() =>
      normalizeStoredKnowledgeContentHash({
        adapterId: "mineru-content-v3",
        adapterVersion: "3",
        storedHash: knowledgeContentHash("fact"),
        exactText: "fact",
        ...value,
      }),
    ).toThrow("knowledge_content_integrity_failed");
  });

  it("rejects unstructured digests regardless of adapter metadata", () => {
    expect(() =>
      normalizeStoredKnowledgeContentHash({
        adapterId: "obsolete-adapter",
        adapterVersion: "1",
        storedHash: knowledgeContentHash("fact"),
        exactText: "fact",
        ...value,
      }),
    ).toThrow("knowledge_content_integrity_failed");
  });
});
