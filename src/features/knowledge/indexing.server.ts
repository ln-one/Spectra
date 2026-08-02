import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lte, ne } from "drizzle-orm";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import {
  artifactRevisions,
  artifactSources,
  artifacts,
  fileSources,
  retrievalChunks,
  retrievalEvidenceUnits,
  retrievalIndexGenerations,
  retrievalRepresentationBlocks,
  sourceIngestions,
  sources,
} from "@/database/schema";
import { loadArtifactSourceProjection } from "@/features/artifacts/artifact-source-projection.server";
import type { ArtifactRenderStorage } from "@/features/artifacts/render-storage.server";
import { isArtifactSourceKind } from "@/features/artifacts/types";
import { createS3SourceStorage } from "@/features/sources/s3-storage";
import type { SourceStorage } from "@/features/sources/storage";
import { sourceFileExtension, sourceRetrievalPolicyManifest } from "@/features/sources/validation";
import { createBailianEmbeddingPort } from "./bailian";
import { knowledgeEnvironment } from "./config";
import { createStratumindIndexPort, type KnowledgeIndexPort } from "./index-writer";
import type { EmbeddingPort } from "./ports";
import { knowledgeProfileV3 } from "./profile";
import { type ProjectableBlock, projectRepresentation } from "./projection";
import { canonicalSourceRepresentation } from "./source-result";
import {
  normalizeKnowledgeVisualImage,
  readKnowledgeVisualArchiveEntry,
} from "./visual-assets.server";
import {
  createVisualDescriptionPort,
  type VisualDescriptionPort,
  visualDescriptionGenerationProfile,
} from "./visual-description.server";

function ingestionProvider(value: string) {
  if (value === "native_text" || value === "media_understanding" || value === "mineru")
    return value;
  throw new Error("knowledge_ingestion_provider_invalid");
}

export type KnowledgeIndexingDependencies = {
  artifactStorage?: ArtifactRenderStorage;
  db: Database;
  storage: SourceStorage;
  embedding: EmbeddingPort;
  index: KnowledgeIndexPort;
  collection: string;
  embeddingModel: string;
  embeddingDimension: number;
  visualDescriptionModel?: string;
  visualDescription?: VisualDescriptionPort;
  now: () => Date;
};

const KNOWLEDGE_OBSOLETE_GENERATION_RETENTION_MS = 24 * 60 * 60 * 1_000;
const KNOWLEDGE_GC_BATCH_SIZE = 100;
const KNOWLEDGE_INDEX_MAX_ATTEMPTS = 5;
const KNOWLEDGE_INDEX_RETRY_BASE_MS = 60_000;
const KNOWLEDGE_INDEX_RETRY_MAX_MS = 60 * 60 * 1_000;
const MAX_VISUAL_DESCRIPTION_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_VISUAL_DESCRIPTION_COUNT = 12;
const MAX_VISUAL_DESCRIPTION_TOTAL_BYTES = 24 * 1024 * 1024;

const PERMANENT_VISUAL_DESCRIPTION_ERRORS = new Set([
  "knowledge_visual_archive_entry_invalid",
  "knowledge_visual_archive_entry_missing",
  "knowledge_visual_archive_path_invalid",
  "knowledge_visual_asset_missing",
  "knowledge_visual_image_invalid",
  "knowledge_visual_image_too_large",
  "knowledge_visual_source_unavailable",
]);

function isPermanentVisualDescriptionError(error: unknown) {
  return error instanceof Error && PERMANENT_VISUAL_DESCRIPTION_ERRORS.has(error.message);
}

const PERMANENT_INDEXING_ERROR_PREFIXES = [
  "knowledge_adapter_",
  "knowledge_artifact_",
  "knowledge_collection_profile_mismatch",
  "knowledge_embedding_invalid",
  "knowledge_embedding_shape",
  "knowledge_ingestion_not_ready",
  "knowledge_ingestion_provider_invalid",
  "knowledge_mineru_",
  "knowledge_projection_empty",
  "knowledge_source_format_invalid",
  "knowledge_source_provider_mismatch",
  "knowledge_source_result_",
  "presentation_",
  "source_format_capability_unavailable",
] as const;

