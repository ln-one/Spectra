import "server-only";

import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/database/client";
import { DBOS_MAINTENANCE_QUEUE } from "@/database/dbos";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import type { SourceCleanupQueue } from "@/features/sources/cleanup";

export { DBOS_MAINTENANCE_QUEUE };

export const ARTIFACT_CLEANUP_WORKFLOW = "cleanupArtifact";
export const CONVERSATION_CLEANUP_WORKFLOW = "cleanupConversation";
export const SOURCE_CLEANUP_WORKFLOW = "cleanupSource";

async function enqueueCleanup(
  transaction: DatabaseTransaction,
  workflowName: string,
  workflowId: string,
  entityId: string,
) {
  const result = await transaction.execute<{ workflowId: string }>(sql`
    SELECT ${sql.identifier(ARTIFACT_DBOS_SCHEMA)}.enqueue_workflow(
      workflow_name => ${workflowName},
      queue_name => ${DBOS_MAINTENANCE_QUEUE},
      positional_args => ARRAY[${JSON.stringify(entityId)}::json],
      workflow_id => ${workflowId}
    ) AS "workflowId"
  `);
  if (result.rows[0]?.workflowId !== workflowId) {
    throw new Error(`${workflowName} DBOS workflow was not created`);
  }
}

export interface ArtifactCleanupQueue {
  enqueue(transaction: DatabaseTransaction, artifactId: string): Promise<void>;
}

export interface ConversationCleanupQueue {
  enqueue(
    transaction: DatabaseTransaction,
    input: { conversationId: string; workspaceId: string },
  ): Promise<void>;
}

export function createConversationCleanupQueue(): ConversationCleanupQueue {
  return {
    async enqueue(transaction, input) {
      const workflowId = `cleanup:conversation:${input.workspaceId}:${input.conversationId}`;
      const result = await transaction.execute<{ workflowId: string }>(sql`
        SELECT ${sql.identifier(ARTIFACT_DBOS_SCHEMA)}.enqueue_workflow(
          workflow_name => ${CONVERSATION_CLEANUP_WORKFLOW},
          queue_name => ${DBOS_MAINTENANCE_QUEUE},
          positional_args => ARRAY[
            ${JSON.stringify(input.workspaceId)}::json,
            ${JSON.stringify(input.conversationId)}::json
          ],
          workflow_id => ${workflowId}
        ) AS "workflowId"
      `);
      if (result.rows[0]?.workflowId !== workflowId) {
        throw new Error("Conversation cleanup DBOS workflow was not created");
      }
    },
  };
}

export function createArtifactCleanupQueue(): ArtifactCleanupQueue {
  return {
    enqueue: (transaction, artifactId) =>
      enqueueCleanup(
        transaction,
        ARTIFACT_CLEANUP_WORKFLOW,
        `cleanup:artifact:${artifactId}`,
        artifactId,
      ),
  };
}

export function createSourceCleanupQueue(): SourceCleanupQueue {
  return {
    enqueue: (transaction, sourceId) =>
      enqueueCleanup(transaction, SOURCE_CLEANUP_WORKFLOW, `cleanup:source:${sourceId}`, sourceId),
  };
}
