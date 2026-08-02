import "server-only";

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { type Database, database } from "@/database/client";
import { fileSources, sourceIngestions, sources } from "@/database/schema";
import { createS3SourceStorage } from "../s3-storage";
import type { SourceStorage } from "../storage";
import type { SourceIngestionErrorCode } from "../types";
import {
  isSourceIngestionProvider,
  isSourceNativeTextExtension,
  sourceFileExtension,
  sourceMediaInput,
} from "../validation";
import { sourceAudioAnalysis, sourceVideoAnalysis } from "./media-result";
import {
  analyzeMedia,
  type MediaInput,
  MediaUnderstandingError,
  type MediaUnderstandingResult,
} from "./media-understanding";
import { createMinerUProvider, type MinerUProvider, MinerUProviderError } from "./mineru";
import { NativeTextError, parseNativeSourceFile } from "./native-text";

const SOURCE_INGESTION_ATTEMPT_TIMEOUT_MS = 10 * 60 * 1000;

export type IngestionFailure = {
  errorCode: SourceIngestionErrorCode;
  retryable: boolean;
};

export type SourceIngestionProcessorDependencies = {
  db: Database;
  storage: SourceStorage;
  provider: MinerUProvider;
  analyzeMedia: (
    input: MediaInput,
    options?: { signal?: AbortSignal },
  ) => Promise<MediaUnderstandingResult>;
  now: () => Date;
};

function defaultDependencies(): SourceIngestionProcessorDependencies {
  return {
    db: database,
    storage: createS3SourceStorage(),
    provider: createMinerUProvider(),
    analyzeMedia,
    now: () => new Date(),
  };
}

export function ingestionFailure(error: unknown): IngestionFailure {
  if (error instanceof MinerUProviderError) {
    return { errorCode: error.errorCode, retryable: error.retryable };
  }
  if (error instanceof MediaUnderstandingError) {
    return {
      errorCode: error.code,
      retryable:
        error.code === "media_rate_limited" ||
        error.code === "media_timeout" ||
        error.code === "media_unavailable" ||
        error.code === "media_aborted",
    };
  }
  if (error instanceof NativeTextError) {
    return { errorCode: error.code, retryable: false };
  }
  return { errorCode: "source_ingestion_unavailable", retryable: true };
}

async function ingestionWork(ingestionId: string, db: Database) {
  const [row] = await db
    .select({ ingestion: sourceIngestions, source: sources, file: fileSources })
    .from(sourceIngestions)
    .innerJoin(sources, eq(sourceIngestions.sourceId, sources.id))
    .innerJoin(fileSources, eq(fileSources.sourceId, sources.id))
    .where(eq(sourceIngestions.id, ingestionId))
    .limit(1);
  return row;
}

async function markObsolete(
  ingestionId: string,
  dependencies: SourceIngestionProcessorDependencies,
) {
  const now = dependencies.now();
  await dependencies.db
    .update(sourceIngestions)
    .set({
      state: "obsolete",
      providerBatchId: null,
      retryable: false,
      finishedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(sourceIngestions.id, ingestionId),
        inArray(sourceIngestions.state, ["queued", "processing"]),
      ),
    );
}

export async function markSourceIngestionFailed(
  ingestionId: string,
  failure: IngestionFailure,
  dependencies: Pick<SourceIngestionProcessorDependencies, "db" | "now"> = defaultDependencies(),
) {
  const now = dependencies.now();
  await dependencies.db
    .update(sourceIngestions)
    .set({
      state: "failed",
      providerBatchId: null,
      retryable: failure.retryable,
      errorCode: failure.errorCode,
      finishedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(sourceIngestions.id, ingestionId),
        inArray(sourceIngestions.state, ["queued", "processing"]),
      ),
    );
}