async function fillMissingVisualDescriptions(input: {
  archive: Uint8Array;
  blocks: ProjectableBlock[];
  description?: VisualDescriptionPort | undefined;
  file: typeof fileSources.$inferSelect | null;
  storage: SourceStorage;
}) {
  if (!input.description) return { blocks: input.blocks, degradedCount: 0 };
  const described: ProjectableBlock[] = [];
  let describedCount = 0;
  let describedBytes = 0;
  let degradedCount = 0;
  for (const block of input.blocks) {
    if (
      block.kind !== "visual" ||
      block.exactText !== null ||
      block.indexText !== null ||
      block.content?.kind !== "visual_region"
    ) {
      described.push(block);
      continue;
    }
    try {
      if (
        describedCount >= MAX_VISUAL_DESCRIPTION_COUNT ||
        describedBytes >= MAX_VISUAL_DESCRIPTION_TOTAL_BYTES
      ) {
        degradedCount += 1;
        described.push(block);
        continue;
      }
      const asset = block.content.asset;
      if (!asset) throw new Error("knowledge_visual_asset_missing");
      const raw =
        asset.kind === "source_original"
          ? await readOriginalVisual(input.file, input.storage)
          : await readKnowledgeVisualArchiveEntry(input.archive, asset.path);
      const image = await normalizeKnowledgeVisualImage(raw);
      if (describedBytes + image.bytes.byteLength > MAX_VISUAL_DESCRIPTION_TOTAL_BYTES) {
        degradedCount += 1;
        described.push(block);
        continue;
      }
      describedCount += 1;
      describedBytes += image.bytes.byteLength;
      const text = await input.description.describe({
        ...image,
        abortSignal: AbortSignal.timeout(visualDescriptionGenerationProfile.timeoutMs),
      });
      described.push({
        ...block,
        exactText: text,
        indexText: text,
        content: { ...block.content, accessibleDescription: text },
        fidelity: "model-description",
      });
    } catch (error) {
      if (isPermanentVisualDescriptionError(error)) {
        // A malformed or unavailable visual must not discard surrounding readable content.
        degradedCount += 1;
        described.push(block);
        continue;
      }
      throw error;
    }
  }
  return { blocks: described, degradedCount };
}

function withVisualDescriptionMetadata(
  metadata: Record<string, unknown> | null,
  degradedCount: number,
) {
  if (degradedCount === 0) return metadata;
  return {
    ...(metadata ?? {}),
    visualDescription: { degradedCount, state: "degraded" },
  };
}

async function readOriginalVisual(
  file: typeof fileSources.$inferSelect | null,
  storage: SourceStorage,
) {
  if (
    file?.state !== "stored" ||
    !file.storageKey ||
    !file.storageVersionId ||
    file.sizeBytes <= 0 ||
    file.sizeBytes > MAX_VISUAL_DESCRIPTION_INPUT_BYTES
  ) {
    throw new Error("knowledge_visual_source_unavailable");
  }
  return storage.readObjectRange(
    { key: file.storageKey, versionId: file.storageVersionId },
    { start: 0, end: file.sizeBytes - 1 },
  );
}

function indexingFailure(error: unknown, attempt: number, now: Date) {
  const message = error instanceof Error ? error.message : String(error);
  const permanent =
    error instanceof Error &&
    (error.name === "ZodError" ||
      PERMANENT_INDEXING_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix)));
  if (permanent || attempt >= KNOWLEDGE_INDEX_MAX_ATTEMPTS) {
    return {
      failureCode: permanent ? "knowledge_indexing_permanent" : "knowledge_indexing_exhausted",
      nextRetryAt: null,
    };
  }
  const delay = Math.min(
    KNOWLEDGE_INDEX_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1),
    KNOWLEDGE_INDEX_RETRY_MAX_MS,
  );
  return {
    failureCode: "knowledge_indexing_retryable",
    nextRetryAt: new Date(now.getTime() + delay),
  };
}

function manifestHash(input: {
  collection: string;
  embeddingModel: string;
  embeddingDimension: number;
  visualDescriptionModel?: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        profile: knowledgeProfileV3,
        projectionSchema: "knowledge-representation-v4",
        sparse: "qdrant/bm25-native-v1",
        collection: input.collection,
        embeddingModel: input.embeddingModel,
        embeddingDimension: input.embeddingDimension,
        visualDescription: {
          model: input.visualDescriptionModel ?? "qwen3.7-plus",
          ...visualDescriptionGenerationProfile,
        },
      }),
    )
    .digest("hex");
}

