import "server-only";

import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/database/client";

export const ARTIFACT_DBOS_SCHEMA = "dbos";

type ArtifactGenerationJob = {
  artifactId: string;
  generationAttemptId: string;
};

type JobSchema<Job> = {
  parse(value: unknown): Job;
};

export function createArtifactGenerationDbosQueue<Job extends ArtifactGenerationJob>(input: {
  errorLabel: string;
  jobSchema: JobSchema<Job>;
  queueName: string;
  workflowName: string;
}) {
  return {
    async enqueue(transaction: DatabaseTransaction, job: Job) {
      const payload = input.jobSchema.parse(job);
      const result = await transaction.execute<{ workflowId: string }>(sql`
        SELECT ${sql.identifier(ARTIFACT_DBOS_SCHEMA)}.enqueue_workflow(
          workflow_name => ${input.workflowName},
          queue_name => ${input.queueName},
          positional_args => ARRAY[${JSON.stringify(payload.artifactId)}::json, ${JSON.stringify(payload.generationAttemptId)}::json],
          workflow_id => ${payload.generationAttemptId}
        ) AS "workflowId"
      `);
      if (result.rows[0]?.workflowId !== payload.generationAttemptId) {
        throw new Error(`${input.errorLabel} DBOS workflow was not created`);
      }
    },
  };
}
