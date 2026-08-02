import "server-only";

import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { type Database, database } from "@/database/client";
import { sourceIngestions, sources } from "@/database/schema";
import type { SourceCleanupOperations } from "./cleanup";
import { createS3SourceStorage } from "./s3-storage";
import { purgeDeletedSource } from "./service";
import type { SourceStorage } from "./storage";

export function createSourceCleanupOperations(
  db: Database = database,
  initialStorage?: SourceStorage,
): SourceCleanupOperations {
  let storage = initialStorage;
  return {
    async listUnpurgedSourceIds(afterId, limit) {
      const rows = await db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(
            isNotNull(sources.deletedAt),
            isNull(sources.purgedAt),
            afterId ? gt(sources.id, afterId) : undefined,
          ),
        )
        .orderBy(asc(sources.id))
        .limit(limit);
      return rows.map((row) => row.id);
    },
    async listWorkflowIds(sourceId) {
      const rows = await db
        .select({ id: sourceIngestions.id })
        .from(sourceIngestions)
        .where(eq(sourceIngestions.sourceId, sourceId));
      return rows.map((row) => row.id);
    },
    async purgeDeletedSource(sourceId) {
      const [owned] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.id, sourceId), isNotNull(sources.deletedAt)))
        .limit(1);
      if (!owned) return { kind: "already_absent" };
      storage ??= createS3SourceStorage();
      const result = await purgeDeletedSource(sourceId, { db, storage });
      return { kind: "found", cleanupPending: result.cleanupPending };
    },
  };
}
