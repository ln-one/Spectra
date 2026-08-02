import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import {
  artifactRevisions,
  artifactSources,
  artifacts,
  fileSources,
  principals,
  retrievalChunks,
  retrievalIndexGenerations,
  sourceIngestions,
  sources,
  workspaceLocators,
  workspacePermissionGrants,
  workspaceReferenceSources,
  workspaces,
} from "@/database/schema";
import {
  artifactGenerationStateSchema,
  artifactSourceKindSchema,
} from "@/features/artifacts/types";
import { authEnvironment } from "@/features/auth/config";
import type { Actor } from "@/features/identity/types";
import {
  requireWorkspacePermission,
  resolveReadableWorkspaceIds,
  type WorkspaceAccessSnapshot,
} from "@/features/workspaces/access.server";
import { workspaceHref } from "@/features/workspaces/address";
import { WorkspaceError } from "@/features/workspaces/errors";
import { hasWorkspacePermission, type WorkspacePermission } from "@/features/workspaces/policy";
import { resolveWorkspace } from "@/features/workspaces/service";
import { webLogger } from "@/observability/server";
import type { SourceCleanupQueue } from "./cleanup";
import { SourceError, type SourceErrorCode, sourceErrorCodes } from "./errors";
import { createSourceIngestionQueue, type SourceIngestionQueue } from "./ingestion/dbos";
import { latestSourceIngestions, startSourceIngestion } from "./ingestion/service";
import { createS3SourceStorage } from "./s3-storage";
import type { InspectedObject, SourceStorage, VersionedObject } from "./storage";
import type {
  ArtifactSource,
  FileSourceState,
  Source,
  SourceDeletionResult,
  SourceKnowledgeIndex,
  SourceKnowledgeIndexState,
  SourceUploadTarget,
  UploadedFileSource,
  WorkspaceReferenceCandidate,
  WorkspaceReferenceCandidateList,
  WorkspaceReferenceResolution,
  WorkspaceReferenceSource,
} from "./types";
import {
  isSourceNativeTextExtension,
  MAX_SOURCE_FILE_BYTES,
  type SourceUploadIntent,
  sourceFileExtension,
  sourceFileMaxBytes,
  sourceUploadIntentSchema,
} from "./validation";

export const MAX_WORKSPACE_SOURCE_BYTES = 1024 * 1024 * 1024;
const SOURCE_UPLOAD_TTL_SECONDS = 15 * 60;
const TYPE_INSPECTION_BYTES = 8192;
const uuidSchema = z.string().uuid();
const sourceFailureCodeSchema = z.enum(sourceErrorCodes).nullable();

type SourceRow = {
  source: typeof sources.$inferSelect;
  file: typeof fileSources.$inferSelect;
};

export type SourceServiceDependencies = {
  db: Database;
  storage: SourceStorage;
  now: () => Date;
  randomId: () => string;
  ingestionQueue: SourceIngestionQueue;
};

type SourceDatabaseDependencies = Pick<SourceServiceDependencies, "db"> & {
  applicationOrigin?: string;
  access?: WorkspaceAccessSnapshot;
};
export type SourceDeletionDependencies = Pick<SourceServiceDependencies, "db" | "now"> & {
  cleanupQueue: SourceCleanupQueue;
};

let defaultStorage: SourceStorage | undefined;
let defaultIngestionQueue: SourceIngestionQueue | undefined;

function defaultDependencies(): SourceServiceDependencies {
  defaultStorage ??= createS3SourceStorage();
  defaultIngestionQueue ??= createSourceIngestionQueue();
  return {
    db: database,
    storage: defaultStorage,
    now: () => new Date(),
    randomId: randomUUID,
    ingestionQueue: defaultIngestionQueue,
  };
}

function sourceState(value: string): FileSourceState {
  if (value === "pending_upload" || value === "stored" || value === "failed") return value;
  throw new Error(`Unsupported source state: ${value}`);
}

function sourceFailureCode(value: string | null): SourceErrorCode | null {
  return sourceFailureCodeSchema.parse(value);
}

function knowledgeIndexState(value: string): SourceKnowledgeIndexState {
  if (
    value === "queued" ||
    value === "projecting" ||
    value === "publishing" ||
    value === "ready" ||
    value === "failed" ||
    value === "obsolete"
  ) {
    return value;
  }
  throw new Error(`Unsupported Knowledge index state: ${value}`);
}

