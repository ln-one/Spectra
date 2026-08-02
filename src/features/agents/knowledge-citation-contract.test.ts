import { describe, expect, it } from "vitest";
import { knowledgeStructuredContentHash } from "@/features/knowledge/integrity";
import {
  countTrustedArtifactGroundingCitationFallbacks,
  extractKnowledgeEvidence,
  extractRenderableKnowledgeVisualEvidenceIds,
  knowledgeEvidenceByCitationNumber,
  knowledgeEvidenceData,
  knowledgeEvidenceHref,
  knowledgeEvidenceMarkdownLink,
  numberedKnowledgeEvidenceData,
  parseKnowledgeEvidenceHref,
  referencedKnowledgeCitationTokens,
  trustedKnowledgeCitationFallbacks,
} from "./knowledge-citation-contract";

const evidence = {
  citationToken: "ke-0123456789abcdef",
  evidenceId: "00000000-0000-4000-8000-000000000031",
  sourceId: "00000000-0000-4000-8000-000000000032",
  sourceName: "部署手册.pdf",
  sourceRevision: 1,
  representationHash: "a".repeat(64),
  exactExcerpt: "将流量切回蓝色环境。",
  locator: { kind: "text_range" as const, start: 10, end: 21 },
  content: { kind: "exact_text" as const, text: "将流量切回蓝色环境。" },
  fidelity: "source" as const,
  contentHash: knowledgeStructuredContentHash({
    content: { kind: "exact_text", text: "将流量切回蓝色环境。" },
    fidelity: "source",
    locator: { kind: "text_range", start: 10, end: 21 },
  }),
};

