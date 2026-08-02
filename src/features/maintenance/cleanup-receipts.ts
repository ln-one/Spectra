import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/database/client";
import { cleanupReceipts } from "@/database/schema";

export type CleanupOutcome = "already_absent" | "deleted" | "failed" | "not_owned";

export async function recordCleanupReceipt(
  db: Database,
  input: {
    failureCode?: string | null;
    outcome: CleanupOutcome;
    owner: string;
    resourceId: string;
    resourceType: string;
    scopeId: string;
    scopeType: "artifact" | "conversation" | "source";
  },
) {
  const [receipt] = await db
    .insert(cleanupReceipts)
    .values({
      failureCode: input.failureCode ?? null,
      outcome: input.outcome,
      owner: input.owner,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      scopeId: input.scopeId,
      scopeType: input.scopeType,
    })
    .onConflictDoUpdate({
      set: {
        attemptNumber: sql`${cleanupReceipts.attemptNumber} + 1`,
        completedAt: new Date(),
        failureCode: input.failureCode ?? null,
        outcome: input.outcome,
        updatedAt: new Date(),
      },
      target: [
        cleanupReceipts.scopeType,
        cleanupReceipts.scopeId,
        cleanupReceipts.owner,
        cleanupReceipts.resourceType,
        cleanupReceipts.resourceId,
      ],
    })
    .returning();
  return receipt;
}

export async function cleanupScopeHasFailure(
  db: Database,
  input: { scopeId: string; scopeType: "artifact" | "conversation" | "source" },
) {
  const [failure] = await db
    .select({ id: cleanupReceipts.id })
    .from(cleanupReceipts)
    .where(
      and(
        eq(cleanupReceipts.scopeType, input.scopeType),
        eq(cleanupReceipts.scopeId, input.scopeId),
        eq(cleanupReceipts.outcome, "failed"),
      ),
    )
    .limit(1);
  return Boolean(failure);
}
