import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseTransaction } from "@/database/client";
import { ARTIFACT_DBOS_SCHEMA } from "../dbos-queue.server";

export const TASK_AGENT_AUTHORING_DBOS_QUEUE = "artifact-task-agent-authoring";

const taskAgentGenerationJobSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationAttemptId: z.string().uuid(),
  })
  .strict();

type TaskAgentGenerationJob = z.infer<typeof taskAgentGenerationJobSchema>;

export interface TaskAgentGenerationQueue {
  enqueue(transaction: DatabaseTransaction, job: TaskAgentGenerationJob): Promise<void>;
}

export function createTaskAgentDbosQueue(
  workflowName: string,
  workflowCreationError: string,
): TaskAgentGenerationQueue {
  return {
    async enqueue(transaction, job) {
      const payload = taskAgentGenerationJobSchema.parse(job);
      const result = await transaction.execute<{ workflowId: string }>(sql`
        SELECT ${sql.identifier(ARTIFACT_DBOS_SCHEMA)}.enqueue_workflow(
          workflow_name => ${workflowName},
          queue_name => ${TASK_AGENT_AUTHORING_DBOS_QUEUE},
          positional_args => ARRAY[${JSON.stringify(payload.artifactId)}::json, ${JSON.stringify(payload.generationAttemptId)}::json],
          workflow_id => ${payload.generationAttemptId}
        ) AS "workflowId"
      `);
      if (result.rows[0]?.workflowId !== payload.generationAttemptId) {
        throw new Error(workflowCreationError);
      }
    },
  };
}