type KnowledgeIndexGenerationConfig = Pick<
  KnowledgeIndexingDependencies,
  "collection" | "embeddingModel" | "embeddingDimension" | "visualDescriptionModel" | "now"
>;

export function knowledgeIndexGenerationConfig(): KnowledgeIndexGenerationConfig | null {
  const environment = knowledgeEnvironment();
  if (!environment.indexingEnabled) return null;
  return {
    collection: environment.stratumind.collection,
    embeddingModel: environment.embedding.model,
    embeddingDimension: environment.embedding.dimension,
    visualDescriptionModel: environment.visualDescription.model,
    now: () => new Date(),
  };
}

export function defaultKnowledgeIndexingDependencies(): KnowledgeIndexingDependencies {
  const environment = knowledgeEnvironment();
  if (!environment.indexingEnabled) throw new Error("knowledge_indexing_disabled");
  return {
    db: database,
    storage: createS3SourceStorage(),
    embedding: createBailianEmbeddingPort({
      apiKey: environment.dashscope.apiKey,
      baseUrl: environment.dashscope.baseUrl,
      model: environment.embedding.model,
      dimension: environment.embedding.dimension,
    }),
    index: createStratumindIndexPort({
      url: environment.stratumind.url,
      ...(environment.stratumind.apiKey ? { apiKey: environment.stratumind.apiKey } : {}),
    }),
    collection: environment.stratumind.collection,
    embeddingModel: environment.embedding.model,
    embeddingDimension: environment.embedding.dimension,
    visualDescriptionModel: environment.visualDescription.model,
    visualDescription: createVisualDescriptionPort({ model: environment.visualDescription.model }),
    now: () => new Date(),
  };
}

export async function createKnowledgeIndexGeneration(
  ingestionId: string,
  dependencies: Pick<
    KnowledgeIndexingDependencies,
    "db" | "collection" | "embeddingModel" | "embeddingDimension" | "visualDescriptionModel" | "now"
  >,
) {
  return dependencies.db.transaction(async (transaction) => {
    const [work] = await transaction
      .select({
        ingestion: sourceIngestions,
        source: sources,
        originalFilename: fileSources.originalFilename,
      })
      .from(sourceIngestions)
      .innerJoin(sources, eq(sourceIngestions.sourceId, sources.id))
      .innerJoin(fileSources, eq(sourceIngestions.sourceId, fileSources.sourceId))
      .where(eq(sourceIngestions.id, ingestionId))
      .for("update", { of: [sourceIngestions] })
      .limit(1);
    if (work?.ingestion.state !== "ready" || work.source.deletedAt) return null;
    const format = sourceFileExtension(work.originalFilename);
    if (!format) throw new Error("knowledge_source_format_invalid");
    const manifest = manifestHash(dependencies);
    const sourcePolicyHash = createHash("sha256")
      .update(JSON.stringify(sourceRetrievalPolicyManifest(format)))
      .digest("hex");
    const [existing] = await transaction
      .select({
        id: retrievalIndexGenerations.id,
        workflowId: retrievalIndexGenerations.workflowId,
        state: retrievalIndexGenerations.state,
        retryCount: retrievalIndexGenerations.retryCount,
        nextRetryAt: retrievalIndexGenerations.nextRetryAt,
      })
      .from(retrievalIndexGenerations)
      .where(
        and(
          eq(retrievalIndexGenerations.sourceIngestionId, ingestionId),
          eq(retrievalIndexGenerations.manifestHash, manifest),
          eq(retrievalIndexGenerations.sourcePolicyHash, sourcePolicyHash),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.state === "ready" || existing.state === "obsolete") return null;
      if (existing.state !== "failed") {
        return { generationId: existing.id, workflowId: existing.workflowId };
      }
      const now = dependencies.now();
      if (
        existing.retryCount >= KNOWLEDGE_INDEX_MAX_ATTEMPTS ||
        !existing.nextRetryAt ||
        existing.nextRetryAt > now
      ) {
        return null;
      }
      const workflowId = randomUUID();
      await transaction
        .update(retrievalIndexGenerations)
        .set({
          workflowId,
          state: "queued",
          failureCode: null,
          nextRetryAt: null,
          updatedAt: now,
        })
        .where(eq(retrievalIndexGenerations.id, existing.id));
      return { generationId: existing.id, workflowId };
    }
    const id = randomUUID();
    await transaction.insert(retrievalIndexGenerations).values({
      id,
      sourceId: work.source.id,
      workspaceId: work.source.workspaceId,
      sourceIngestionId: ingestionId,
      sourceRevision: work.ingestion.sourceRevision,
      sourceRevisionId: `${work.source.id}:${work.ingestion.sourceRevision}`,
      representationId: `${work.source.id}:${work.ingestion.resultSha256}`,
      collectionName: dependencies.collection,
      embeddingModelId: dependencies.embeddingModel,
      embeddingDimension: dependencies.embeddingDimension,
      chunkProfileId: knowledgeProfileV3.id,
      sparseProfileId: "qdrant/bm25-native-v1",
      manifestHash: manifest,
      sourcePolicyHash,
      workflowId: id,
      state: "queued",
      createdAt: dependencies.now(),
      updatedAt: dependencies.now(),
    });
    return { generationId: id, workflowId: id };
  });
}

