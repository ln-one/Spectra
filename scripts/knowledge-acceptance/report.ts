import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const rankedPointSchema = z
  .object({
    id: z.string(),
    sourceId: z.string(),
    rank: z.int().positive(),
    score: z.number().finite().nullable(),
  })
  .strict();

const evidenceSchema = z
  .object({
    id: z.string(),
    sourceId: z.string(),
    excerpt: z.string(),
    start: z.int().nonnegative(),
    end: z.int().positive(),
  })
  .strict();

const exactRequestSchema = z
  .object({
    collection: z.string(),
    dense: z.array(z.number().finite()),
    sparseText: z.string(),
    manifestHash: z.string(),
    workspaceIds: z.array(z.string()).min(1),
    k: z.int().positive(),
    weights: z.tuple([z.number(), z.number()]),
    limit: z.int().positive(),
  })
  .strict();

const queryReportSchema = z
  .object({
    id: z.string(),
    intent: z.string(),
    query: z.string(),
    expectedSourceIds: z.array(z.string()),
    expectedEvidenceAny: z.array(z.string()),
    negativeSourceIds: z.array(z.string()),
    plannedQueries: z
      .object({
        intentQuery: z.string(),
        denseQuery: z.string(),
        sparseQuery: z.string(),
        rerankQuery: z.string(),
      })
      .strict(),
    status: z.enum(["ok", "degraded"]),
    degradedReasons: z.array(z.string()),
    timingsMs: z.record(z.string(), z.number().nonnegative()),
    exactRequest: exactRequestSchema,
    dense: z.array(rankedPointSchema),
    sparse: z.array(rankedPointSchema),
    exhaustiveWrrf: z.array(rankedPointSchema),
    exactRrf: z.array(rankedPointSchema),
    preRerank: z.array(
      z
        .object({
          id: z.string(),
          retrievalRank: z.int().positive(),
          contextView: z.string(),
        })
        .strict(),
    ),
    reranked: z.array(
      z
        .object({
          id: z.string(),
          sourceId: z.string(),
          rank: z.int().positive(),
          retrievalRank: z.int().positive(),
          score: z.number().finite().nullable(),
          contextView: z.string(),
        })
        .strict(),
    ),
    evidence: z.array(evidenceSchema),
    packing: z
      .object({
        evidenceUnits: z.int().nonnegative(),
        capacityUnits: z.int().nonnegative(),
        maxEvidenceUnits: z.int().positive(),
        maxCapacityUnits: z.int().positive(),
      })
      .strict(),
    metrics: z
      .object({
        sourceRecallAt20: z.number().min(0).max(1),
        hitAt10: z.boolean(),
        reciprocalRank: z.number().min(0).max(1),
        evidenceHit: z.boolean(),
        negativeHitAt10: z.boolean(),
        oracleMatch: z.boolean(),
      })
      .strict(),
    guarantee: z.unknown(),
    execution: z.unknown().optional(),
  })
  .strict();

export const acceptanceReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string(),
    mode: z.enum(["offline", "live"]),
    createdAt: z.string(),
    gitCommit: z.string(),
    fixtureVersion: z.string(),
    corpusHash: z.string().length(64),
    profile: z
      .object({
        chunkMaxUnits: z.int().positive(),
        chunkOverlap: z.literal(0),
        candidateLimit: z.int().positive(),
        outputLimit: z.int().positive(),
        wrrfK: z.int().positive(),
        weights: z.tuple([z.number(), z.number()]),
      })
      .strict(),
    models: z
      .object({
        queryPlanning: z.string(),
        embedding: z.string(),
        sparse: z.string(),
        rerank: z.string(),
      })
      .strict(),
    corpus: z
      .object({
        sourceCount: z.int().positive(),
        chunkCount: z.int().positive(),
        evidenceCount: z.int().positive(),
        minChunkUnits: z.int().nonnegative(),
        maxChunkUnits: z.int().positive(),
        averageChunkUnits: z.number().nonnegative(),
        p50ChunkUnits: z.number().nonnegative(),
        p95ChunkUnits: z.number().nonnegative(),
        oversizedSplitSources: z.int().nonnegative(),
        locatorErrors: z.int().nonnegative(),
        hashErrors: z.int().nonnegative(),
        identityErrors: z.int().nonnegative(),
        headingBoundaryViolations: z.int().nonnegative(),
      })
      .strict(),
    providerCalls: z.record(z.string(), z.int().nonnegative()),
    providerTimingsMs: z.record(z.string(), z.number().nonnegative()),
    aggregate: z
      .object({
        queryCount: z.int().positive(),
        sourceRecallAt20: z.number().min(0).max(1),
        hitAt10: z.number().min(0).max(1),
        meanReciprocalRank: z.number().min(0).max(1),
        evidenceHitRate: z.number().min(0).max(1),
        negativeHitAt10Rate: z.number().min(0).max(1),
        exactMismatchCount: z.int().nonnegative(),
        degradedCount: z.int().nonnegative(),
        hardGatePassed: z.boolean(),
      })
      .strict(),
    queries: z.array(queryReportSchema),
  })
  .strict();

