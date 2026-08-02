import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { QdrantClient } from "@qdrant/js-client-rest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { Database } from "@/database/client";
import * as schema from "@/database/schema";
import {
  fileSources,
  principals,
  retrievalChunks,
  retrievalEvidenceUnits,
  retrievalIndexGenerations,
  retrievalRepresentationBlocks,
  sourceIngestions,
  sources,
  workspaceLocators,
  workspaces,
} from "@/database/schema";
import { serverEnvironment } from "@/environment/server";
import { createBailianEmbeddingPort, createBailianRerankPort } from "@/features/knowledge/bailian";
import { knowledgeEnvironment } from "@/features/knowledge/config";
import { createStratumindIndexPort } from "@/features/knowledge/index-writer";
import {
  buildKnowledgeIndexGeneration,
  createKnowledgeIndexGeneration,
} from "@/features/knowledge/indexing.server";
import { knowledgeStructuredContentHash } from "@/features/knowledge/integrity";
import type {
  EmbeddingPort,
  ExactRrfPort,
  KnowledgeSearchQueries,
  RerankPort,
} from "@/features/knowledge/ports";
import { countCapacityUnits, knowledgeProfileV1 } from "@/features/knowledge/profile";
import { projectMarkdownRepresentation } from "@/features/knowledge/projection";
import { searchWorkspaceKnowledgeWithDependencies } from "@/features/knowledge/search";
import { createKnowledgeStore } from "@/features/knowledge/store.server";
import { createStratumindExactRrfPort } from "@/features/knowledge/stratumind";
import type { SourceStorage } from "@/features/sources/storage";
import { deterministicEmbeddingPort, deterministicRerankPort } from "./deterministic";
import { acceptanceCorpusHash, acceptanceFixtureV1, acceptanceIdentity } from "./fixture";
import { exhaustiveOracle, type OracleRankedPoint } from "./oracle";
import { type AcceptanceReport, acceptanceReportSchema, writeAcceptanceReport } from "./report";

const DEFAULT_POSTGRES_URL = "postgresql://spectra:spectra@127.0.0.1:55432/postgres";
const DEFAULT_STRATUMIND_URL = "http://127.0.0.1:6433";
const DATABASE_PREFIX = "spectra_knowledge_acceptance_";
const COLLECTION_PREFIX = "spectra-knowledge-acceptance-";

export type AcceptanceMode = "offline" | "live";

type QueryTrace = {
  embeddingInput?: readonly string[];
  embeddingOutput?: number[][];
  exactInput?: Parameters<ExactRrfPort["query"]>[0];
  exactOutput?: Awaited<ReturnType<ExactRrfPort["query"]>>;
  rerankInput?: Parameters<RerankPort["rerank"]>[0];
  rerankOutput?: Awaited<ReturnType<RerankPort["rerank"]>>;
  timingsMs: Record<string, number>;
};

export function assertAcceptanceLoopbackUrl(raw: string, kind: "postgres" | "stratumind") {
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`knowledge_acceptance_${kind}_must_be_loopback`);
  }
  if (kind === "postgres" && url.pathname !== "/postgres") {
    throw new Error("knowledge_acceptance_postgres_admin_database_required");
  }
  return url;
}

function runId() {
  const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, "").replace("Z", "Z");
  return `${timestamp}-${randomUUID().slice(0, 8)}`.toLowerCase();
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function elapsed(start: number) {
  return performance.now() - start;
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function unavailable(name: string): never {
  throw new Error(`knowledge_acceptance_storage_${name}_not_available`);
}

function memoryStorage(objects: Map<string, Uint8Array>): SourceStorage {
  return {
    async createUploadUrl() {
      return unavailable("create_upload_url");
    },
    async createDownloadUrl() {
      return unavailable("create_download_url");
    },
    async headObject(reference) {
      const body = objects.get(`${reference.key}\u0000${reference.versionId ?? "v1"}`);
      return body
        ? {
            key: reference.key,
            versionId: reference.versionId ?? "v1",
            etag: hash(Buffer.from(body).toString("binary")),
            sizeBytes: body.byteLength,
          }
        : null;
    },
    async readObjectRange(reference, range) {
      const body = objects.get(`${reference.key}\u0000${reference.versionId}`);
      if (!body || range.start < 0 || range.end < range.start || range.end >= body.byteLength) {
        throw new Error("knowledge_acceptance_storage_range_invalid");
      }
      return body.slice(range.start, range.end + 1);
    },
    async copyObjectConditionally() {
      return unavailable("copy");
    },
    async downloadObjectToFile() {
      return unavailable("download");
    },
    async putObject() {
      return unavailable("put");
    },
    async deleteObjectVersion() {
      return unavailable("delete");
    },
  };
}

async function runCleanupSteps(steps: Array<() => Promise<unknown>>) {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "knowledge_acceptance_cleanup_failed");
}

