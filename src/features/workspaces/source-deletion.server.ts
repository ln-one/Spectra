import "server-only";

import { type Database, database } from "@/database/client";
import type { Actor } from "@/features/identity/types";
import { createSourceCleanupQueue } from "@/features/maintenance/cleanup-dbos";
import { deleteSource } from "@/features/sources/service";

export function deleteWorkspaceSource(actor: Actor, sourceId: string, db: Database = database) {
  return deleteSource(actor, sourceId, {
    cleanupQueue: createSourceCleanupQueue(),
    db,
    now: () => new Date(),
  });
}