export async function submitSourceIngestion(
  ingestionId: string,
  dependencies: SourceIngestionProcessorDependencies = defaultDependencies(),
) {
  const work = await ingestionWork(ingestionId, dependencies.db);
  if (work?.ingestion.state !== "queued") return;
  if (work.source.deletedAt) {
    await markObsolete(ingestionId, dependencies);
    return;
  }
  if (work.file.state !== "stored" || !work.file.storageKey || !work.file.storageVersionId) {
    await markSourceIngestionFailed(
      ingestionId,
      { errorCode: "source_not_stored", retryable: false },
      dependencies,
    );
    return;
  }
  const provider = work.ingestion.provider;
  if (!isSourceIngestionProvider(provider)) {
    throw new Error(`Unsupported source ingestion provider: ${provider}`);
  }
  switch (provider) {
    case "media_understanding":
      await submitMediaIngestion(
        work,
        { key: work.file.storageKey, versionId: work.file.storageVersionId },
        dependencies,
      );
      return;
    case "native_text":
      await submitNativeTextIngestion(
        work,
        { key: work.file.storageKey, versionId: work.file.storageVersionId },
        dependencies,
      );
      return;
    case "mineru":
      break;
    default:
      provider satisfies never;
      throw new Error(`Unsupported source ingestion provider: ${provider}`);
  }

  const directory = await mkdtemp(join(tmpdir(), "spectra-ingestion-"));
  const filePath = join(directory, work.file.originalFilename);
  try {
    await dependencies.storage.downloadObjectToFile(
      { key: work.file.storageKey, versionId: work.file.storageVersionId },
      filePath,
    );
    const submissionStartedAt = dependencies.now();
    const [submission] = await dependencies.db
      .update(sourceIngestions)
      .set({ providerSubmissionStartedAt: submissionStartedAt, updatedAt: submissionStartedAt })
      .where(
        and(
          eq(sourceIngestions.id, ingestionId),
          eq(sourceIngestions.state, "queued"),
          isNull(sourceIngestions.providerSubmissionStartedAt),
        ),
      )
      .returning({ id: sourceIngestions.id });
    if (!submission) {
      const current = await ingestionWork(ingestionId, dependencies.db);
      if (
        current?.ingestion.state === "queued" &&
        current.ingestion.providerSubmissionStartedAt &&
        !current.ingestion.providerBatchId
      ) {
        await markSourceIngestionFailed(
          ingestionId,
          { errorCode: "provider_submission_unknown", retryable: true },
          dependencies,
        );
      }
      return;
    }
    let batchId: string;
    try {
      batchId = await dependencies.provider.submit(filePath, ingestionId);
    } catch {
      await markSourceIngestionFailed(
        ingestionId,
        { errorCode: "provider_submission_unknown", retryable: true },
        dependencies,
      );
      return;
    }
    const now = dependencies.now();
    await dependencies.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ ingestion: sourceIngestions, deletedAt: sources.deletedAt })
        .from(sourceIngestions)
        .innerJoin(sources, eq(sourceIngestions.sourceId, sources.id))
        .where(eq(sourceIngestions.id, ingestionId))
        .for("update", { of: [sourceIngestions, sources] })
        .limit(1);
      if (current?.ingestion.state !== "queued") return;
      if (current.deletedAt) {
        await transaction
          .update(sourceIngestions)
          .set({ state: "obsolete", providerBatchId: null, finishedAt: now, updatedAt: now })
          .where(eq(sourceIngestions.id, ingestionId));
        return;
      }
      await transaction
        .update(sourceIngestions)
        .set({
          state: "processing",
          providerBatchId: batchId,
          startedAt: now,
          updatedAt: now,
        })
        .where(eq(sourceIngestions.id, ingestionId));
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function archiveResult(
  sourceId: string,
  ingestionId: string,
  bytes: Uint8Array,
  extension: "zip" | "json",
  contentType: "application/zip" | "application/json",
  storage: SourceStorage,
) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `sources/${sourceId}/ingestions/${ingestionId}/${sha256}.${extension}`;
  const existing = await storage.headObject({ key });
  if (existing) {
    if (existing.sizeBytes !== bytes.byteLength) {
      throw new Error("Existing ingestion result size does not match its content key");
    }
    return { object: existing, sha256, sizeBytes: bytes.byteLength };
  }
  const object = await storage.putObject({
    key,
    body: bytes,
    contentType,
  });
  return { object, sha256, sizeBytes: bytes.byteLength };
}