type OperationOutcome<Result> = { ok: true; value: Result } | { ok: false; error: unknown };

async function finishWithCleanup<Result>(input: {
  outcome: OperationOutcome<Result>;
  cleanup: () => Promise<void>;
  aggregateMessage: string;
}): Promise<Result> {
  try {
    await input.cleanup();
  } catch (cleanupError) {
    if (input.outcome.ok) throw cleanupError;
    const cleanupErrors =
      cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError];
    throw new AggregateError([input.outcome.error, ...cleanupErrors], input.aggregateMessage);
  }
  if (!input.outcome.ok) {
    throw input.outcome.error;
  }
  return input.outcome.value;
}

async function createAcceptanceDatabase(adminUrl: URL, name: string) {
  if (!name.startsWith(DATABASE_PREFIX)) throw new Error("knowledge_acceptance_database_prefix");
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`CREATE DATABASE "${name}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${name}`;
  const pool = new Pool({ connectionString: databaseUrl.toString(), max: 10 });
  const db = drizzle({ client: pool, schema });
  try {
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
      migrationsSchema: "drizzle",
      migrationsTable: "migrations",
    });
  } catch (error) {
    try {
      await runCleanupSteps([
        () => pool.end(),
        () => admin.query(`DROP DATABASE "${name}"`),
        () => admin.end(),
      ]);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "knowledge_acceptance_database_initialization_failed",
      );
    }
    throw error;
  }
  return {
    db,
    async close(keepState: boolean) {
      await runCleanupSteps([
        () => pool.end(),
        ...(keepState
          ? []
          : [
              () =>
                admin.query(
                  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
                  [name],
                ),
              () => admin.query(`DROP DATABASE "${name}"`),
            ]),
        () => admin.end(),
      ]);
    },
  };
}

function instrumentProviders(input: {
  embedding: EmbeddingPort;
  exact: ExactRrfPort;
  rerank: RerankPort;
  calls: Record<string, number>;
  timingsMs: Record<string, number>;
  currentTrace: () => QueryTrace | undefined;
}) {
  return {
    embedding: {
      async embed(texts: readonly string[], signal?: AbortSignal) {
        input.calls.embedding = (input.calls.embedding ?? 0) + 1;
        const start = performance.now();
        const output = await input.embedding.embed(texts, signal);
        const duration = elapsed(start);
        input.timingsMs.embedding = (input.timingsMs.embedding ?? 0) + duration;
        const trace = input.currentTrace();
        if (trace) {
          trace.embeddingInput = texts;
          trace.embeddingOutput = output;
          trace.timingsMs.embedding = duration;
        }
        return output;
      },
    } satisfies EmbeddingPort,
    exact: {
      async query(request: Parameters<ExactRrfPort["query"]>[0]) {
        input.calls.exactRrf = (input.calls.exactRrf ?? 0) + 1;
        const start = performance.now();
        const output = await input.exact.query(request);
        const duration = elapsed(start);
        input.timingsMs.exactRrf = (input.timingsMs.exactRrf ?? 0) + duration;
        const trace = input.currentTrace();
        if (trace) {
          trace.exactInput = request;
          trace.exactOutput = output;
          trace.timingsMs.exactRrf = duration;
        }
        return output;
      },
    } satisfies ExactRrfPort,
    rerank: {
      async rerank(request: Parameters<RerankPort["rerank"]>[0]) {
        input.calls.rerank = (input.calls.rerank ?? 0) + 1;
        const start = performance.now();
        const output = await input.rerank.rerank(request);
        const duration = elapsed(start);
        input.timingsMs.rerank = (input.timingsMs.rerank ?? 0) + duration;
        const trace = input.currentTrace();
        if (trace) {
          trace.rerankInput = request;
          trace.rerankOutput = output;
          trace.timingsMs.rerank = duration;
        }
        return output;
      },
    } satisfies RerankPort,
  };
}