function toSourceKnowledgeIndex(
  row: typeof retrievalIndexGenerations.$inferSelect,
  chunkCount: number,
): SourceKnowledgeIndex {
  return {
    state: knowledgeIndexState(row.state),
    chunkCount,
    failureCode: row.failureCode,
    retryCount: row.retryCount,
    nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function latestSourceKnowledgeIndexes(sourceIds: string[], db: Database) {
  if (sourceIds.length === 0) return new Map<string, SourceKnowledgeIndex>();
  const rows = await db
    .selectDistinctOn([retrievalIndexGenerations.sourceId])
    .from(retrievalIndexGenerations)
    .where(inArray(retrievalIndexGenerations.sourceId, sourceIds))
    .orderBy(
      retrievalIndexGenerations.sourceId,
      desc(retrievalIndexGenerations.createdAt),
      desc(retrievalIndexGenerations.id),
    );
  const latestRows = new Map(rows.map((row) => [row.sourceId, row]));
  const generationIds = [...latestRows.values()].map((row) => row.id);
  const chunkCounts =
    generationIds.length === 0
      ? []
      : await db
          .select({
            indexGenerationId: retrievalChunks.indexGenerationId,
            value: count(),
          })
          .from(retrievalChunks)
          .where(inArray(retrievalChunks.indexGenerationId, generationIds))
          .groupBy(retrievalChunks.indexGenerationId);
  const chunkCountByGeneration = new Map(
    chunkCounts.map((row) => [row.indexGenerationId, row.value]),
  );
  return new Map(
    [...latestRows.entries()].map(([sourceId, row]) => [
      sourceId,
      toSourceKnowledgeIndex(row, chunkCountByGeneration.get(row.id) ?? 0),
    ]),
  );
}

function toSource(
  row: SourceRow,
  ingestion: UploadedFileSource["ingestion"] = null,
  knowledgeIndex?: SourceKnowledgeIndex,
): UploadedFileSource {
  return {
    id: row.source.id,
    workspaceId: row.source.workspaceId,
    kind: "uploadedFile",
    originalFilename: row.file.originalFilename,
    sizeBytes: row.file.sizeBytes,
    state: sourceState(row.file.state),
    failureCode: sourceFailureCode(row.file.failureCode),
    uploadGeneration: row.file.uploadGeneration,
    uploadExpiresAt: row.file.uploadExpiresAt?.toISOString() ?? null,
    ingestion,
    ...(knowledgeIndex ? { knowledgeIndex } : {}),
    createdAt: row.source.createdAt.toISOString(),
    updatedAt: row.source.updatedAt.toISOString(),
  };
}

type WorkspaceReferenceRow = {
  source: typeof sources.$inferSelect;
  reference: typeof workspaceReferenceSources.$inferSelect;
  target: typeof workspaces.$inferSelect;
  ownerHandle: string;
  slug: string | null;
};

function toWorkspaceReferenceSource(row: WorkspaceReferenceRow): WorkspaceReferenceSource {
  return {
    id: row.source.id,
    workspaceId: row.source.workspaceId,
    kind: "workspaceReference",
    accessState: "available",
    targetWorkspace: {
      id: row.target.id,
      name: row.target.name,
      ownerHandle: row.ownerHandle,
      canonicalHref: workspaceHref({
        id: row.target.id,
        ownerHandle: row.ownerHandle,
        slug: row.slug,
      }),
      updatedAt: row.target.updatedAt.toISOString(),
    },
    createdAt: row.source.createdAt.toISOString(),
    updatedAt: row.source.updatedAt.toISOString(),
  };
}

function toUnavailableWorkspaceReferenceSource(row: {
  source: typeof sources.$inferSelect;
}): WorkspaceReferenceSource {
  return {
    id: row.source.id,
    workspaceId: row.source.workspaceId,
    kind: "workspaceReference",
    accessState: "unavailable",
    createdAt: row.source.createdAt.toISOString(),
    updatedAt: row.source.updatedAt.toISOString(),
  };
}

function toWorkspaceReferenceCandidate(
  row: {
    id: string;
    name: string;
    ownerId: string;
    ownerHandle: string;
    slug: string | null;
    updatedAt: Date;
    visibility: string;
    hasExplicitGrant?: boolean;
  },
  actor: Actor,
): WorkspaceReferenceCandidate {
  const relationship =
    row.ownerId === actor.principalId
      ? "owned"
      : row.hasExplicitGrant
        ? "shared"
        : row.visibility === "public"
          ? "public"
          : "shared";
  return {
    id: row.id,
    name: row.name,
    ownerHandle: row.ownerHandle,
    relationship,
    canonicalHref: workspaceHref(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type ArtifactSourceRow = {
  source: typeof sources.$inferSelect;
  artifactSource: typeof artifactSources.$inferSelect;
  artifact: typeof artifacts.$inferSelect;
  revision: typeof artifactRevisions.$inferSelect;
};

function toArtifactSource(
  row: ArtifactSourceRow,
  knowledgeIndex?: SourceKnowledgeIndex,
): ArtifactSource {
  if (!row.artifact.conversationId) {
    throw new Error("Artifact Source has no conversation");
  }
  return {
    id: row.source.id,
    workspaceId: row.source.workspaceId,
    kind: "artifact",
    artifact: {
      id: row.artifact.id,
      kind: artifactSourceKindSchema.parse(row.artifact.kind),
      title: row.artifact.title,
      conversationId: row.artifact.conversationId,
      generationState: artifactGenerationStateSchema.parse(row.artifact.generationState),
      createdAt: row.artifact.createdAt.toISOString(),
      updatedAt: row.artifact.updatedAt.toISOString(),
      currentRevision: {
        id: row.revision.id,
        revisionNumber: row.revision.revisionNumber,
      },
    },
    ...(knowledgeIndex ? { knowledgeIndex } : {}),
    createdAt: row.source.createdAt.toISOString(),
    updatedAt: row.source.updatedAt.toISOString(),
  };
}

function stagingKey(sourceId: string, generation: number, randomId: string) {
  return `staging/sources/${sourceId}/${generation}/${randomId}`;
}

function finalKey(sourceId: string) {
  return `sources/${sourceId}/original`;
}

async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new SourceError("source_storage_unavailable");
  }
}

function uploadTarget(source: SourceRow, url: string): SourceUploadTarget {
  if (!source.file.uploadExpiresAt) throw new Error("Pending source has no upload expiry");
  return {
    source: toSource(source),
    upload: {
      method: "PUT",
      url,
      generation: source.file.uploadGeneration,
      expiresAt: source.file.uploadExpiresAt.toISOString(),
    },
  };
}

async function hasExpectedFileType(filename: string, bytes: Uint8Array) {
  const detected = await fileTypeFromBuffer(bytes).catch(() => undefined);
  const expected = sourceFileExtension(filename);
  if (!expected) return false;
  if (expected === "xlsx") {
    return detected?.ext === "xlsx" || detected?.ext === "zip";
  }
  if (isSourceNativeTextExtension(expected)) {
    try {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
      return !content.includes("\0");
    } catch {
      return false;
    }
  }
  if (expected === "jpg" || expected === "jpeg") return detected?.ext === "jpg";
  if (expected === "docx" || expected === "pptx") {
    // Deep OOXML validation belongs to ingestion; this boundary only rejects non-ZIP containers.
    return detected?.ext === expected || detected?.ext === "zip";
  }
  if (expected === "wmv") return detected?.ext === "asf" || detected?.ext === "wmv";
  return detected?.ext === expected;
}

function failureCodeForSize(filename: string, actualSize: number): SourceErrorCode {
  const maxBytes = sourceFileMaxBytes(filename) ?? MAX_SOURCE_FILE_BYTES;
  return actualSize > maxBytes ? "source_file_too_large" : "source_upload_mismatch";
}

function requireUuid(value: string) {
  if (!uuidSchema.safeParse(value).success) throw new SourceError("source_not_found");
}

async function requireSourcePermission(
  actor: Actor,
  sourceId: string,
  permission: WorkspacePermission,
  db: Database,
) {
  const [source] = await db
    .select({ workspaceId: sources.workspaceId })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!source) throw new SourceError("source_not_found");
  try {
    await requireWorkspacePermission(actor, source.workspaceId, permission, db);
  } catch {
    throw new SourceError("source_not_found");
  }
}

export async function startSourceUpload(
  actor: Actor,
  workspaceId: string,
  input: SourceUploadIntent,
  dependencies: SourceServiceDependencies = defaultDependencies(),
): Promise<SourceUploadTarget> {
  requireUuid(workspaceId);
  const maxBytes =
    typeof input.originalFilename === "string"
      ? sourceFileMaxBytes(input.originalFilename.trim())
      : null;
  if (
    typeof input.declaredSizeBytes === "number" &&
    input.declaredSizeBytes > (maxBytes ?? MAX_SOURCE_FILE_BYTES)
  ) {
    throw new SourceError("source_file_too_large");
  }
  const payload = sourceUploadIntentSchema.parse(input);
  try {
    await requireWorkspacePermission(actor, workspaceId, "source.manage", dependencies.db);
  } catch {
    throw new SourceError("source_not_found");
  }
  const sourceId = dependencies.randomId();
  const generation = 1;
  const key = stagingKey(sourceId, generation, dependencies.randomId());
  const expiresAt = new Date(dependencies.now().getTime() + SOURCE_UPLOAD_TTL_SECONDS * 1000);

  return dependencies.db.transaction(async (transaction) => {
    const [workspace] = await transaction
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for("update")
      .limit(1);
    if (!workspace || workspace.ownerId !== actor.principalId) {
      throw new SourceError("source_not_found");
    }

    const [usage] = await transaction
      .select({
        bytes: sql<string>`coalesce(sum(${fileSources.sizeBytes}), 0)`,
      })
      .from(fileSources)
      .innerJoin(sources, eq(fileSources.sourceId, sources.id))
      .where(
        and(
          eq(sources.workspaceId, workspaceId),
          isNull(sources.deletedAt),
          inArray(fileSources.state, ["pending_upload", "stored"]),
        ),
      );
    if (Number(usage?.bytes ?? 0) + payload.declaredSizeBytes > MAX_WORKSPACE_SOURCE_BYTES) {
      throw new SourceError("source_workspace_quota_exceeded");
    }

    const [createdSource] = await transaction
      .insert(sources)
      .values({
        id: sourceId,
        workspaceId,
        kind: "uploaded_file",
      })
      .returning();
    if (!createdSource) throw new Error("Source insert returned no row");
    const [createdFile] = await transaction
      .insert(fileSources)
      .values({
        sourceId,
        originalFilename: payload.originalFilename,
        sizeBytes: payload.declaredSizeBytes,
        uploadKey: key,
        uploadExpiresAt: expiresAt,
        uploadGeneration: generation,
      })
      .returning();
    if (!createdFile) throw new Error("File source insert returned no row");

    const { url } = await storageOperation(() =>
      dependencies.storage.createUploadUrl({
        key,
        expiresInSeconds: SOURCE_UPLOAD_TTL_SECONDS,
      }),
    );
    return uploadTarget({ source: createdSource, file: createdFile }, url);
  });
}

export async function prepareSourceUpload(
  actor: Actor,
  sourceId: string,
  dependencies: SourceServiceDependencies = defaultDependencies(),
): Promise<SourceUploadTarget> {
  requireUuid(sourceId);
  await requireSourcePermission(actor, sourceId, "source.manage", dependencies.db);
  const now = dependencies.now();
  const expiresAt = new Date(now.getTime() + SOURCE_UPLOAD_TTL_SECONDS * 1000);

  return dependencies.db.transaction(async (transaction) => {
    const [row] = await transaction
      .select({ source: sources, file: fileSources, ownerId: workspaces.ownerId })
      .from(sources)
      .innerJoin(fileSources, eq(fileSources.sourceId, sources.id))
      .innerJoin(workspaces, eq(sources.workspaceId, workspaces.id))
      .where(eq(sources.id, sourceId))
      .for("update", { of: [sources, fileSources] })
      .limit(1);
    if (!row || row.ownerId !== actor.principalId || row.source.deletedAt) {
      throw new SourceError("source_not_found");
    }
    if (row.file.state !== "pending_upload") throw new SourceError("source_invalid_state");
    const currentKey = row.file.uploadKey;
    const currentExpiry = row.file.uploadExpiresAt;
    if (!currentKey || !currentExpiry) {
      throw new SourceError("source_invalid_state");
    }

    const expired = currentExpiry <= now;
    const generation = expired ? row.file.uploadGeneration + 1 : row.file.uploadGeneration;
    const key = expired ? stagingKey(sourceId, generation, dependencies.randomId()) : currentKey;
    const uploadExpiry = expired ? expiresAt : currentExpiry;
    const expiresInSeconds = Math.max(
      1,
      Math.ceil((uploadExpiry.getTime() - now.getTime()) / 1000),
    );
    const { url } = await storageOperation(() =>
      dependencies.storage.createUploadUrl({
        key,
        expiresInSeconds,
      }),
    );
    if (!expired) return uploadTarget(row, url);

    const [renewedFile] = await transaction
      .update(fileSources)
      .set({
        uploadKey: key,
        uploadExpiresAt: uploadExpiry,
        uploadGeneration: generation,
      })
      .where(eq(fileSources.sourceId, sourceId))
      .returning();
    if (!renewedFile) throw new Error("Source renewal returned no file row");
    const [renewedSource] = await transaction
      .update(sources)
      .set({ updatedAt: now })
      .where(eq(sources.id, sourceId))
      .returning();
    if (!renewedSource) throw new Error("Source renewal returned no source row");
    return uploadTarget({ source: renewedSource, file: renewedFile }, url);
  });
}

export async function completeSourceUpload(
  actor: Actor,
  sourceId: string,
  uploadGeneration: number,
  dependencies: SourceServiceDependencies = defaultDependencies(),
): Promise<UploadedFileSource> {
  requireUuid(sourceId);
  await requireSourcePermission(actor, sourceId, "source.manage", dependencies.db);
  let copiedObject: VersionedObject | undefined;
  let stagingObject: InspectedObject | undefined;

  let outcome: Awaited<ReturnType<typeof completeTransaction>>;

  async function completeTransaction() {
    return dependencies.db.transaction(async (transaction) => {
      const [row] = await transaction
        .select({ source: sources, file: fileSources, ownerId: workspaces.ownerId })
        .from(sources)
        .innerJoin(fileSources, eq(fileSources.sourceId, sources.id))
        .innerJoin(workspaces, eq(sources.workspaceId, workspaces.id))
        .where(eq(sources.id, sourceId))
        .for("update", { of: [sources, fileSources] })
        .limit(1);
      if (!row || row.ownerId !== actor.principalId || row.source.deletedAt) {
        throw new SourceError("source_not_found");
      }
      if (row.file.uploadGeneration !== uploadGeneration) {
        throw new SourceError("source_upload_mismatch");
      }
      if (row.file.state === "stored") return { kind: "stored" as const, row };
      const uploadKey = row.file.uploadKey;
      if (row.file.state !== "pending_upload" || !uploadKey) {
        throw new SourceError("source_invalid_state");
      }
      const now = dependencies.now();
      if (!row.file.uploadExpiresAt || row.file.uploadExpiresAt <= now) {
        throw new SourceError("source_upload_expired");
      }

      const inspected = await storageOperation(() =>
        dependencies.storage.headObject({ key: uploadKey }),
      );
      if (!inspected) throw new SourceError("source_upload_incomplete");
      stagingObject = inspected;

      let rejection: SourceErrorCode | undefined;
      if (inspected.sizeBytes !== row.file.sizeBytes) {
        rejection = failureCodeForSize(row.file.originalFilename, inspected.sizeBytes);
      } else {
        const bytes = await storageOperation(() =>
          dependencies.storage.readObjectRange(inspected, {
            start: 0,
            end: Math.min(inspected.sizeBytes, TYPE_INSPECTION_BYTES) - 1,
          }),
        );
        if (!(await hasExpectedFileType(row.file.originalFilename, bytes))) {
          rejection = "source_file_type_unsupported";
        }
      }

      if (rejection) {
        const [failedFile] = await transaction
          .update(fileSources)
          .set({
            state: "failed",
            failureCode: rejection,
            uploadKey: null,
            uploadExpiresAt: null,
          })
          .where(eq(fileSources.sourceId, sourceId))
          .returning();
        if (!failedFile) throw new Error("Source rejection returned no file row");
        await transaction.update(sources).set({ updatedAt: now }).where(eq(sources.id, sourceId));
        return { kind: "rejected" as const, code: rejection };
      }

      copiedObject = await storageOperation(() =>
        dependencies.storage.copyObjectConditionally({
          source: inspected,
          destinationKey: finalKey(sourceId),
        }),
      );
      const [storedFile] = await transaction
        .update(fileSources)
        .set({
          state: "stored",
          uploadKey: null,
          uploadExpiresAt: null,
          storageKey: copiedObject.key,
          storageVersionId: copiedObject.versionId,
        })
        .where(eq(fileSources.sourceId, sourceId))
        .returning();
      if (!storedFile) throw new Error("Source completion returned no file row");
      const [storedSource] = await transaction
        .update(sources)
        .set({ updatedAt: now })
        .where(eq(sources.id, sourceId))
        .returning();
      if (!storedSource) throw new Error("Source completion returned no source row");
      return { kind: "stored" as const, row: { source: storedSource, file: storedFile } };
    });
  }

  try {
    outcome = await completeTransaction();
  } catch (error) {
    if (copiedObject) {
      try {
        const [persisted] = await dependencies.db
          .select({ source: sources, file: fileSources })
          .from(sources)
          .innerJoin(fileSources, eq(fileSources.sourceId, sources.id))
          .where(eq(sources.id, sourceId))
          .limit(1);
        const committed =
          persisted?.file.storageKey === copiedObject.key &&
          persisted.file.storageVersionId === copiedObject.versionId;
        if (committed && persisted.source.deletedAt === null) return toSource(persisted);
        if (!committed) {
          await dependencies.storage.deleteObjectVersion(copiedObject).catch(() => undefined);
        }
      } catch {
        // An uncertain commit must preserve bytes until database reconciliation is possible.
      }
    }
    throw error;
  }

  if (stagingObject) {
    // The final version is authoritative; lifecycle cleans staging if this best-effort delete fails.
    await dependencies.storage.deleteObjectVersion(stagingObject).catch(() => undefined);
  }
  if (outcome.kind === "rejected") throw new SourceError(outcome.code);
  let ingestion: UploadedFileSource["ingestion"] = null;
  try {
    ingestion = await startSourceIngestion(actor, sourceId, {
      db: dependencies.db,
      queue: dependencies.ingestionQueue,
      now: dependencies.now,
      randomId: dependencies.randomId,
    });
  } catch (error) {
    webLogger.error(
      {
        error,
        event: "source.ingestion.enqueue_failed",
        sourceId,
      },
      "Source ingestion enqueue failed",
    );
  }
  return toSource(outcome.row, ingestion);
}

export async function listWorkspaceReferenceCandidates(
  actor: Actor,
  workspaceId: string,
  dependencies: SourceDatabaseDependencies = { db: database },
): Promise<WorkspaceReferenceCandidateList> {
  requireUuid(workspaceId);
  try {
    const workspace = await requireWorkspacePermission(
      actor,
      workspaceId,
      "source.manage",
      dependencies.db,
    );
    const [state] = await dependencies.db
      .select({ archivedAt: workspaces.archivedAt })
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id))
      .limit(1);
    if (!state || state.archivedAt) throw new SourceError("source_not_found");
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError("source_not_found");
  }

  const activeReferences = await dependencies.db
    .select({ targetWorkspaceId: workspaceReferenceSources.targetWorkspaceId })
    .from(workspaceReferenceSources)
    .innerJoin(sources, eq(workspaceReferenceSources.sourceId, sources.id))
    .where(and(eq(sources.workspaceId, workspaceId), isNull(sources.deletedAt)));
  const referencedIds = new Set(activeReferences.map((row) => row.targetWorkspaceId));

  const candidates = await dependencies.db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      ownerId: workspaces.ownerId,
      ownerHandle: principals.handle,
      slug: workspaceLocators.slug,
      updatedAt: workspaces.updatedAt,
      visibility: workspaces.visibility,
      explicitGrantId: workspacePermissionGrants.id,
    })
    .from(workspaces)
    .innerJoin(principals, eq(principals.id, workspaces.ownerId))
    .leftJoin(
      workspaceLocators,
      and(
        eq(workspaceLocators.workspaceId, workspaces.id),
        eq(workspaceLocators.state, "current"),
        isNull(workspaceLocators.replacedAt),
      ),
    )
    .leftJoin(
      workspacePermissionGrants,
      and(
        eq(workspacePermissionGrants.workspaceId, workspaces.id),
        eq(workspacePermissionGrants.principalId, actor.principalId),
        eq(workspacePermissionGrants.permission, "workspace.read"),
      ),
    )
    .where(
      and(
        ne(workspaces.id, workspaceId),
        isNull(workspaces.archivedAt),
        eq(workspaces.referenceable, true),
        or(
          eq(workspaces.ownerId, actor.principalId),
          isNotNull(workspacePermissionGrants.id),
          eq(workspaces.visibility, "public"),
        ),
      ),
    )
    .orderBy(desc(workspaces.updatedAt), desc(workspaces.id));

  return {
    candidates: candidates
      .filter((candidate) => !referencedIds.has(candidate.id))
      .map((candidate) =>
        toWorkspaceReferenceCandidate(
          { ...candidate, hasExplicitGrant: candidate.explicitGrantId !== null },
          actor,
        ),
      ),
    totalOtherWorkspaces: candidates.length,
  };
}

