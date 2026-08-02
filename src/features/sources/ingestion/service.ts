import "server-only";

import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import { fileSources, sourceIngestions, sources, workspaces } from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import { requireWorkspacePermission } from "@/features/workspaces/access.server";
import { SourceError } from "../errors";
import {
  type SourceIngestion,
  type SourceIngestionErrorCode,
  type SourceIngestionState,
  sourceIngestionErrorCodes,
} from "../types";
import {
  isSourceIngestionProvider,
  type SourceIngestionProvider,
  sourceIngestionProvider,
} from "../validation";
import { createSourceIngestionQueue, type SourceIngestionQueue } from "./dbos";

const ingestionErrorCodeSchema = z.enum(sourceIngestionErrorCodes).nullable();

function isActiveIngestionState(value: string) {
  return value === "queued" || value === "processing" || value === "ready";
}

export type SourceIngestionServiceDependencies = {
  db: Database;
  queue: SourceIngestionQueue;
  now: () => Date;
  randomId: () => string;
};

function ingestionState(value: string): SourceIngestionState {
  if (
    value === "queued" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed" ||
    value === "obsolete"
  ) {
    return value;
  }
  throw new Error(`Unsupported source ingestion state: ${value}`);
}

function ingestionErrorCode(value: string | null): SourceIngestionErrorCode | null {
  return ingestionErrorCodeSchema.parse(value);
}

function ingestionProvider(value: string): SourceIngestionProvider {
  if (isSourceIngestionProvider(value)) return value;
  throw new Error(`Unsupported source ingestion provider: ${value}`);
}

function toSourceIngestion(row: typeof sourceIngestions.$inferSelect): SourceIngestion {
  return {
    id: row.id,
    provider: ingestionProvider(row.provider),
    state: ingestionState(row.state),
    attemptNumber: row.attemptNumber,
    retryable: row.retryable,
    errorCode: ingestionErrorCode(row.errorCode),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function latestSourceIngestions(
  sourceIds: string[],
  db: Database = database,
): Promise<Map<string, SourceIngestion>> {
  if (sourceIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([sourceIngestions.sourceId])
    .from(sourceIngestions)
    .where(inArray(sourceIngestions.sourceId, sourceIds))
    .orderBy(
      sourceIngestions.sourceId,
      desc(sourceIngestions.attemptNumber),
      desc(sourceIngestions.createdAt),
      desc(sourceIngestions.id),
    );
  return new Map(rows.map((row) => [row.sourceId, toSourceIngestion(row)]));
}

export async function startSourceIngestion(
  actor: Actor,
  sourceId: string,
  dependencies: SourceIngestionServiceDependencies = {
    db: database,
    queue: createSourceIngestionQueue(),
    now: () => new Date(),
    randomId: randomUUID,
  },
): Promise<SourceIngestion> {
  const [candidate] = await dependencies.db
    .select({ workspaceId: sources.workspaceId })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!candidate) throw new SourceError("source_not_found");
  try {
    await requireWorkspacePermission(
      actor,
      candidate.workspaceId,
      "source.manage",
      dependencies.db,
    );
  } catch {
    throw new SourceError("source_not_found");
  }
  return dependencies.db.transaction(async (transaction) => {
    const [source] = await transaction
      .select({ source: sources, file: fileSources, ownerId: workspaces.ownerId })
      .from(sources)
      .innerJoin(fileSources, eq(fileSources.sourceId, sources.id))
      .innerJoin(workspaces, eq(sources.workspaceId, workspaces.id))
      .where(eq(sources.id, sourceId))
      .for("update", { of: [sources] })
      .limit(1);
    if (!source || source.source.deletedAt || source.ownerId !== actor.principalId) {
      throw new SourceError("source_not_found");
    }
    if (source.file.state !== "stored") throw new SourceError("source_invalid_state");
    const provider = sourceIngestionProvider(source.file.originalFilename);
    if (!provider) throw new SourceError("source_invalid_state");

    const [latest] = await transaction
      .select()
      .from(sourceIngestions)
      .where(eq(sourceIngestions.sourceId, sourceId))
      .orderBy(desc(sourceIngestions.attemptNumber))
      .limit(1);
    if (latest && isActiveIngestionState(latest.state)) {
      return toSourceIngestion(latest);
    }
    if (latest?.state === "failed" && !latest.retryable) {
      throw new SourceError("source_invalid_state");
    }

    const now = dependencies.now();
    const [created] = await transaction
      .insert(sourceIngestions)
      .values({
        id: dependencies.randomId(),
        sourceId,
        sourceRevision: 1,
        provider,
        attemptNumber: (latest?.attemptNumber ?? 0) + 1,
        state: "queued",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!created) throw new Error("Source ingestion insert returned no row");
    await dependencies.queue.enqueue(transaction, created.id);
    return toSourceIngestion(created);
  });
}
