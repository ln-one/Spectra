import type { DatabaseTransaction } from "@/database/client";

export interface SourceCleanupQueue {
  enqueue(transaction: DatabaseTransaction, sourceId: string): Promise<void>;
}

export interface SourceCleanupOperations {
  listUnpurgedSourceIds(afterId: string | null, limit: number): Promise<string[]>;
  listWorkflowIds(sourceId: string): Promise<string[]>;
  purgeDeletedSource(
    sourceId: string,
  ): Promise<{ kind: "already_absent" } | { kind: "found"; cleanupPending: boolean }>;
}