export type AcceptanceReport = z.infer<typeof acceptanceReportSchema>;

const acceptanceSummarySchema = acceptanceReportSchema
  .pick({
    schemaVersion: true,
    runId: true,
    mode: true,
    createdAt: true,
    gitCommit: true,
    fixtureVersion: true,
    corpusHash: true,
    models: true,
    corpus: true,
    providerCalls: true,
    providerTimingsMs: true,
    aggregate: true,
  })
  .extend({
    queries: z.array(
      queryReportSchema
        .pick({
          id: true,
          status: true,
          timingsMs: true,
          metrics: true,
        })
        .strict(),
    ),
  })
  .strict();

export type AcceptanceSummary = z.infer<typeof acceptanceSummarySchema>;

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function cell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderAcceptanceMarkdown(report: AcceptanceReport) {
  const lines = [
    `# Knowledge Search Acceptance — ${report.runId}`,
    "",
    `- Mode: \`${report.mode}\``,
    `- Git: \`${report.gitCommit}\``,
    `- Fixture: \`${report.fixtureVersion}\``,
    `- Corpus hash: \`${report.corpusHash}\``,
    `- Hard gate: **${report.aggregate.hardGatePassed ? "PASS" : "FAIL"}**`,
    "",
    "## Aggregate",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Queries | ${report.aggregate.queryCount} |`,
    `| Source Recall@20 | ${percent(report.aggregate.sourceRecallAt20)} |`,
    `| Hit@10 | ${percent(report.aggregate.hitAt10)} |`,
    `| MRR | ${report.aggregate.meanReciprocalRank.toFixed(3)} |`,
    `| Evidence hit | ${percent(report.aggregate.evidenceHitRate)} |`,
    `| Negative hit@10 | ${percent(report.aggregate.negativeHitAt10Rate)} |`,
    `| Exact mismatches | ${report.aggregate.exactMismatchCount} |`,
    `| Degraded queries | ${report.aggregate.degradedCount} |`,
    "",
    "## Providers",
    "",
    "| Provider | Calls | Total ms |",
    "| --- | ---: | ---: |",
    ...Object.keys(report.providerCalls)
      .sort()
      .map(
        (provider) =>
          `| ${provider} | ${report.providerCalls[provider] ?? 0} | ${(report.providerTimingsMs[provider] ?? 0).toFixed(2)} |`,
      ),
    "",
    "## Corpus",
    "",
    `Sources ${report.corpus.sourceCount}; chunks ${report.corpus.chunkCount}; evidence ${report.corpus.evidenceCount}.`,
    "",
    `Chunk capacity min/avg/p50/p95/max: ${report.corpus.minChunkUnits}/${report.corpus.averageChunkUnits.toFixed(1)}/${report.corpus.p50ChunkUnits}/${report.corpus.p95ChunkUnits}/${report.corpus.maxChunkUnits}.`,
    "",
    `Invariant errors — locator ${report.corpus.locatorErrors}, hash ${report.corpus.hashErrors}, identity ${report.corpus.identityErrors}, heading boundary ${report.corpus.headingBoundaryViolations}.`,
    "",
    "## Query Summary",
    "",
    "| Query | Recall@20 | Hit@10 | RR | Evidence | Oracle | Status |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...report.queries.map(
      (query) =>
        `| ${cell(query.id)} | ${percent(query.metrics.sourceRecallAt20)} | ${query.metrics.hitAt10 ? "yes" : "no"} | ${query.metrics.reciprocalRank.toFixed(3)} | ${query.metrics.evidenceHit ? "yes" : "no"} | ${query.metrics.oracleMatch ? "yes" : "no"} | ${query.status} |`,
    ),
  ];
  for (const query of report.queries) {
    lines.push(
      "",
      `## ${query.id}`,
      "",
      `**Intent:** ${query.intent}`,
      "",
      `**Query:** ${query.query}`,
      "",
      "```json",
      JSON.stringify(query.plannedQueries, null, 2),
      "```",
      "",
      `Exact request: collection \`${query.exactRequest.collection}\`, Dense ${query.exactRequest.dense.length} dimensions, Sparse \`${cell(query.exactRequest.sparseText)}\`, limit ${query.exactRequest.limit}.`,
      "",
      "### WRRF Top-20",
      "",
      "The ordered identities and ranks come from Stratumind exact-rrf; scores are independently recomputed by the exhaustive acceptance oracle.",
      "",
      "| Rank | Source | Point | Score |",
      "| ---: | --- | --- | ---: |",
      ...query.exactRrf.map(
        (point) =>
          `| ${point.rank} | ${cell(point.sourceId)} | \`${point.id}\` | ${point.score?.toFixed(8) ?? "n/a"} |`,
      ),
      "",
      "### Rerank Input Context Views",
      "",
      ...query.preRerank.flatMap((candidate) => [
        `#### Retrieval ${candidate.retrievalRank}. ${candidate.id}`,
        "",
        "```text",
        candidate.contextView,
        "```",
      ]),
      "",
      "### Reranked Top-10",
      "",
      ...query.reranked.flatMap((candidate) => [
        `#### ${candidate.rank}. ${candidate.sourceId}`,
        "",
        `Retrieval rank ${candidate.retrievalRank}; score ${candidate.score?.toFixed(6) ?? "fallback"}.`,
        "",
        "```text",
        candidate.contextView,
        "```",
      ]),
      "",
      "### Packed Evidence",
      "",
      `${query.packing.evidenceUnits}/${query.packing.maxEvidenceUnits} EvidenceUnits; ${query.packing.capacityUnits}/${query.packing.maxCapacityUnits} capacity units.`,
      "",
      ...query.evidence.map(
        (evidence) =>
          `- **${evidence.sourceId}** \`${evidence.start}:${evidence.end}\` — ${evidence.excerpt}`,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function createAcceptanceSummary(report: AcceptanceReport): AcceptanceSummary {
  return acceptanceSummarySchema.parse({
    schemaVersion: report.schemaVersion,
    runId: report.runId,
    mode: report.mode,
    createdAt: report.createdAt,
    gitCommit: report.gitCommit,
    fixtureVersion: report.fixtureVersion,
    corpusHash: report.corpusHash,
    models: report.models,
    corpus: report.corpus,
    providerCalls: report.providerCalls,
    providerTimingsMs: report.providerTimingsMs,
    aggregate: report.aggregate,
    queries: report.queries.map((query) => ({
      id: query.id,
      status: query.status,
      timingsMs: query.timingsMs,
      metrics: query.metrics,
    })),
  });
}

export function renderAcceptanceSummaryMarkdown(summary: AcceptanceSummary) {
  const lines = [
    `# Knowledge acceptance summary — ${summary.runId}`,
    "",
    `- Mode: \`${summary.mode}\``,
    `- Git: \`${summary.gitCommit}\``,
    `- Fixture: \`${summary.fixtureVersion}\``,
    `- Hard gate: **${summary.aggregate.hardGatePassed ? "PASS" : "FAIL"}**`,
    "",
    "## Aggregate",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Queries | ${summary.aggregate.queryCount} |`,
    `| Source Recall@20 | ${percent(summary.aggregate.sourceRecallAt20)} |`,
    `| Hit@10 | ${percent(summary.aggregate.hitAt10)} |`,
    `| MRR | ${summary.aggregate.meanReciprocalRank.toFixed(3)} |`,
    `| Evidence hit | ${percent(summary.aggregate.evidenceHitRate)} |`,
    `| Negative hit@10 | ${percent(summary.aggregate.negativeHitAt10Rate)} |`,
    `| Exact mismatches | ${summary.aggregate.exactMismatchCount} |`,
    `| Degraded queries | ${summary.aggregate.degradedCount} |`,
    "",
    "## Query Summary",
    "",
    "| Case | Recall@20 | Hit@10 | RR | Evidence | Oracle | Status | Duration |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    ...summary.queries.map(
      (query) =>
        `| ${cell(query.id)} | ${percent(query.metrics.sourceRecallAt20)} | ${query.metrics.hitAt10 ? "yes" : "no"} | ${query.metrics.reciprocalRank.toFixed(3)} | ${query.metrics.evidenceHit ? "yes" : "no"} | ${query.metrics.oracleMatch ? "yes" : "no"} | ${query.status} | ${(query.timingsMs.total ?? 0).toFixed(2)} ms |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeAcceptanceReport(input: {
  report: AcceptanceReport;
  outputRoot: string;
}) {
  const report = acceptanceReportSchema.parse(input.report);
  const summary = createAcceptanceSummary(report);
  const directory = path.join(input.outputRoot, report.runId);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(directory, "report.md"), renderAcceptanceMarkdown(report), "utf8"),
    writeFile(
      path.join(directory, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    ),
    writeFile(path.join(directory, "summary.md"), renderAcceptanceSummaryMarkdown(summary), "utf8"),
  ]);
  return directory;
}