async function seedFixture(input: { db: Database; storageObjects: Map<string, Uint8Array> }) {
  const principalId = acceptanceIdentity("principal", "owner");
  const workspaceId = acceptanceIdentity("workspace", "main");
  await input.db.insert(principals).values({
    id: principalId,
    authUserId: "knowledge-acceptance-owner",
    handle: "knowledge-acceptance",
  });
  await input.db.insert(workspaces).values({
    id: workspaceId,
    ownerId: principalId,
    name: "Knowledge Acceptance",
  });
  await input.db.insert(workspaceLocators).values({
    workspaceId,
    ownerId: principalId,
    slug: "knowledge-acceptance",
  });
  const sourceIds = new Map<string, string>();
  const ingestionIds: string[] = [];
  for (const fixtureSource of acceptanceFixtureV1.sources) {
    const sourceId = acceptanceIdentity("source", fixtureSource.id);
    const ingestionId = acceptanceIdentity("ingestion", fixtureSource.id);
    const result = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        kind: "text",
        format: "md",
        content: fixtureSource.content,
      }),
    );
    const resultKey = `acceptance/${acceptanceFixtureV1.version}/${fixtureSource.id}.json`;
    const resultVersion = "v1";
    input.storageObjects.set(`${resultKey}\u0000${resultVersion}`, result);
    await input.db.insert(sources).values({ id: sourceId, workspaceId, kind: "uploaded_file" });
    await input.db.insert(fileSources).values({
      sourceId,
      originalFilename: fixtureSource.filename,
      sizeBytes: Buffer.byteLength(fixtureSource.content, "utf8"),
      storageKey: `acceptance/source/${fixtureSource.filename}`,
      storageVersionId: "v1",
      state: "stored",
    });
    await input.db.insert(sourceIngestions).values({
      id: ingestionId,
      sourceId,
      sourceRevision: 1,
      provider: "native_text",
      state: "ready",
      resultStorageKey: resultKey,
      resultStorageVersionId: resultVersion,
      resultSha256: createHash("sha256").update(result).digest("hex"),
      resultSizeBytes: result.byteLength,
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    sourceIds.set(fixtureSource.id, sourceId);
    ingestionIds.push(ingestionId);
  }
  return { principalId, workspaceId, sourceIds, ingestionIds };
}

function sourceLookup(sourceIds: Map<string, string>) {
  return new Map([...sourceIds].map(([logical, physical]) => [physical, logical]));
}

function mixTraceDense(trace: QueryTrace) {
  const left = trace.embeddingOutput?.[0];
  const right = trace.embeddingOutput?.[1];
  if (!left || !right || left.length !== right.length) {
    throw new Error("knowledge_acceptance_query_embedding_missing");
  }
  return left.map((value, index) => 0.5 * value + 0.5 * (right[index] ?? 0));
}

function rankedWithSources(
  points: readonly OracleRankedPoint[],
  sourceByPoint: Map<string, string>,
) {
  return points.map((point) => ({
    id: point.id,
    sourceId: sourceByPoint.get(point.id) ?? "unknown",
    rank: point.rank,
    score: point.score,
  }));
}

