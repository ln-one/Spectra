import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import { fileSources, sources, workspaces } from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import { SourceError } from "./errors";
import { createS3SourceStorage } from "./s3-storage";
import type { SourceStorage } from "./storage";

type SourceUploadProxyDependencies = {
  db: Database;
  now: () => Date;
  storage: SourceStorage;
};

const uuidSchema = z.string().uuid();
let defaultStorage: SourceStorage | undefined;

function defaultDependencies(): SourceUploadProxyDependencies {
  defaultStorage ??= createS3SourceStorage();
  return { db: database, now: () => new Date(), storage: defaultStorage };
}

async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new SourceError("source_storage_unavailable");
  }
}

export async function uploadSourceObject(
  actor: Actor,
  sourceId: string,
  uploadGeneration: number,
  body: Uint8Array,
  contentType: string,
  dependencies: SourceUploadProxyDependencies = defaultDependencies(),
): Promise<void> {
  if (!uuidSchema.safeParse(sourceId).success) throw new SourceError("source_not_found");

  await dependencies.db.transaction(async (transaction) => {
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
    if (row.file.uploadGeneration !== uploadGeneration || body.byteLength !== row.file.sizeBytes) {
      throw new SourceError("source_upload_mismatch");
    }
    const uploadKey = row.file.uploadKey;
    if (row.file.state !== "pending_upload" || !uploadKey) {
      throw new SourceError("source_invalid_state");
    }
    if (!row.file.uploadExpiresAt || row.file.uploadExpiresAt <= dependencies.now()) {
      throw new SourceError("source_upload_expired");
    }
    await storageOperation(() =>
      dependencies.storage.putObject({ key: uploadKey, body, contentType }),
    );
  });
}
