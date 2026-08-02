import "server-only";

import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/database/client";
import { ARTIFACT_DBOS_SCHEMA } from "./dbos-queue.server";

export const ARTIFACT_RENDER_DBOS_QUEUE = "artifact-render";
export const ARTIFACT_RENDER_DBOS_WORKFLOW = "renderArtifactRevision";

export function artifactRenderWorkflowId(renderJobId: string, attemptNumber: number) {
  return `render:${renderJobId}:${attemptNumber}`;
}

export async function enqueueArtifactRender(
  transaction: DatabaseTransaction,
  renderJobId: string,
  attemptNumber: number,
) {
  const workflowId = artifactRenderWorkflowId(renderJobId, attemptNumber);
  const result = await transaction.execute<{ workflowId: string }>(sql`
    SELECT ${sql.identifier(ARTIFACT_DBOS_SCHEMA)}.enqueue_workflow(
      workflow_name => ${ARTIFACT_RENDER_DBOS_WORKFLOW},
      queue_name => ${ARTIFACT_RENDER_DBOS_QUEUE},
      positional_args => ARRAY[${JSON.stringify(renderJobId)}::json, ${JSON.stringify(attemptNumber)}::json],
      workflow_id => ${workflowId}
    ) AS "workflowId"
  `);
  if (result.rows[0]?.workflowId !== workflowId) {
    throw new Error("Artifact render workflow was not created");
  }
}