async function corpusInspection(input: { db: Database; sourceIds: Map<string, string> }) {
  const [chunks, blocks, evidence, generations] = await Promise.all([
    input.db.select().from(retrievalChunks),
    input.db.select().from(retrievalRepresentationBlocks),
    input.db.select().from(retrievalEvidenceUnits),
    input.db.select().from(retrievalIndexGenerations),
  ]);
  const physicalToLogical = sourceLookup(input.sourceIds);
  const fixtureById = new Map(acceptanceFixtureV1.sources.map((source) => [source.id, source]));
  let locatorErrors = 0;
  let hashErrors = 0;
  let identityErrors = 0;
  let headingBoundaryViolations = 0;
  let oversizedSplitSources = 0;
  const sourceByPoint = new Map<string, string>();
  for (const generation of generations) {
    const logicalId = physicalToLogical.get(generation.sourceId);
    const fixtureSource = logicalId ? fixtureById.get(logicalId) : undefined;
    if (!logicalId || !fixtureSource)
      throw new Error("knowledge_acceptance_fixture_source_missing");
    const projected = projectMarkdownRepresentation({
      representationId: generation.representationId,
      text: fixtureSource.content,
    });
    const projectedChunkIds = new Set(projected.chunks.map((chunk) => chunk.id));
    const generationChunks = chunks.filter((chunk) => chunk.indexGenerationId === generation.id);
    if (fixtureSource.features.includes("oversized") && projected.chunks.length > 2) {
      oversizedSplitSources += 1;
    }
    for (const chunk of generationChunks) {
      sourceByPoint.set(chunk.id, logicalId);
      if (hash(chunk.exactText) !== chunk.contentHash) hashErrors += 1;
      if (!projectedChunkIds.has(chunk.id)) identityErrors += 1;
      const chunkBlocks = blocks.filter(
        (block) =>
          block.indexGenerationId === generation.id &&
          block.ordinal >= chunk.firstBlockOrdinal &&
          block.ordinal <= chunk.lastBlockOrdinal,
      );
      if (
        chunkBlocks.some(
          (block) => block.headingPath.join("\u001f") !== chunk.headingPath.join("\u001f"),
        )
      ) {
        headingBoundaryViolations += 1;
      }
    }
    const projectedBlockIds = new Set(projected.blocks.map((block) => block.id));
    for (const block of blocks.filter((item) => item.indexGenerationId === generation.id)) {
      const blockLocator = block.locator as { kind?: string; start?: number; end?: number };
      if (
        blockLocator.kind !== "text_range" ||
        blockLocator.start === undefined ||
        blockLocator.end === undefined ||
        fixtureSource.content.slice(blockLocator.start, blockLocator.end) !== block.exactText
      )
        locatorErrors += 1;
      if (
        knowledgeStructuredContentHash({
          content: block.content,
          fidelity: block.fidelity,
          locator: block.locator,
        }) !== block.contentHash
      )
        hashErrors += 1;
      if (!projectedBlockIds.has(block.id)) identityErrors += 1;
    }
    const projectedEvidenceIds = new Set(projected.evidenceUnits.map((unit) => unit.id));
    for (const unit of evidence.filter((item) => item.indexGenerationId === generation.id)) {
      const unitLocator = unit.locator as { kind?: string; start?: number; end?: number };
      if (
        unitLocator.kind !== "text_range" ||
        unitLocator.start === undefined ||
        unitLocator.end === undefined ||
        fixtureSource.content.slice(unitLocator.start, unitLocator.end) !== unit.exactExcerpt
      )
        locatorErrors += 1;
      if (
        knowledgeStructuredContentHash({
          content: unit.content,
          fidelity: unit.fidelity,
          locator: unit.locator,
        }) !== unit.contentHash
      )
        hashErrors += 1;
      if (!projectedEvidenceIds.has(unit.id)) identityErrors += 1;
    }
  }
  const units = chunks.map((chunk) => chunk.capacityUnits);
  return {
    sourceByPoint,
    corpus: {
      sourceCount: acceptanceFixtureV1.sources.length,
      chunkCount: chunks.length,
      evidenceCount: evidence.length,
      minChunkUnits: Math.min(...units),
      maxChunkUnits: Math.max(...units),
      averageChunkUnits: units.reduce((sum, value) => sum + value, 0) / units.length,
      p50ChunkUnits: percentile(units, 0.5),
      p95ChunkUnits: percentile(units, 0.95),
      oversizedSplitSources,
      locatorErrors,
      hashErrors,
      identityErrors,
      headingBoundaryViolations,
    },
  };
}

function baseProviders(mode: AcceptanceMode, stratumindUrl: string, collection: string) {
  if (mode === "offline") {
    return {
      embedding: deterministicEmbeddingPort(),
      rerank: deterministicRerankPort(),
      models: {
        queryPlanning: "agent-tool-input-v1",
        embedding: "deterministic-hash-512-v1",
        sparse: "qdrant/bm25-native-v1",
        rerank: "deterministic-lexical-v1",
      },
      embeddingDimension: 512,
    };
  }
  const environment = knowledgeEnvironment(
    serverEnvironment({
      ...process.env,
      KNOWLEDGE_INDEXING_ENABLED: "true",
      STRATUMIND_COLLECTION: collection,
      STRATUMIND_URL: stratumindUrl,
    }),
  );
  if (!environment.indexingEnabled) throw new Error("knowledge_acceptance_environment_disabled");
  return {
    embedding: createBailianEmbeddingPort({
      apiKey: environment.dashscope.apiKey,
      baseUrl: environment.dashscope.baseUrl,
      model: environment.embedding.model,
      dimension: environment.embedding.dimension,
    }),
    rerank: createBailianRerankPort({
      apiKey: environment.dashscope.apiKey,
      url: environment.rerank.url,
      model: environment.rerank.model,
      timeoutMs: environment.rerank.timeoutMs,
    }),
    models: {
      queryPlanning: "agent-tool-input-v1",
      embedding: environment.embedding.model,
      sparse: "qdrant/bm25-native-v1",
      rerank: environment.rerank.model,
    },
    embeddingDimension: environment.embedding.dimension,
  };
}