async function publishReadyResult(
  ingestionId: string,
  archived: Awaited<ReturnType<typeof archiveResult>>,
  dependencies: SourceIngestionProcessorDependencies,
) {
  const now = dependencies.now();
  const published = await dependencies.db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ state: sourceIngestions.state, deletedAt: sources.deletedAt })
      .from(sourceIngestions)
      .innerJoin(sources, eq(sourceIngestions.sourceId, sources.id))
      .where(eq(sourceIngestions.id, ingestionId))
      .for("update", { of: [sourceIngestions, sources] })
      .limit(1);
    if (current?.state !== "processing") return false;
    if (current.deletedAt) {
      await transaction
        .update(sourceIngestions)
        .set({ state: "obsolete", providerBatchId: null, finishedAt: now, updatedAt: now })
        .where(eq(sourceIngestions.id, ingestionId));
      return false;
    }
    const [ready] = await transaction
      .update(sourceIngestions)
      .set({
        state: "ready",
        retryable: false,
        resultStorageKey: archived.object.key,
        resultStorageVersionId: archived.object.versionId,
        resultSha256: archived.sha256,
        resultSizeBytes: archived.sizeBytes,
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(eq(sourceIngestions.id, ingestionId), eq(sourceIngestions.state, "processing")))
      .returning({ id: sourceIngestions.id });
    return Boolean(ready);
  });
  if (!published) await deleteUnpublishedResult(ingestionId, archived.object, dependencies);
}

async function submitMediaIngestion(
  work: NonNullable<Awaited<ReturnType<typeof ingestionWork>>>,
  sourceReference: { key: string; versionId: string },
  dependencies: SourceIngestionProcessorDependencies,
) {
  const mediaInput = sourceMediaInput(work.file.originalFilename);
  if (!mediaInput) {
    throw new MediaUnderstandingError("media_input_rejected");
  }
  const now = dependencies.now();
  const [started] = await dependencies.db
    .update(sourceIngestions)
    .set({ state: "processing", startedAt: now, updatedAt: now })
    .where(and(eq(sourceIngestions.id, work.ingestion.id), eq(sourceIngestions.state, "queued")))
    .returning({ id: sourceIngestions.id });
  if (!started) return;

  try {
    const { url } = await dependencies.storage.createDownloadUrl({
      reference: sourceReference,
      expiresInSeconds: 10 * 60,
    });
    const result = await dependencies.analyzeMedia(
      mediaInput.kind === "video"
        ? { kind: "video", url }
        : { kind: "audio", url, format: mediaInput.format },
    );
    const normalized =
      mediaInput.kind === "video"
        ? sourceVideoAnalysis(mediaInput.format, result)
        : sourceAudioAnalysis(mediaInput.format, result);
    const bytes = new TextEncoder().encode(JSON.stringify(normalized));
    const archived = await archiveResult(
      work.source.id,
      work.ingestion.id,
      bytes,
      "json",
      "application/json",
      dependencies.storage,
    );
    await publishReadyResult(work.ingestion.id, archived, dependencies);
  } catch (error) {
    if (ingestionFailure(error).retryable) {
      const retryAt = dependencies.now();
      await dependencies.db
        .update(sourceIngestions)
        .set({ state: "queued", startedAt: null, updatedAt: retryAt })
        .where(
          and(eq(sourceIngestions.id, work.ingestion.id), eq(sourceIngestions.state, "processing")),
        );
    }
    throw error;
  }
}