const workspaceReferenceLocatorSchema = z.string().trim().min(1).max(2048);

function workspaceLocatorParts(rawLocator: string, applicationOrigin: string) {
  const locator = workspaceReferenceLocatorSchema.parse(rawLocator);
  let pathname = locator;
  if (/^https?:\/\//i.test(locator)) {
    try {
      const url = new URL(locator);
      if (url.origin !== new URL(applicationOrigin).origin) {
        throw new SourceError("source_not_found");
      }
      pathname = url.pathname;
    } catch {
      throw new SourceError("source_not_found");
    }
  }
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        throw new SourceError("source_not_found");
      }
    });
  if (parts.length !== 2) throw new SourceError("source_not_found");
  const [handle, slug] = parts;
  if (!handle || !slug) throw new SourceError("source_not_found");
  return { handle, slug };
}

export async function resolveWorkspaceReferenceLocator(
  actor: Actor,
  workspaceId: string,
  rawLocator: string,
  dependencies: SourceDatabaseDependencies = { db: database },
): Promise<WorkspaceReferenceResolution> {
  requireUuid(workspaceId);
  try {
    await requireWorkspacePermission(actor, workspaceId, "source.manage", dependencies.db);
    const { handle, slug } = workspaceLocatorParts(
      rawLocator,
      dependencies.applicationOrigin ?? authEnvironment().baseURL,
    );
    const target = await resolveWorkspace(actor, handle, slug, dependencies.db);
    if (target.id === workspaceId || target.archivedAt) throw new SourceError("source_not_found");
    const [referencePolicy] = await dependencies.db
      .select({
        referenceable: workspaces.referenceable,
        visibility: workspaces.visibility,
      })
      .from(workspaces)
      .where(eq(workspaces.id, target.id))
      .limit(1);
    if (!referencePolicy?.referenceable) throw new SourceError("source_not_found");
    return {
      candidate: toWorkspaceReferenceCandidate(
        {
          id: target.id,
          name: target.name,
          ownerId: target.ownerId,
          ownerHandle: target.ownerHandle,
          slug: target.slug,
          updatedAt: new Date(target.updatedAt),
          visibility: referencePolicy.visibility,
        },
        actor,
      ),
      resolvedFromRedirect: target.resolvedFromRedirect === true,
    };
  } catch (error) {
    if (error instanceof SourceError) throw error;
    if (error instanceof WorkspaceError || error instanceof z.ZodError) {
      throw new SourceError("source_not_found");
    }
    throw error;
  }
}

