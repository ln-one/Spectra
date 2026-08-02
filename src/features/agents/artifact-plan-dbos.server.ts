import "server-only";

import type { DBOSClient } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { productPool } from "@/database/client";
import { artifactDbosClient } from "@/features/artifacts/dbos-client.server";
import {
  type ArtifactPlanEvent,
  type ArtifactPlanWorkflowInput,
  artifactPlanEventSchema,
  artifactPlanWorkflowInputSchema,
} from "./artifact-plan-dbos-contract.server";

export const ARTIFACT_PLAN_DBOS_QUEUE = "workspace_artifact_plan";
export const ARTIFACT_PLAN_DBOS_WORKFLOW = "workspaceArtifactPlanWorkflow";

export function artifactPlanDbosStreamKey(workflowId: string) {
  return `artifact-plan:${workflowId}`;
}

type ArtifactPlanQueueClient = Pick<Pool, "query">;

export async function enqueueArtifactPlanWorkflow(
  rawInput: ArtifactPlanWorkflowInput,
  client: ArtifactPlanQueueClient = productPool,
) {
  const input = artifactPlanWorkflowInputSchema.parse(rawInput);
  const result = await client.query<{ workflowId: string }>(
    `SELECT dbos.enqueue_workflow(
       workflow_name => $1,
       queue_name => $2,
       positional_args => ARRAY[$3::json],
       workflow_id => $4
     ) AS "workflowId"`,
    [
      ARTIFACT_PLAN_DBOS_WORKFLOW,
      ARTIFACT_PLAN_DBOS_QUEUE,
      JSON.stringify(input),
      input.workflowId,
    ],
  );
  if (result.rows[0]?.workflowId !== input.workflowId) {
    throw new Error("artifact_plan_workflow_not_created");
  }
  return input.workflowId;
}

export async function readArtifactPlanEvents(
  workflowId: string,
  getClient: () => Promise<Pick<DBOSClient, "readStream">> = artifactDbosClient,
): Promise<AsyncGenerator<ArtifactPlanEvent, void, void>> {
  const client = await getClient();
  const source = client.readStream<string>(workflowId, artifactPlanDbosStreamKey(workflowId));
  return (async function* readEvents() {
    try {
      for await (const value of source) {
        if (typeof value !== "string") throw new Error("artifact_plan_event_invalid");
        yield artifactPlanEventSchema.parse(JSON.parse(value));
      }
    } finally {
      await source.return(undefined);
    }
  })();
}
