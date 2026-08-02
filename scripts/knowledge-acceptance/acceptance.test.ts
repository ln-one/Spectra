import { describe, expect, it } from "vitest";
import { deterministicEmbedding } from "./deterministic";
import { acceptanceFixtureSchema, acceptanceFixtureV1, acceptanceIdentity } from "./fixture";
import { exhaustiveWrrf } from "./oracle";
import {
  type AcceptanceReport,
  acceptanceReportSchema,
  createAcceptanceSummary,
  renderAcceptanceMarkdown,
  renderAcceptanceSummaryMarkdown,
} from "./report";
import { assertAcceptanceLoopbackUrl } from "./runner";

describe("knowledge acceptance fixture", () => {
  it("locks the V1 corpus, query count, references and stable identities", () => {
    expect(acceptanceFixtureV1.sources).toHaveLength(16);
    expect(acceptanceFixtureV1.queries).toHaveLength(32);
    expect(acceptanceFixtureSchema.parse(acceptanceFixtureV1)).toEqual(acceptanceFixtureV1);
    expect(acceptanceIdentity("source", "solar-storage")).toBe(
      acceptanceIdentity("source", "solar-storage"),
    );
  });

  it("rejects duplicate and unknown fixture references", () => {
    const duplicate = structuredClone(acceptanceFixtureV1);
    const firstSource = duplicate.sources[0];
    const secondSource = duplicate.sources[1];
    if (!firstSource || !secondSource) throw new Error("fixture sources missing");
    duplicate.sources[1] = { ...secondSource, id: firstSource.id };
    expect(acceptanceFixtureSchema.safeParse(duplicate).success).toBe(false);

    const unknown = structuredClone(acceptanceFixtureV1);
    const first = unknown.queries[0];
    if (!first) throw new Error("fixture query missing");
    first.expectedSourceIds = ["not-a-source"];
    expect(acceptanceFixtureSchema.safeParse(unknown).success).toBe(false);
  });
});

describe("knowledge acceptance deterministic providers", () => {
  it("produces stable finite normalized 512-dimensional embeddings", () => {
    const first = deterministicEmbedding("星港 SG-DELTA retrieval");
    const second = deterministicEmbedding("星港 SG-DELTA retrieval");
    expect(first).toEqual(second);
    expect(first).toHaveLength(512);
    expect(first.every(Number.isFinite)).toBe(true);
    const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 12);
  });
});

describe("knowledge acceptance exhaustive oracle", () => {
  it("fuses full channel ranks and breaks equal fusion scores by identity", () => {
    const result = exhaustiveWrrf({
      dense: [
        { id: "b", rank: 1, score: 1 },
        { id: "a", rank: 2, score: 0.9 },
      ],
      sparse: [
        { id: "a", rank: 1, score: 2 },
        { id: "b", rank: 2, score: 1.8 },
      ],
      k: 60,
      weights: [1, 1],
      limit: 2,
    });
    expect(result.map((point) => point.id)).toEqual(["a", "b"]);
    expect(result.map((point) => point.rank)).toEqual([1, 2]);
  });
});