export async function addWorkspaceReference(
  actor: Actor,
  workspaceId: string,
  targetWorkspaceId: string,
  dependencies: SourceDatabaseDependencies = { db: database },
): Promise<WorkspaceReferenceSource> {
  requireUuid(workspaceId);
  requireUuid(targetWorkspaceId);
  if (workspaceId === targetWorkspaceId) throw new SourceError("source_invalid_state");
  try {
    await requireWorkspacePermission(actor, workspaceId, "source.manage", dependencies.db);
  } catch {
    throw new SourceError("source_not_found");
  }

  try {
    return await dependencies.db.transaction(async (transaction) => {
      const workspaceRows = await transaction
        .select()
        .from(workspaces)
        .where(inArray(workspaces.id, [workspaceId, targetWorkspaceId]))
        .orderBy(asc(workspaces.id))
        .for("update");
      const sourceWorkspace = workspaceRows.find((workspace) => workspace.id === workspaceId);
      const targetWorkspace = workspaceRows.find((workspace) => workspace.id === targetWorkspaceId);
      if (
        !sourceWorkspace ||
        !targetWorkspace ||
        sourceWorkspace.archivedAt ||
        targetWorkspace.archivedAt ||
        !targetWorkspace.referenceable
      ) {
        throw new SourceError("source_not_found");
      }
      await requireWorkspacePermission(actor, workspaceId, "source.manage", transaction);
      await requireWorkspacePermission(actor, targetWorkspaceId, "workspace.read", transaction);
      const [targetAddress] = await transaction
        .select({
          ownerHandle: principals.handle,
          slug: workspaceLocators.slug,
        })
        .from(workspaces)
        .innerJoin(principals, eq(principals.id, workspaces.ownerId))
        .leftJoin(
          workspaceLocators,
          and(
            eq(workspaceLocators.workspaceId, workspaces.id),
            eq(workspaceLocators.state, "current"),
            isNull(workspaceLocators.replacedAt),
          ),
        )
        .where(eq(workspaces.id, targetWorkspaceId))
        .limit(1);
      if (!targetAddress) throw new SourceError("source_not_found");

      const [existing] = await transaction
        .select({
          source: sources,
          reference: workspaceReferenceSources,
        })
        .from(workspaceReferenceSources)
        .innerJoin(sources, eq(workspaceReferenceSources.sourceId, sources.id))
        .where(
          and(
            eq(workspaceReferenceSources.sourceWorkspaceId, workspaceId),
            eq(workspaceReferenceSources.targetWorkspaceId, targetWorkspaceId),
          ),
        )
        .for("update", { of: [sources] })
        .limit(1);

      if (existing) {
        if (!existing.source.deletedAt) {
          return toWorkspaceReferenceSource({
            ...existing,
            target: targetWorkspace,
            ...targetAddress,
          });
        }
        const [restored] = await transaction
          .update(sources)
          .set({
            deletedAt: null,
            purgedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(sources.id, existing.source.id))
          .returning();
        if (!restored) throw new Error("Workspace reference restoration returned no Source");
        return toWorkspaceReferenceSource({
          source: restored,
          reference: existing.reference,
          target: targetWorkspace,
          ...targetAddress,
        });
      }

      const [createdSource] = await transaction
        .insert(sources)
        .values({
          workspaceId,
          kind: "workspace_reference",
        })
        .returning();
      if (!createdSource) throw new Error("Workspace reference Source insert returned no row");
      const [createdReference] = await transaction
        .insert(workspaceReferenceSources)
        .values({
          sourceId: createdSource.id,
          sourceWorkspaceId: workspaceId,
          targetWorkspaceId,
        })
        .returning();
      if (!createdReference) throw new Error("Workspace reference insert returned no row");
      return toWorkspaceReferenceSource({
        source: createdSource,
        reference: createdReference,
        target: targetWorkspace,
        ...targetAddress,
      });
    });
  } catch (error) {
    if (error instanceof WorkspaceError) throw new SourceError("source_not_found");
    throw error;
  }
}

export async function listWorkspaceSources(
  actor: Actor,
  workspaceId: string,
  dependencies: SourceDatabaseDependencies = { db: database },
): Promise<Source[]> {
  requireUuid(workspaceId);
  let permissions: readonly WorkspacePermission[];
  if (dependencies.access?.workspaceId === workspaceId) {
    permissions = dependencies.access.permissions;
    if (!hasWorkspacePermission(permissions, "workspace.read")) {
      throw new SourceError("source_not_found");
    }
  } else {
    try {
      permissions = (
        await requireWorkspacePermission(actor, workspaceId, "workspace.read", dependencies.db)
      ).permissions;
    } catch {
      throw new SourceError("source_not_found");
    }
  }
  const fileRows = await dependencies.db
    .select({ source: sources, file: fileSources })
    .from(sources)
    .innerJoin(fileSources, eq(fileSources.sourceId, sources.id))
    .where(and(eq(sources.workspaceId, workspaceId), isNull(sources.deletedAt)))
    .orderBy(asc(sources.createdAt), asc(sources.id));
  const referenceRows = await dependencies.db
    .select({
      source: sources,
      reference: workspaceReferenceSources,
      target: workspaces,
      ownerHandle: principals.handle,
      slug: workspaceLocators.slug,
    })
    .from(sources)
    .innerJoin(workspaceReferenceSources, eq(workspaceReferenceSources.sourceId, sources.id))
    .innerJoin(workspaces, eq(workspaceReferenceSources.targetWorkspaceId, workspaces.id))
    .innerJoin(principals, eq(principals.id, workspaces.ownerId))
    .leftJoin(
      workspaceLocators,
      and(
        eq(workspaceLocators.workspaceId, workspaces.id),
        eq(workspaceLocators.state, "current"),
        isNull(workspaceLocators.replacedAt),
      ),
    )
    .where(and(eq(sources.workspaceId, workspaceId), isNull(sources.deletedAt)))
    .orderBy(asc(sources.createdAt), asc(sources.id));
  const artifactRows = await dependencies.db
    .select({
      source: sources,
      artifactSource: artifactSources,
      artifact: artifacts,
      revision: artifactRevisions,
    })
    .from(sources)
    .innerJoin(artifactSources, eq(artifactSources.sourceId, sources.id))
    .innerJoin(artifacts, eq(artifactSources.artifactId, artifacts.id))
    .innerJoin(
      artifactRevisions,
      and(
        eq(artifacts.currentRevisionId, artifactRevisions.id),
        eq(artifactRevisions.artifactId, artifacts.id),
      ),
    )
    .where(
      and(
        eq(sources.workspaceId, workspaceId),
        isNull(sources.deletedAt),
        isNull(artifacts.deletedAt),
      ),
    )
    .orderBy(asc(sources.createdAt), asc(sources.id));
  const ingestions = await latestSourceIngestions(
    fileRows.map((row) => row.source.id),
    dependencies.db,
  );
  const knowledgeIndexes = await latestSourceKnowledgeIndexes(
    [...fileRows, ...artifactRows].map((row) => row.source.id),
    dependencies.db,
  );
  const readableReferenceTargetIds = await resolveReadableWorkspaceIds(
    actor,
    referenceRows.map((row) => row.reference.targetWorkspaceId),
    dependencies.db,
    { requireReferenceable: true },
  );
  const canManageSources = hasWorkspacePermission(permissions, "source.manage");
  return [
    ...referenceRows.flatMap((row) => {
      if (readableReferenceTargetIds.has(row.reference.targetWorkspaceId)) {
        return [toWorkspaceReferenceSource(row)];
      }
      return canManageSources ? [toUnavailableWorkspaceReferenceSource(row)] : [];
    }),
    ...artifactRows.map((row) => toArtifactSource(row, knowledgeIndexes.get(row.source.id))),
    ...fileRows.map((row) =>
      toSource(row, ingestions.get(row.source.id) ?? null, knowledgeIndexes.get(row.source.id)),
    ),
  ];
}

export async function deleteSource(
  actor: Actor,
  sourceId: string,
  dependencies: SourceDeletionDependencies,
): Promise<SourceDeletionResult> {
  requireUuid(sourceId);
  await requireSourcePermission(actor, sourceId, "source.manage", dependencies.db);
  const cleanupPending = await dependencies.db.transaction(async (transaction) => {
    const [row] = await transaction
      .select({ source: sources })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for("update", { of: [sources] })
      .limit(1);
    if (!row) throw new SourceError("source_not_found");
    try {
      await requireWorkspacePermission(actor, row.source.workspaceId, "source.manage", transaction);
    } catch {
      throw new SourceError("source_not_found");
    }
    if (row.source.deletedAt) return row.source.kind === "uploaded_file";

    const deletedAt = dependencies.now();
    const [tombstoned] = await transaction
      .update(sources)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(sources.id, sourceId))
      .returning();
    if (!tombstoned) throw new Error("Source deletion returned no row");
    if (row.source.kind === "workspace_reference") return false;
    if (row.source.kind === "artifact") {
      await transaction.delete(artifactSources).where(eq(artifactSources.sourceId, sourceId));
      await dependencies.cleanupQueue.enqueue(transaction, sourceId);
      return true;
    }
    if (row.source.kind !== "uploaded_file") {
      throw new Error(`Unsupported Source kind: ${row.source.kind}`);
    }

    const [file] = await transaction
      .select()
      .from(fileSources)
      .where(eq(fileSources.sourceId, sourceId))
      .for("update")
      .limit(1);
    if (!file) throw new Error("Uploaded Source has no file row");
    await transaction
      .update(sourceIngestions)
      .set({
        state: "obsolete",
        providerBatchId: null,
        retryable: false,
        finishedAt: deletedAt,
        updatedAt: deletedAt,
      })
      .where(
        and(
          eq(sourceIngestions.sourceId, sourceId),
          inArray(sourceIngestions.state, ["queued", "processing"]),
        ),
      );
    await dependencies.cleanupQueue.enqueue(transaction, sourceId);
    return true;
  });

  return { cleanupPending };
}