export async function stageArtifactKnowledgeIndexGeneration(
  transaction: DatabaseTransaction,
  input: { artifactRevisionId: string; sourceId: string },
  dependencies: KnowledgeIndexGenerationConfig,
) {
  const [work] = await transaction
    .select({
      artifact: artifacts,
      revision: artifactRevisions,
      source: sources,
    })
    .from(artifactRevisions)
    .innerJoin(artifacts, eq(artifactRevisions.artifactId, artifacts.id))
    .innerJoin(artifactSources, eq(artifactSources.artifactId, artifacts.id))
    .innerJoin(sources, eq(artifactSources.sourceId, sources.id))
    .where(
      and(
        eq(artifactRevisions.id, input.artifactRevisionId),
        eq(artifactSources.sourceId, input.sourceId),
      ),
    )
    .limit(1);
  if (
    !work ||
    !isArtifactSourceKind(work.artifact.kind) ||
    work.artifact.deletedAt ||
    work.source.deletedAt
  ) {
    return null;
  }
  const manifest = manifestHash(dependencies);
  const artifactFormat = work.artifact.kind === "teaching_document" ? "md" : "json";
  const sourcePolicyHash = createHash("sha256")
    .update(JSON.stringify(sourceRetrievalPolicyManifest(artifactFormat)))
    .digest("hex");
  const [existing] = await transaction
    .select({
      id: retrievalIndexGenerations.id,
      workflowId: retrievalIndexGenerations.workflowId,
      state: retrievalIndexGenerations.state,
      retryCount: retrievalIndexGenerations.retryCount,
      nextRetryAt: retrievalIndexGenerations.nextRetryAt,
    })
    .from(retrievalIndexGenerations)
    .where(
      and(
        eq(retrievalIndexGenerations.sourceId, work.source.id),
        eq(retrievalIndexGenerations.artifactRevisionId, work.revision.id),
        eq(retrievalIndexGenerations.manifestHash, manifest),
        eq(retrievalIndexGenerations.sourcePolicyHash, sourcePolicyHash),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.state === "queued") {
      return { generationId: existing.id, workflowId: existing.workflowId };
    }
    if (existing.state !== "failed") return null;
    const now = dependencies.now();
    if (
      existing.retryCount >= KNOWLEDGE_INDEX_MAX_ATTEMPTS ||
      !existing.nextRetryAt ||
      existing.nextRetryAt > now
    ) {
      return null;
    }
    const workflowId = randomUUID();
    await transaction
      .update(retrievalIndexGenerations)
      .set({
        workflowId,
        state: "queued",
        failureCode: null,
        nextRetryAt: null,
        updatedAt: now,
      })
      .where(eq(retrievalIndexGenerations.id, existing.id));
    return { generationId: existing.id, workflowId };
  }
  const id = randomUUID();
  const now = dependencies.now();
  await transaction.insert(retrievalIndexGenerations).values({
    id,
    sourceId: work.source.id,
    workspaceId: work.source.workspaceId,
    artifactRevisionId: work.revision.id,
    sourceRevision: work.revision.revisionNumber,
    sourceRevisionId: work.revision.id,
    representationId:
      work.artifact.kind === "presentation"
        ? `${work.source.id}:${work.revision.id}`
        : `${work.source.id}:${work.revision.contentSha256}`,
    collectionName: dependencies.collection,
    embeddingModelId: dependencies.embeddingModel,
    embeddingDimension: dependencies.embeddingDimension,
    chunkProfileId: knowledgeProfileV3.id,
    sparseProfileId: "qdrant/bm25-native-v1",
    manifestHash: manifest,
    sourcePolicyHash,
    workflowId: id,
    state: "queued",
    createdAt: now,
    updatedAt: now,
  });
  return { generationId: id, workflowId: id };
}