export async function runKnowledgeAcceptance(input: {
  mode: AcceptanceMode;
  keepState?: boolean;
  postgresAdminUrl?: string;
  stratumindUrl?: string;
  outputRoot?: string;
}) {
  const id = runId();
  const databaseName = `${DATABASE_PREFIX}${id.replaceAll(/[^a-z0-9]/g, "")}`;
  const collection = `${COLLECTION_PREFIX}${id}`;
  if (!collection.startsWith(COLLECTION_PREFIX))
    throw new Error("knowledge_acceptance_collection_prefix");
  const postgresUrl = assertAcceptanceLoopbackUrl(
    input.postgresAdminUrl ?? process.env.KNOWLEDGE_ACCEPTANCE_POSTGRES_URL ?? DEFAULT_POSTGRES_URL,
    "postgres",
  );
  const stratumindUrl = assertAcceptanceLoopbackUrl(
    input.stratumindUrl ??
      process.env.KNOWLEDGE_ACCEPTANCE_STRATUMIND_URL ??
      DEFAULT_STRATUMIND_URL,
    "stratumind",
  )
    .toString()
    .replace(/\/$/, "");
  const providers = baseProviders(input.mode, stratumindUrl, collection);
  const databaseResource = await createAcceptanceDatabase(postgresUrl, databaseName);
  const qdrant = new QdrantClient({ url: stratumindUrl, checkCompatibility: false });
  let collectionCreated = false;
  let outcome: OperationOutcome<{
    report: AcceptanceReport;
    directory: string;
    databaseName: string;
    collection: string;
  }>;
  try {
    const objects = new Map<string, Uint8Array>();
    const seeded = await seedFixture({ db: databaseResource.db, storageObjects: objects });
    let activeTrace: QueryTrace | undefined;
    const calls: Record<string, number> = { embedding: 0, exactRrf: 0, rerank: 0 };
    const providerTimingsMs: Record<string, number> = {
      embedding: 0,
      exactRrf: 0,
      rerank: 0,
    };
    const exactBase = createStratumindExactRrfPort({ url: stratumindUrl });
    const instrumented = instrumentProviders({
      embedding: providers.embedding,
      exact: exactBase,
      rerank: providers.rerank,
      calls,
      timingsMs: providerTimingsMs,
      currentTrace: () => activeTrace,
    });
    const index = createStratumindIndexPort({ url: stratumindUrl });
    const indexingDependencies = {
      db: databaseResource.db,
      storage: memoryStorage(objects),
      embedding: instrumented.embedding,
      index,
      collection,
      embeddingModel: providers.models.embedding,
      embeddingDimension: providers.embeddingDimension,
      now: () => new Date(),
    };
    for (const ingestionId of seeded.ingestionIds) {
      const generation = await createKnowledgeIndexGeneration(ingestionId, indexingDependencies);
      if (!generation) throw new Error("knowledge_acceptance_generation_missing");
      collectionCreated = true;
      await buildKnowledgeIndexGeneration(generation.generationId, indexingDependencies);
    }
    const inspected = await corpusInspection({
      db: databaseResource.db,
      sourceIds: seeded.sourceIds,
    });
    const queryReports: AcceptanceReport["queries"] = [];
    const store = createKnowledgeStore(databaseResource.db);
    for (const fixtureQuery of acceptanceFixtureV1.queries) {
      const queries: KnowledgeSearchQueries = {
        intentQuery: fixtureQuery.query,
        denseQuery: fixtureQuery.query,
        sparseQuery: fixtureQuery.query,
        rerankQuery: fixtureQuery.query,
      };
      const trace: QueryTrace = { timingsMs: {} };
      activeTrace = trace;
      const totalStart = performance.now();
      const result = await searchWorkspaceKnowledgeWithDependencies(
        {
          actor: { principalId: seeded.principalId, handle: "knowledge-acceptance" },
          workspaceId: seeded.workspaceId,
          query: queries,
        },
        {
          embedding: instrumented.embedding,
          exactRrf: instrumented.exact,
          rerank: instrumented.rerank,
          store,
        },
      );
      trace.timingsMs.total = elapsed(totalStart);
      activeTrace = undefined;
      const exactInput = trace.exactInput;
      const exactOutput = trace.exactOutput;
      if (!exactInput || !exactOutput) throw new Error("knowledge_acceptance_exact_trace_missing");
      const oracleStart = performance.now();
      const oracle = await exhaustiveOracle({
        url: stratumindUrl,
        collection,
        dense: mixTraceDense(trace),
        sparseText: queries.sparseQuery,
        workspaceId: seeded.workspaceId,
        manifestHash: exactInput.manifestHash,
        corpusSize: inspected.corpus.chunkCount,
        k: knowledgeProfileV1.retrieval.wrrfK,
        weights: knowledgeProfileV1.retrieval.weights,
        limit: knowledgeProfileV1.retrieval.candidateLimit,
      });
      trace.timingsMs.oracle = elapsed(oracleStart);
      const oracleIds = oracle.fused.map((point) => point.id);
      const exactIds = exactOutput.points.map((point) => point.id);
      const oracleMatch = JSON.stringify(oracleIds) === JSON.stringify(exactIds);
      const oracleScores = new Map(oracle.fused.map((point) => [point.id, point.score]));
      const exactRanked = exactOutput.points.map((point) => ({
        id: point.id,
        sourceId: inspected.sourceByPoint.get(point.id) ?? "unknown",
        rank: point.rank,
        score: oracleScores.get(point.id) ?? null,
      }));
      const retrievalRankById = new Map(exactOutput.points.map((point) => [point.id, point.rank]));
      const preRerank = (trace.rerankInput?.documents ?? []).map((document) => {
        const retrievalRank = retrievalRankById.get(document.id);
        if (retrievalRank === undefined)
          throw new Error("knowledge_acceptance_rerank_input_identity");
        return { id: document.id, retrievalRank, contextView: document.text };
      });
      const reranked = result.candidates.map((candidate) => ({
        id: candidate.chunkId,
        sourceId: sourceLookup(seeded.sourceIds).get(candidate.sourceId) ?? "unknown",
        rank: candidate.rank,
        retrievalRank: candidate.retrievalRank,
        score: candidate.rerankScore,
        contextView: candidate.contextView,
      }));
      const evidence = result.evidence.map((unit) => {
        if (unit.locator.kind !== "text_range") {
          throw new Error("knowledge_acceptance_fixture_locator_kind");
        }
        return {
          id: unit.id,
          sourceId: sourceLookup(seeded.sourceIds).get(unit.sourceId) ?? "unknown",
          excerpt: unit.exactExcerpt ?? "",
          start: unit.locator.start,
          end: unit.locator.end,
        };
      });
      const exactSources = new Set(exactRanked.map((point) => point.sourceId));
      const expectedFound = fixtureQuery.expectedSourceIds.filter((sourceId) =>
        exactSources.has(sourceId),
      );
      const expectedRank = reranked.find((candidate) =>
        fixtureQuery.expectedSourceIds.includes(candidate.sourceId),
      )?.rank;
      queryReports.push({
        id: fixtureQuery.id,
        intent: fixtureQuery.intent,
        query: fixtureQuery.query,
        expectedSourceIds: fixtureQuery.expectedSourceIds,
        expectedEvidenceAny: fixtureQuery.expectedEvidenceAny,
        negativeSourceIds: fixtureQuery.negativeSourceIds,
        plannedQueries: queries,
        status: result.status,
        degradedReasons: result.degradedReasons,
        timingsMs: trace.timingsMs,
        exactRequest: {
          collection: exactInput.collection,
          dense: exactInput.dense,
          sparseText: exactInput.sparseText,
          manifestHash: exactInput.manifestHash,
          workspaceIds: exactInput.workspaceIds,
          k: exactInput.k,
          weights: exactInput.weights,
          limit: exactInput.limit,
        },
        dense: rankedWithSources(oracle.dense, inspected.sourceByPoint),
        sparse: rankedWithSources(oracle.sparse, inspected.sourceByPoint),
        exhaustiveWrrf: rankedWithSources(oracle.fused, inspected.sourceByPoint),
        exactRrf: exactRanked,
        preRerank,
        reranked,
        evidence,
        packing: {
          evidenceUnits: evidence.length,
          capacityUnits: evidence.reduce((sum, unit) => sum + countCapacityUnits(unit.excerpt), 0),
          maxEvidenceUnits: knowledgeProfileV1.packing.maxEvidenceUnits,
          maxCapacityUnits: knowledgeProfileV1.packing.maxUnits,
        },
        metrics: {
          sourceRecallAt20: expectedFound.length / fixtureQuery.expectedSourceIds.length,
          hitAt10: expectedRank !== undefined,
          reciprocalRank: expectedRank ? 1 / expectedRank : 0,
          evidenceHit: fixtureQuery.expectedEvidenceAny.some((expected) =>
            evidence.some((unit) => unit.excerpt.includes(expected)),
          ),
          negativeHitAt10: reranked.some((candidate) =>
            fixtureQuery.negativeSourceIds.includes(candidate.sourceId),
          ),
          oracleMatch,
        },
        guarantee: result.guarantee,
        ...(exactOutput.execution === undefined ? {} : { execution: exactOutput.execution }),
      });
    }
    const count = queryReports.length;
    const invariantErrors =
      inspected.corpus.locatorErrors +
      inspected.corpus.hashErrors +
      inspected.corpus.identityErrors +
      inspected.corpus.headingBoundaryViolations;
    const aggregate = {
      queryCount: count,
      sourceRecallAt20:
        queryReports.reduce((sum, query) => sum + query.metrics.sourceRecallAt20, 0) / count,
      hitAt10: queryReports.filter((query) => query.metrics.hitAt10).length / count,
      meanReciprocalRank:
        queryReports.reduce((sum, query) => sum + query.metrics.reciprocalRank, 0) / count,
      evidenceHitRate: queryReports.filter((query) => query.metrics.evidenceHit).length / count,
      negativeHitAt10Rate:
        queryReports.filter((query) => query.metrics.negativeHitAt10).length / count,
      exactMismatchCount: queryReports.filter((query) => !query.metrics.oracleMatch).length,
      degradedCount: queryReports.filter((query) => query.status === "degraded").length,
      hardGatePassed: false,
    };
    aggregate.hardGatePassed =
      invariantErrors === 0 &&
      aggregate.exactMismatchCount === 0 &&
      aggregate.degradedCount === 0 &&
      (input.mode === "live" ||
        (aggregate.sourceRecallAt20 === 1 &&
          aggregate.hitAt10 === 1 &&
          aggregate.evidenceHitRate === 1));
    const report = acceptanceReportSchema.parse({
      schemaVersion: 1,
      runId: id,
      mode: input.mode,
      createdAt: new Date().toISOString(),
      gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      fixtureVersion: acceptanceFixtureV1.version,
      corpusHash: acceptanceCorpusHash(),
      profile: {
        chunkMaxUnits: knowledgeProfileV1.chunk.maxUnits,
        chunkOverlap: knowledgeProfileV1.chunk.overlap,
        candidateLimit: knowledgeProfileV1.retrieval.candidateLimit,
        outputLimit: knowledgeProfileV1.retrieval.outputLimit,
        wrrfK: knowledgeProfileV1.retrieval.wrrfK,
        weights: knowledgeProfileV1.retrieval.weights,
      },
      models: providers.models,
      corpus: inspected.corpus,
      providerCalls: calls,
      providerTimingsMs,
      aggregate,
      queries: queryReports,
    });
    const directory = await writeAcceptanceReport({
      report,
      outputRoot: input.outputRoot ?? path.resolve("test-results/knowledge-acceptance"),
    });
    if (!report.aggregate.hardGatePassed) {
      throw new Error(`knowledge_acceptance_gate_failed:${directory}`);
    }
    outcome = { ok: true, value: { report, directory, databaseName, collection } };
  } catch (error) {
    outcome = { ok: false, error };
  }
  return finishWithCleanup({
    outcome,
    cleanup: () =>
      runCleanupSteps([
        async () => {
          if (!input.keepState && collectionCreated) await qdrant.deleteCollection(collection);
        },
        () => databaseResource.close(input.keepState ?? false),
      ]),
    aggregateMessage: "knowledge_acceptance_operation_and_cleanup_failed",
  });
}