async function submitNativeTextIngestion(
  work: NonNullable<Awaited<ReturnType<typeof ingestionWork>>>,
  sourceReference: { key: string; versionId: string },
  dependencies: SourceIngestionProcessorDependencies,
) {
  const extension = sourceFileExtension(work.file.originalFilename);
  if (!isSourceNativeTextExtension(extension)) {
    throw new NativeTextError();
  }
  const now = dependencies.now();
  const [started] = await dependencies.db
    .update(sourceIngestions)
    .set({ state: "processing", startedAt: now, updatedAt: now })
    .where(and(eq(sourceIngestions.id, work.ingestion.id), eq(sourceIngestions.state, "queued")))
    .returning({ id: sourceIngestions.id });
  if (!started) return;

  const directory = await mkdtemp(join(tmpdir(), "spectra-native-ingestion-"));
  const filePath = join(directory, work.file.originalFilename);
  try {
    await dependencies.storage.downloadObjectToFile(sourceReference, filePath);
    const normalized = await parseNativeSourceFile(extension, await readFile(filePath));
    const bytes = new TextEncoder().encode(JSON.stringify(normalized));
    const archived = await archiveResult(
      work.source.id,
      work.ingestion.id,
      bytes,
      "json",
      "application/json",
      dependencies.storage,
    );
    await publishReadyResult(work.ingestion.id, archived, dependencies);
  } catch (error) {
    if (ingestionFailure(error).retryable) {
      const retryAt = dependencies.now();
      await dependencies.db
        .update(sourceIngestions)
        .set({ state: "queued", startedAt: null, updatedAt: retryAt })
        .where(
          and(eq(sourceIngestions.id, work.ingestion.id), eq(sourceIngestions.state, "processing")),
        );
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function deleteUnpublishedResult(
  ingestionId: string,
  object: { key: string; versionId: string },
  dependencies: Pick<SourceIngestionProcessorDependencies, "db" | "storage">,
) {
  try {
    const [current] = await dependencies.db
      .select({
        key: sourceIngestions.resultStorageKey,
        versionId: sourceIngestions.resultStorageVersionId,
      })
      .from(sourceIngestions)
      .where(eq(sourceIngestions.id, ingestionId))
      .limit(1);
    if (current?.key === object.key && current.versionId === object.versionId) return;
  } catch {
    return;
  }
  await dependencies.storage.deleteObjectVersion(object).catch(() => undefined);
}

export async function pollSourceIngestion(
  ingestionId: string,
  dependencies: SourceIngestionProcessorDependencies = defaultDependencies(),
) {
  const work = await ingestionWork(ingestionId, dependencies.db);
  if (work?.ingestion.state !== "processing" || !work.ingestion.providerBatchId) return;
  if (work.source.deletedAt) {
    await markObsolete(ingestionId, dependencies);
    return;
  }
  if (
    !work.ingestion.startedAt ||
    dependencies.now().getTime() - work.ingestion.startedAt.getTime() >=
      SOURCE_INGESTION_ATTEMPT_TIMEOUT_MS
  ) {
    await markSourceIngestionFailed(
      ingestionId,
      { errorCode: "mineru_timeout", retryable: true },
      dependencies,
    );
    return;
  }

  const result = await dependencies.provider.poll(work.ingestion.providerBatchId);
  if (result.kind === "failed") {
    await markSourceIngestionFailed(ingestionId, result, dependencies);
    return;
  }
  if (result.kind === "pending") {
    const now = dependencies.now();
    await dependencies.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select({
          state: sourceIngestions.state,
          startedAt: sourceIngestions.startedAt,
          deletedAt: sources.deletedAt,
        })
        .from(sourceIngestions)
        .innerJoin(sources, eq(sourceIngestions.sourceId, sources.id))
        .where(eq(sourceIngestions.id, ingestionId))
        .for("update", { of: [sourceIngestions, sources] })
        .limit(1);
      if (current?.state !== "processing" || current.deletedAt) return;
      if (
        !current.startedAt ||
        now.getTime() - current.startedAt.getTime() >= SOURCE_INGESTION_ATTEMPT_TIMEOUT_MS
      ) {
        await transaction
          .update(sourceIngestions)
          .set({
            state: "failed",
            providerBatchId: null,
            retryable: true,
            errorCode: "mineru_timeout",
            finishedAt: now,
            updatedAt: now,
          })
          .where(eq(sourceIngestions.id, ingestionId));
        return;
      }
    });
    return;
  }

  const archived = await archiveResult(
    work.source.id,
    ingestionId,
    result.zipBytes,
    "zip",
    "application/zip",
    dependencies.storage,
  );
  await publishReadyResult(ingestionId, archived, dependencies);
}