type KnowledgeIndexBuildOutcome =
  | { reason: "generation_unavailable" | "retry_not_due"; status: "skipped" }
  | { reason: "artifact_superseded" | "source_unavailable"; status: "obsolete" }
  | { status: "completed" };

export async function buildKnowledgeIndexGeneration(
  generationId: string,
  dependencies: KnowledgeIndexingDependencies = defaultKnowledgeIndexingDependencies(),
): Promise<KnowledgeIndexBuildOutcome> {
  const [work] = await dependencies.db
    .select({
      generation: retrievalIndexGenerations,
      ingestion: sourceIngestions,
      file: fileSources,
      artifact: artifacts,
      artifactRevision: artifactRevisions,
      source: sources,
    })
    .from(retrievalIndexGenerations)
    .innerJoin(sources, eq(retrievalIndexGenerations.sourceId, sources.id))
    .leftJoin(
      sourceIngestions,
      eq(retrievalIndexGenerations.sourceIngestionId, sourceIngestions.id),
    )
    .leftJoin(fileSources, eq(retrievalIndexGenerations.sourceId, fileSources.sourceId))
    .leftJoin(
      artifactRevisions,
      eq(retrievalIndexGenerations.artifactRevisionId, artifactRevisions.id),
    )
    .leftJoin(artifacts, eq(artifactRevisions.artifactId, artifacts.id))
    .where(eq(retrievalIndexGenerations.id, generationId))
    .limit(1);
  if (!work) return { reason: "generation_unavailable", status: "skipped" };
  if (work.source.deletedAt) return { reason: "source_unavailable", status: "obsolete" };
  if (work.generation.state === "obsolete") {
    return { reason: "artifact_superseded", status: "obsolete" };
  }
  if (work.generation.state === "ready") {
    await dependencies.index.publish({
      collection: work.generation.collectionName,
      generationId,
    });
    return { status: "completed" };
  }
  if (
    work.generation.state === "failed" &&
    (work.generation.retryCount >= KNOWLEDGE_INDEX_MAX_ATTEMPTS ||
      !work.generation.nextRetryAt ||
      work.generation.nextRetryAt > dependencies.now())
  ) {
    return { reason: "retry_not_due", status: "skipped" };
  }
  try {
    await dependencies.db
      .update(retrievalIndexGenerations)
      .set({ state: "projecting", failureCode: null, updatedAt: dependencies.now() })
      .where(eq(retrievalIndexGenerations.id, generationId));
    let blocks: ProjectableBlock[];
    let representationFamily: string;
    let representationAdapterId: string;
    let representationAdapterVersion: string;
    let representationHash: string;
    let representationMetadata: Record<string, unknown> | null;
    if (work.artifactRevision && work.artifact) {
      if (
        !isArtifactSourceKind(work.artifact.kind) ||
        work.artifact.deletedAt ||
        work.artifactRevision.artifactId !== work.artifact.id
      ) {
        throw new Error("knowledge_artifact_revision_invalid");
      }
      const artifactProjection = await loadArtifactSourceProjection(
        {
          artifact: work.artifact,
          revision: work.artifactRevision,
        },
        {
          db: dependencies.db,
          ...(dependencies.artifactStorage ? { storage: dependencies.artifactStorage } : {}),
        },
      );
      blocks = artifactProjection.blocks;
      representationFamily = "artifact";
      representationAdapterId = artifactProjection.representationAdapterId;
      representationAdapterVersion = artifactProjection.representationAdapterVersion;
      representationHash = artifactProjection.representationHash;
      representationMetadata = artifactProjection.representationMetadata;
    } else {
      if (
        work.ingestion?.state !== "ready" ||
        !work.ingestion.resultStorageKey ||
        !work.ingestion.resultStorageVersionId ||
        !work.ingestion.resultSizeBytes ||
        !work.file?.originalFilename
      ) {
        throw new Error("knowledge_ingestion_not_ready");
      }
      const bytes = await dependencies.storage.readObjectRange(
        { key: work.ingestion.resultStorageKey, versionId: work.ingestion.resultStorageVersionId },
        { start: 0, end: work.ingestion.resultSizeBytes - 1 },
      );
      const sourceFormat = sourceFileExtension(work.file.originalFilename);
      if (!sourceFormat) throw new Error("knowledge_source_format_invalid");
      const representation = await canonicalSourceRepresentation({
        provider: ingestionProvider(work.ingestion.provider),
        format: sourceFormat,
        bytes,
      });
      const visualDescriptions = await fillMissingVisualDescriptions({
        archive: bytes,
        blocks: representation.blocks,
        description: dependencies.visualDescription,
        file: work.file,
        storage: dependencies.storage,
      });
      blocks = visualDescriptions.blocks;
      representationFamily = representation.family;
      representationAdapterId = representation.adapterId;
      representationAdapterVersion = representation.adapterVersion;
      representationHash = representation.contentHash;
      representationMetadata = withVisualDescriptionMetadata(
        representation.metadata ?? null,
        visualDescriptions.degradedCount,
      );
    }
    const projection = projectRepresentation({
      representationId: work.generation.representationId,
      blocks,
      profile: knowledgeProfileV3,
    });
    if (projection.chunks.length === 0) throw new Error("knowledge_projection_empty");
    const dense: number[][] = [];
    for (let offset = 0; offset < projection.chunks.length; offset += 10) {
      dense.push(
        ...(await dependencies.embedding.embed(
          projection.chunks.slice(offset, offset + 10).map((chunk) => chunk.indexText),
        )),
      );
    }
    if (dense.length !== projection.chunks.length) throw new Error("knowledge_embedding_shape");
    if (
      dense.some(
        (vector) =>
          vector.length !== work.generation.embeddingDimension ||
          vector.some((value) => !Number.isFinite(value)),
      )
    ) {
      throw new Error("knowledge_embedding_invalid");
    }
    await dependencies.db.transaction(async (transaction) => {
      await transaction
        .delete(retrievalEvidenceUnits)
        .where(eq(retrievalEvidenceUnits.indexGenerationId, generationId));
      await transaction
        .delete(retrievalChunks)
        .where(eq(retrievalChunks.indexGenerationId, generationId));
      await transaction
        .delete(retrievalRepresentationBlocks)
        .where(eq(retrievalRepresentationBlocks.indexGenerationId, generationId));
      await transaction.insert(retrievalRepresentationBlocks).values(
        projection.blocks.map((block) => ({
          id: block.id,
          indexGenerationId: generationId,
          sourceId: work.generation.sourceId,
          representationId: block.representationId,
          ordinal: block.ordinal,
          kind: block.kind,
          headingPath: block.headingPath,
          exactText: block.exactText,
          indexText: block.indexText,
          locator: block.locator,
          content: block.content,
          fidelity: block.fidelity,
          contentHash: block.contentHash,
          locatorStart: block.locator.kind === "text_range" ? block.locator.start : null,
          locatorEnd: block.locator.kind === "text_range" ? block.locator.end : null,
          capacityUnits: block.capacityUnits,
        })),
      );
      await transaction.insert(retrievalChunks).values(
        projection.chunks.map((chunk, index) => ({
          id: chunk.id,
          indexGenerationId: generationId,
          sourceId: work.generation.sourceId,
          representationId: chunk.representationId,
          ordinal: chunk.ordinal,
          firstBlockOrdinal: chunk.firstBlockOrdinal,
          lastBlockOrdinal: chunk.lastBlockOrdinal,
          headingPath: chunk.headingPath,
          exactText: chunk.exactText,
          indexText: chunk.indexText,
          denseVectorHash: createHash("sha256").update(JSON.stringify(dense[index])).digest("hex"),
          contentHash: chunk.contentHash,
          locatorStart: null,
          locatorEnd: null,
          capacityUnits: chunk.capacityUnits,
        })),
      );
      await transaction.insert(retrievalEvidenceUnits).values(
        projection.evidenceUnits.map((unit) => ({
          id: unit.id,
          indexGenerationId: generationId,
          sourceId: work.generation.sourceId,
          representationId: unit.representationId,
          ordinal: unit.ordinal,
          blockOrdinal: unit.blockOrdinal,
          kind: unit.content.kind === "visual_region" ? "visual" : "text",
          exactExcerpt: unit.exactExcerpt,
          locator: unit.locator,
          content: unit.content,
          fidelity: unit.fidelity,
          contentHash: unit.contentHash,
          locatorStart: unit.locator.kind === "text_range" ? unit.locator.start : null,
          locatorEnd: unit.locator.kind === "text_range" ? unit.locator.end : null,
          capacityUnits: unit.capacityUnits,
        })),
      );
      await transaction
        .update(retrievalIndexGenerations)
        .set({
          state: "publishing",
          representationFamily,
          representationAdapterId,
          representationAdapterVersion,
          representationHash,
          representationMetadata,
          updatedAt: dependencies.now(),
        })
        .where(eq(retrievalIndexGenerations.id, generationId));
    });
    await dependencies.index.ensureCollection({
      collection: work.generation.collectionName,
      dimension: work.generation.embeddingDimension,
    });
    await dependencies.index.removeGeneration({
      collection: work.generation.collectionName,
      generationId,
    });
    await dependencies.index.stage({
      collection: work.generation.collectionName,
      points: projection.chunks.map((chunk, index) => {
        const vector = dense[index];
        if (!vector) throw new Error("knowledge_embedding_shape");
        return {
          workspaceId: work.generation.workspaceId,
          sourceId: work.generation.sourceId,
          generationId,
          manifestHash: work.generation.manifestHash,
          chunk,
          dense: vector,
        };
      }),
    });
    if (work.generation.artifactRevisionId) {
      const [currentArtifact] = await dependencies.db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(
          and(
            eq(artifacts.id, work.artifact?.id ?? ""),
            eq(artifacts.currentRevisionId, work.generation.artifactRevisionId),
            isNull(artifacts.deletedAt),
          ),
        )
        .limit(1);
      if (!currentArtifact) {
        const obsoleteAt = dependencies.now();
        await dependencies.db
          .update(retrievalIndexGenerations)
          .set({ state: "obsolete", publishedAt: obsoleteAt, updatedAt: obsoleteAt })
          .where(eq(retrievalIndexGenerations.id, generationId));
        await dependencies.index.removeGeneration({
          collection: work.generation.collectionName,
          generationId,
        });
        return { reason: "artifact_superseded", status: "obsolete" };
      }
    }
    const [publishable] = await dependencies.db
      .select({ id: retrievalIndexGenerations.id })
      .from(retrievalIndexGenerations)
      .innerJoin(sources, eq(retrievalIndexGenerations.sourceId, sources.id))
      .where(
        and(
          eq(retrievalIndexGenerations.id, generationId),
          eq(retrievalIndexGenerations.state, "publishing"),
          isNull(sources.deletedAt),
        ),
      )
      .limit(1);
    if (!publishable) {
      await dependencies.index.removeGeneration({
        collection: work.generation.collectionName,
        generationId,
      });
      return { reason: "source_unavailable", status: "obsolete" };
    }
    const publishedAt = dependencies.now();
    await dependencies.index.publish({ collection: work.generation.collectionName, generationId });
    const promoted = await dependencies.db.transaction(async (transaction) => {
      const [activeSource] = await transaction
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, work.generation.sourceId), isNull(sources.deletedAt)))
        .for("update")
        .limit(1);
      if (!activeSource) return false;
      if (work.generation.artifactRevisionId) {
        const [currentArtifact] = await transaction
          .select({ currentRevisionId: artifacts.currentRevisionId })
          .from(artifacts)
          .where(
            and(
              eq(artifacts.id, work.artifact?.id ?? ""),
              eq(artifacts.currentRevisionId, work.generation.artifactRevisionId),
              isNull(artifacts.deletedAt),
            ),
          )
          .for("update")
          .limit(1);
        if (!currentArtifact) {
          await transaction
            .update(retrievalIndexGenerations)
            .set({ state: "obsolete", publishedAt, updatedAt: publishedAt })
            .where(eq(retrievalIndexGenerations.id, generationId));
          return false;
        }
      }
      const [currentGeneration] = await transaction
        .select({ id: retrievalIndexGenerations.id })
        .from(retrievalIndexGenerations)
        .where(
          and(
            eq(retrievalIndexGenerations.id, generationId),
            eq(retrievalIndexGenerations.state, "publishing"),
          ),
        )
        .for("update")
        .limit(1);
      if (!currentGeneration) return false;
      await transaction
        .update(retrievalIndexGenerations)
        .set({ state: "obsolete", updatedAt: publishedAt })
        .where(
          and(
            eq(retrievalIndexGenerations.sourceId, work.generation.sourceId),
            eq(retrievalIndexGenerations.state, "ready"),
            ne(retrievalIndexGenerations.id, generationId),
          ),
        );
      const [ready] = await transaction
        .update(retrievalIndexGenerations)
        .set({ state: "ready", publishedAt, updatedAt: publishedAt })
        .where(
          and(
            eq(retrievalIndexGenerations.id, generationId),
            eq(retrievalIndexGenerations.state, "publishing"),
          ),
        )
        .returning({ id: retrievalIndexGenerations.id });
      return Boolean(ready);
    });
    if (!promoted) {
      await dependencies.index.removeGeneration({
        collection: work.generation.collectionName,
        generationId,
      });
      return { reason: "artifact_superseded", status: "obsolete" };
    }
    return { status: "completed" };
  } catch (error) {
    await dependencies.index
      .removeGeneration({ collection: work.generation.collectionName, generationId })
      .catch(() => undefined);
    const failedAt = dependencies.now();
    const attempt = work.generation.retryCount + 1;
    const failure = indexingFailure(error, attempt, failedAt);
    await dependencies.db
      .update(retrievalIndexGenerations)
      .set({
        state: "failed",
        failureCode: failure.failureCode,
        publishedAt: null,
        retryCount: attempt,
        nextRetryAt: failure.nextRetryAt,
        updatedAt: failedAt,
      })
      .where(eq(retrievalIndexGenerations.id, generationId));
    throw error;
  }
}

