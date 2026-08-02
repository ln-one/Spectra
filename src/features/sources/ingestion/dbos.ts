import "server-only";

import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/database/client";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";

export const SOURCE_INGESTION_DBOS_QUEUE = "source-ingestion";
export const SOURCE_INGESTION_DBOS_WORKFLOW = "ingestSource";
export const SOURCE_INGESTION_POLL_DELAY_MS = 5_000;

export interface SourceIngestionQueue {
  enqueue(transaction: DatabaseTransaction, ingestionId: string): Promise<void>;
}

async function enqueueSourceIngestion(transaction: DatabaseTransaction, ingestionId: string) {
  const result = await transaction.execute<{ workflowId: string }>(sql`
    SELECT ${sql.identifier(ARTIFACT_DBOS_SCHEMA)}.enqueue_workflow(
      workflow_name => ${SOURCE_INGESTION_DBOS_WORKFLOW},
      queue_name => ${SOURCE_INGESTION_DBOS_QUEUE},
      positional_args => ARRAY[${JSON.stringify(ingestionId)}::json],
      workflow_id => ${ingestionId}
    ) AS "workflowId"
  `);
  if (result.rows[0]?.workflowId !== ingestionId) {
    throw new Error("Source ingestion DBOS workflow was not created");
  }
}

export function createSourceIngestionQueue(): SourceIngestionQueue {
  return { enqueue: enqueueSourceIngestion };
}