function reportFixture(): AcceptanceReport {
  return acceptanceReportSchema.parse({
    schemaVersion: 1,
    runId: "run-1",
    mode: "offline",
    createdAt: "2026-07-22T00:00:00.000Z",
    gitCommit: "0435e65",
    fixtureVersion: "knowledge-acceptance-v1",
    corpusHash: "a".repeat(64),
    profile: {
      chunkMaxUnits: 512,
      chunkOverlap: 0,
      candidateLimit: 20,
      outputLimit: 10,
      wrrfK: 60,
      weights: [1, 1],
    },
    models: { queryPlanning: "agent", embedding: "e", sparse: "s", rerank: "x" },
    corpus: {
      sourceCount: 16,
      chunkCount: 32,
      evidenceCount: 64,
      minChunkUnits: 10,
      maxChunkUnits: 512,
      averageChunkUnits: 100,
      p50ChunkUnits: 90,
      p95ChunkUnits: 400,
      oversizedSplitSources: 1,
      locatorErrors: 0,
      hashErrors: 0,
      identityErrors: 0,
      headingBoundaryViolations: 0,
    },
    providerCalls: { embedding: 1, exactRrf: 1, rerank: 1 },
    providerTimingsMs: { embedding: 1, exactRrf: 1, rerank: 1 },
    aggregate: {
      queryCount: 1,
      sourceRecallAt20: 1,
      hitAt10: 1,
      meanReciprocalRank: 1,
      evidenceHitRate: 1,
      negativeHitAt10Rate: 0,
      exactMismatchCount: 0,
      degradedCount: 0,
      hardGatePassed: true,
    },
    queries: [
      {
        id: "q1",
        intent: "intent",
        query: "query",
        expectedSourceIds: ["source"],
        expectedEvidenceAny: ["answer"],
        negativeSourceIds: ["decoy"],
        plannedQueries: {
          intentQuery: "q",
          denseQuery: "q",
          sparseQuery: "q",
          rerankQuery: "q",
        },
        status: "ok",
        degradedReasons: [],
        timingsMs: { total: 1 },
        exactRequest: {
          collection: "acceptance",
          dense: [1],
          sparseText: "q",
          manifestHash: "manifest",
          workspaceIds: ["workspace"],
          k: 60,
          weights: [1, 1],
          limit: 20,
        },
        dense: [],
        sparse: [],
        exhaustiveWrrf: [],
        exactRrf: [],
        preRerank: [],
        reranked: [],
        evidence: [],
        packing: {
          evidenceUnits: 0,
          capacityUnits: 0,
          maxEvidenceUnits: 32,
          maxCapacityUnits: 12_000,
        },
        metrics: {
          sourceRecallAt20: 1,
          hitAt10: true,
          reciprocalRank: 1,
          evidenceHit: true,
          negativeHitAt10: false,
          oracleMatch: true,
        },
        guarantee: {},
      },
    ],
  });
}

describe("knowledge acceptance report", () => {
  it("validates its JSON contract and renders the required Markdown sections", () => {
    const report = reportFixture();
    const markdown = renderAcceptanceMarkdown(report);
    expect(markdown).toContain("## Aggregate");
    expect(markdown).toContain("## Corpus");
    expect(markdown).toContain("## Query Summary");
    expect(markdown).toContain("## q1");
  });

  it("creates an upload-safe summary without queries, evidence or context content", () => {
    const report = reportFixture();
    const query = report.queries[0];
    if (!query) throw new Error("report query missing");
    query.query = "private-query-body";
    query.intent = "private-intent-body";
    query.expectedEvidenceAny = ["private-evidence-body"];
    query.evidence = [
      {
        id: "evidence-id",
        sourceId: "source",
        excerpt: "private-excerpt-body",
        start: 0,
        end: 20,
      },
    ];
    const summary = createAcceptanceSummary(report);
    const serialized = JSON.stringify(summary);
    const markdown = renderAcceptanceSummaryMarkdown(summary);

    expect(summary.queries).toEqual([
      {
        id: "q1",
        status: "ok",
        timingsMs: { total: 1 },
        metrics: report.queries[0]?.metrics,
      },
    ]);
    for (const privateValue of [
      "private-query-body",
      "private-intent-body",
      "private-evidence-body",
      "private-excerpt-body",
    ]) {
      expect(serialized).not.toContain(privateValue);
      expect(markdown).not.toContain(privateValue);
    }
  });
});

describe("knowledge acceptance target safety", () => {
  it("accepts only loopback targets and the postgres admin database", () => {
    expect(
      assertAcceptanceLoopbackUrl(
        "postgresql://spectra:spectra@127.0.0.1:55432/postgres",
        "postgres",
      ).pathname,
    ).toBe("/postgres");
    expect(() =>
      assertAcceptanceLoopbackUrl("postgresql://spectra:spectra@example.com/postgres", "postgres"),
    ).toThrow("must_be_loopback");
    expect(() =>
      assertAcceptanceLoopbackUrl(
        "postgresql://spectra:spectra@127.0.0.1:55432/spectra",
        "postgres",
      ),
    ).toThrow("admin_database_required");
  });
});