export async function runSingleDocumentKnowledgeSmoke(input: {
  content?: string;
  expectedEvidence: string;
  filename: string;
  mode: AcceptanceMode;
  postgresAdminUrl?: string;
  provider?: "media_understanding" | "mineru" | "native_text";
  query: string;
  resultBytes?: Uint8Array;
  sourceSizeBytes?: number;
  stratumindUrl?: string;
}) {
  if (!input.resultBytes && !input.content?.includes(input.expectedEvidence)) {
    throw new Error("knowledge_document_smoke_expected_evidence_missing_from_source");
  }
  const id = runId();
  const databaseName = `${DATABASE_PREFIX}document${id.replaceAll(/[^a-z0-9]/g, "")}`;
  const collection = `${COLLECTION_PREFIX}document-${id}`;
  const postgresUrl = assertAcceptanceLoopbackUrl(
    input.postgresAdminUrl ?? process.env.KNOWLEDGE_ACCEPTANCE_POSTGRES_URL ?? DEFAULT_POSTGRES_URL,
    "postgres",
  );
  const stratumindUrl = assertAcceptanceLoopbackUrl(
    input.stratumindUrl ??
      process.env.KNOWLEDGE_ACCEPTANCE_STRATUMIND_URL ??
      DEFAULT_STRATUMIND_URL,
    "stratumind",
  )
    .toString()
    .replace(/\/$/, "");
  const providers = baseProviders(input.mode, stratumindUrl, collection);
  const databaseResource = await createAcceptanceDatabase(postgresUrl, databaseName);
  const qdrant = new QdrantClient({ url: stratumindUrl, checkCompatibility: false });
  let collectionCreated = false;
  let outcome: OperationOutcome<{
    candidateCount: number;
    evidenceCount: number;
    matchedEvidence: {
      id: string;
      sourceName?: string;
      excerpt: string;
      locator: Awaited<
        ReturnType<typeof searchWorkspaceKnowledgeWithDependencies>
      >["evidence"][number]["locator"];
      contentHash: string;
    };
    guarantee: Awaited<ReturnType<typeof searchWorkspaceKnowledgeWithDependencies>>["guarantee"];
  }>;
  try {
    const principalId = randomUUID();
    const workspaceId = randomUUID();
    const sourceId = randomUUID();
    const ingestionId = randomUUID();
    const resultBytes =
      input.resultBytes ??
      new TextEncoder().encode(
        JSON.stringify({ schemaVersion: 1, kind: "text", format: "md", content: input.content }),
      );
    const resultKey = `acceptance/document/${id}.json`;
    const objects = new Map([[`${resultKey}\u0000v1`, resultBytes]]);
    await databaseResource.db.insert(principals).values({
      id: principalId,
      authUserId: randomUUID(),
      handle: "knowledge-document",
    });
    await databaseResource.db.insert(workspaces).values({
      id: workspaceId,
      ownerId: principalId,
      name: "Knowledge document smoke",
    });
    await databaseResource.db.insert(sources).values({
      id: sourceId,
      workspaceId,
      kind: "uploaded_file",
    });
    await databaseResource.db.insert(fileSources).values({
      sourceId,
      originalFilename: input.filename,
      sizeBytes: input.sourceSizeBytes ?? Buffer.byteLength(input.content ?? "", "utf8"),
      storageKey: `acceptance/document/${input.filename}`,
      storageVersionId: "v1",
      state: "stored",
    });
    const provider = input.provider ?? (input.resultBytes ? "mineru" : "native_text");
    if (provider !== "native_text" && !input.resultBytes) {
      throw new Error("knowledge_document_smoke_provider_result_missing");
    }
    await databaseResource.db.insert(sourceIngestions).values({
      id: ingestionId,
      sourceId,
      sourceRevision: 1,
      provider,
      ...(provider === "mineru"
        ? {
            providerBatchId: `acceptance-${id}`,
            providerSubmissionStartedAt: new Date(),
          }
        : {}),
      state: "ready",
      resultStorageKey: resultKey,
      resultStorageVersionId: "v1",
      resultSha256: createHash("sha256").update(resultBytes).digest("hex"),
      resultSizeBytes: resultBytes.byteLength,
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    const index = createStratumindIndexPort({ url: stratumindUrl });
    const indexingDependencies = {
      db: databaseResource.db,
      storage: memoryStorage(objects),
      embedding: providers.embedding,
      index,
      collection,
      embeddingModel: providers.models.embedding,
      embeddingDimension: providers.embeddingDimension,
      now: () => new Date(),
    };
    const generation = await createKnowledgeIndexGeneration(ingestionId, indexingDependencies);
    if (!generation) throw new Error("knowledge_document_smoke_generation_missing");
    collectionCreated = true;
    await buildKnowledgeIndexGeneration(generation.generationId, indexingDependencies);
    const result = await searchWorkspaceKnowledgeWithDependencies(
      {
        actor: { principalId, handle: "knowledge-document" },
        workspaceId,
        query: {
          intentQuery: input.query,
          denseQuery: input.query,
          sparseQuery: input.query,
          rerankQuery: input.query,
        },
      },
      {
        embedding: providers.embedding,
        exactRrf: createStratumindExactRrfPort({ url: stratumindUrl }),
        rerank: providers.rerank,
        store: createKnowledgeStore(databaseResource.db),
      },
    );
    if (result.status !== "ok") throw new Error("knowledge_document_smoke_degraded");
    const matched = result.evidence.find((unit) =>
      unit.exactExcerpt?.includes(input.expectedEvidence),
    );
    if (!matched) throw new Error("knowledge_document_smoke_evidence_not_retrieved");
    outcome = {
      ok: true,
      value: {
        candidateCount: result.candidates.length,
        evidenceCount: result.evidence.length,
        matchedEvidence: {
          id: matched.id,
          ...(matched.sourceName ? { sourceName: matched.sourceName } : {}),
          excerpt: matched.exactExcerpt ?? "",
          locator: matched.locator,
          contentHash: matched.contentHash,
        },
        guarantee: result.guarantee,
      },
    };
  } catch (error) {
    outcome = { ok: false, error };
  }
  return finishWithCleanup({
    outcome,
    cleanup: () =>
      runCleanupSteps([
        async () => {
          if (collectionCreated) await qdrant.deleteCollection(collection);
        },
        () => databaseResource.close(false),
      ]),
    aggregateMessage: "knowledge_document_smoke_operation_and_cleanup_failed",
  });
}
