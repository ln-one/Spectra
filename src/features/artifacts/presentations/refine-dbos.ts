import "server-only";

import type { DBOSClient } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { productPool } from "@/database/client";
import { artifactDbosClient } from "@/features/artifacts/dbos-client.server";
import {
  type PresentationRefinementEvent,
  type PresentationRefinementWorkflowInput,
  presentationRefinementEventSchema,
  presentationRefinementWorkflowInputSchema,
} from "./refine-dbos-contract.server";

export const PRESENTATION_REFINEMENT_DBOS_QUEUE = "presentation-refinement";
export const PRESENTATION_REFINEMENT_DBOS_WORKFLOW = "refinePresentationPptdV1";

export function presentationRefinementStreamKey(runId: string) {
  return `presentation-refinement:${runId}`;
}

type RefinementQueueClient = Pick<Pool, "query">;

export async function enqueuePresentationRefinementWorkflow(
  rawInput: PresentationRefinementWorkflowInput,
  client: RefinementQueueClient = productPool,
) {
  const input = presentationRefinementWorkflowInputSchema.parse(rawInput);
  const result = await client.query<{ workflowId: string }>(
    `SELECT dbos.enqueue_workflow(
       workflow_name => $1,
       queue_name => $2,
       positional_args => ARRAY[$3::json],
       workflow_id => $4
     ) AS "workflowId"`,
    [
      PRESENTATION_REFINEMENT_DBOS_WORKFLOW,
      PRESENTATION_REFINEMENT_DBOS_QUEUE,
      JSON.stringify(input),
      input.runId,
    ],
  );
  if (result.rows[0]?.workflowId !== input.runId) {
    throw new Error("presentation_refinement_workflow_not_created");
  }
  return input.runId;
}

export async function readPresentationRefinementEvents(
  runId: string,
  getClient: () => Promise<Pick<DBOSClient, "readStream">> = artifactDbosClient,
): Promise<AsyncGenerator<PresentationRefinementEvent, void, void>> {
  const client = await getClient();
  const source = client.readStream<string>(runId, presentationRefinementStreamKey(runId));
  return (async function* readEvents() {
    try {
      for await (const value of source) {
        if (typeof value !== "string") throw new Error("presentation_refinement_event_invalid");
        yield presentationRefinementEventSchema.parse(JSON.parse(value));
      }
    } finally {
      await source.return(undefined);
    }
  })();
}