export async function purgeDeletedSource(
  sourceId: string,
  dependencies: Pick<SourceServiceDependencies, "db" | "storage">,
): Promise<SourceDeletionResult> {
  const [deleted] = await dependencies.db
    .select({ source: sources, file: fileSources })
    .from(sources)
    .leftJoin(fileSources, eq(fileSources.sourceId, sources.id))
    .where(and(eq(sources.id, sourceId), isNotNull(sources.deletedAt)))
    .limit(1);
  if (!deleted) return { cleanupPending: false };
  let cleanupPending = false;
  if (deleted.file?.state === "stored") {
    if (deleted.file.storageKey && deleted.file.storageVersionId) {
      const reference = {
        key: deleted.file.storageKey,
        versionId: deleted.file.storageVersionId,
      };
      try {
        await dependencies.storage.deleteObjectVersion(reference);
        await dependencies.db
          .update(fileSources)
          .set({ storageKey: null, storageVersionId: null })
          .where(
            and(
              eq(fileSources.sourceId, sourceId),
              eq(fileSources.storageKey, reference.key),
              eq(fileSources.storageVersionId, reference.versionId),
            ),
          );
      } catch {
        cleanupPending = true;
      }
    }
  }

  if (deleted.file?.state === "pending_upload" && deleted.file.uploadKey) {
    const uploadKey = deleted.file.uploadKey;
    try {
      const inspected = await dependencies.storage.headObject({ key: uploadKey });
      if (inspected) await dependencies.storage.deleteObjectVersion(inspected);
      await dependencies.db
        .update(fileSources)
        .set({ uploadKey: null, uploadExpiresAt: null })
        .where(and(eq(fileSources.sourceId, sourceId), eq(fileSources.uploadKey, uploadKey)));
    } catch {
      cleanupPending = true;
    }
  }

  const results = await dependencies.db
    .select({
      id: sourceIngestions.id,
      key: sourceIngestions.resultStorageKey,
      versionId: sourceIngestions.resultStorageVersionId,
    })
    .from(sourceIngestions)
    .where(
      and(eq(sourceIngestions.sourceId, sourceId), isNotNull(sourceIngestions.resultStorageKey)),
    );
  for (const result of results) {
    if (!result.key || !result.versionId) continue;
    try {
      await dependencies.storage.deleteObjectVersion({
        key: result.key,
        versionId: result.versionId,
      });
      await dependencies.db
        .update(sourceIngestions)
        .set({
          state: "obsolete",
          providerBatchId: null,
          retryable: false,
          resultStorageKey: null,
          resultStorageVersionId: null,
          resultSha256: null,
          resultSizeBytes: null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(sourceIngestions.id, result.id),
            eq(sourceIngestions.resultStorageKey, result.key),
            eq(sourceIngestions.resultStorageVersionId, result.versionId),
          ),
        );
    } catch {
      cleanupPending = true;
    }
  }

  if (!cleanupPending) {
    await dependencies.db
      .update(sources)
      .set({ purgedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sources.id, sourceId), isNotNull(sources.deletedAt)));
  }
  return { cleanupPending };
}