describe("knowledge citation contract", () => {
  it("creates contiguous markers and only parses an exact opaque citation fragment", () => {
    const data = knowledgeEvidenceData([evidence]);
    const first = data.evidence[0];
    if (!first) throw new Error("Expected citation evidence");
    expect(first.citationNumber).toBe(1);
    expect(knowledgeEvidenceMarkdownLink(first)).toBe(
      "[1](#knowledge-evidence-ke-0123456789abcdef)",
    );
    expect(parseKnowledgeEvidenceHref(knowledgeEvidenceHref(evidence.citationToken))).toBe(
      evidence.citationToken,
    );
    expect(parseKnowledgeEvidenceHref("#knowledge-evidence-not-a-uuid")).toBeNull();
    expect(parseKnowledgeEvidenceHref("https://example.com")).toBeNull();
  });

  it("accepts empty deltas and deduplicates immutable Evidence identity", () => {
    const data = knowledgeEvidenceData([evidence]);
    expect(
      extractKnowledgeEvidence([
        {
          type: "data-knowledgeEvidence",
          data: { schemaVersion: 2, evidence: [] },
        },
        { type: "data-knowledgeEvidence", data },
        { type: "data", name: "knowledgeEvidence", data },
        { type: "data-knowledgeEvidence", data },
      ]),
    ).toEqual(data.evidence);
  });

  it("hard-fails malformed Evidence parts", () => {
    expect(() =>
      extractKnowledgeEvidence([
        {
          type: "data-knowledgeEvidence",
          data: { schemaVersion: 2, evidence: [{ invalid: true }] },
        },
      ]),
    ).toThrow("knowledge_evidence_schema_invalid");
  });

  it("authorizes image rendering separately without changing canonical Evidence content", () => {
    const content = {
      accessibleDescription: "A deployment diagram.",
      asset: { kind: "source_original" as const },
      kind: "visual_region" as const,
    };
    const locator = { boxes: [], kind: "page_region" as const, pageIndex: 0 };
    const visual = {
      ...evidence,
      citationNumber: 1,
      content,
      contentHash: knowledgeStructuredContentHash({
        content,
        fidelity: "source",
        locator,
      }),
      exactExcerpt: "A deployment diagram.",
      locator,
    };
    const data = numberedKnowledgeEvidenceData([visual], [visual.evidenceId]);
    const parts = [{ data, type: "data-knowledgeEvidence" }];

    expect(extractKnowledgeEvidence(parts)[0]?.content).toEqual(content);
    expect(extractRenderableKnowledgeVisualEvidenceIds(parts)).toEqual(
      new Set([visual.evidenceId]),
    );
    expect(() =>
      numberedKnowledgeEvidenceData([visual], ["00000000-0000-4000-8000-000000000099"]),
    ).toThrow();
  });

  it("keeps historical V2 evidence compatible and treats Workspace origin as identity", () => {
    const withOrigin = knowledgeEvidenceData([
      {
        ...evidence,
        workspaceOrigin: {
          workspaceId: "00000000-0000-4000-8000-000000000051",
          workspaceName: "部署知识库",
          workspaceRelation: "referenced",
        },
      },
    ]);
    expect(
      extractKnowledgeEvidence([{ type: "data-knowledgeEvidence", data: withOrigin }]),
    ).toEqual(withOrigin.evidence);

    const conflictingOrigin = {
      ...withOrigin,
      evidence: withOrigin.evidence.map((item) => ({
        ...item,
        workspaceOrigin: { ...item.workspaceOrigin, workspaceName: "另一个知识库" },
      })),
    };
    expect(() =>
      extractKnowledgeEvidence([
        { type: "data-knowledgeEvidence", data: withOrigin },
        { type: "data-knowledgeEvidence", data: conflictingOrigin },
      ]),
    ).toThrow("knowledge_evidence_conflict");

    expect(knowledgeEvidenceData([evidence]).evidence[0]).not.toHaveProperty("workspaceOrigin");
  });

  it("merges strictly ordered Evidence deltas into one continuous citation sequence", () => {
    const first = knowledgeEvidenceData([evidence]);
    const secondEvidence = {
      ...evidence,
      citationToken: "ke-fedcba9876543210",
      evidenceId: "00000000-0000-4000-8000-000000000041",
      contentHash: "b".repeat(64),
    };
    const second = knowledgeEvidenceData([secondEvidence], 2);

    expect(
      extractKnowledgeEvidence([
        { type: "data-knowledgeEvidence", data: first },
        { type: "data-knowledgeEvidence", data: second },
      ]).map((item) => [item.citationNumber, item.citationToken]),
    ).toEqual([
      [1, evidence.citationToken],
      [2, secondEvidence.citationToken],
    ]);
  });

  it("rejects cross-part citation token, number, content, and representation conflicts", () => {
    const first = knowledgeEvidenceData([evidence]);
    const contentConflict = {
      ...first,
      evidence: first.evidence.map((item) => ({ ...item, contentHash: "c".repeat(64) })),
    };
    expect(() =>
      extractKnowledgeEvidence([
        { type: "data-knowledgeEvidence", data: first },
        { type: "data-knowledgeEvidence", data: contentConflict },
      ]),
    ).toThrow("knowledge_evidence_conflict");

    const representationConflict = {
      ...first,
      evidence: first.evidence.map((item) => ({
        ...item,
        representationHash: "d".repeat(64),
      })),
    };
    expect(() =>
      extractKnowledgeEvidence([
        { type: "data-knowledgeEvidence", data: first },
        { type: "data-knowledgeEvidence", data: representationConflict },
      ]),
    ).toThrow("knowledge_evidence_conflict");
  });

  it("finds only complete Evidence Markdown links in text parts", () => {
    expect(
      referencedKnowledgeCitationTokens([
        { type: "text", text: `支持结论。[1](${knowledgeEvidenceHref(evidence.citationToken)})` },
        { type: "text", text: "流式半截。[2](#knowledge-evidence-ke-0123" },
        { type: "data", text: `[3](${knowledgeEvidenceHref(evidence.citationToken)})` },
      ]),
    ).toEqual(new Set([evidence.citationToken]));
  });

  it("recognizes trusted citation fallbacks without trusting unknown numbers", () => {
    const numbered = knowledgeEvidenceData([evidence]).evidence;
    const matches = trustedKnowledgeCitationFallbacks(
      `相邻参数 [E1][e1]，模型标签 [C1]，脚注 [^1]，纯数字 [1]，正式链接 [1](${knowledgeEvidenceHref(evidence.citationToken)})，未知 [E9][9]，半截 [E`,
      knowledgeEvidenceByCitationNumber(numbered),
    );

    expect(matches.map((match) => [match.kind, match.evidence.citationNumber])).toEqual([
      ["artifact_grounding_ref", 1],
      ["artifact_grounding_ref", 1],
      ["model_label", 1],
      ["footnote", 1],
      ["plain_number", 1],
    ]);
  });

  it("counts only trusted Artifact grounding fallbacks in assistant text parts", () => {
    const numbered = knowledgeEvidenceData([evidence]).evidence;

    expect(
      countTrustedArtifactGroundingCitationFallbacks(
        [
          { type: "text", text: "可信 [E1][e1]，未知 [E9]，其他兼容 [C1][^1]" },
          { type: "data", text: "[E1]" },
        ],
        numbered,
      ),
    ).toBe(2);
  });
});