export async function collectObsoleteKnowledgeIndexGenerations(
  dependencies: Pick<
    KnowledgeIndexingDependencies,
    "db" | "index" | "now"
  > = defaultKnowledgeIndexingDependencies(),
  options: { retentionMs?: number; batchSize?: number } = {},
) {
  const retentionMs = options.retentionMs ?? KNOWLEDGE_OBSOLETE_GENERATION_RETENTION_MS;
  const batchSize = options.batchSize ?? KNOWLEDGE_GC_BATCH_SIZE;
  if (retentionMs < 0 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error("knowledge_gc_options_invalid");
  }
  const cutoff = new Date(dependencies.now().getTime() - retentionMs);
  const obsolete = await dependencies.db
    .select({
      id: retrievalIndexGenerations.id,
      collection: retrievalIndexGenerations.collectionName,
    })
    .from(retrievalIndexGenerations)
    .where(
      and(
        eq(retrievalIndexGenerations.state, "obsolete"),
        lte(retrievalIndexGenerations.updatedAt, cutoff),
      ),
    )
    .orderBy(asc(retrievalIndexGenerations.updatedAt), asc(retrievalIndexGenerations.id))
    .limit(batchSize);
  let removed = 0;
  let failed = 0;
  for (const generation of obsolete) {
    try {
      await dependencies.index.removeGeneration({
        collection: generation.collection,
        generationId: generation.id,
      });
      await dependencies.db
        .delete(retrievalIndexGenerations)
        .where(
          and(
            eq(retrievalIndexGenerations.id, generation.id),
            eq(retrievalIndexGenerations.state, "obsolete"),
          ),
        );
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
}
