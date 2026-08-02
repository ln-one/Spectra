import "server-only";

import { createArtifactGenerationDbosQueue } from "../dbos-queue.server";
import {
  type StructuredGenerationQueue,
  structuredGenerationJobSchema,
} from "../structured-generation-queue";

export const QUIZ_DBOS_QUEUE = "quiz-generation";
export const QUIZ_DBOS_WORKFLOW = "generateQuiz";

export function createQuizDbosQueue(): StructuredGenerationQueue {
  return createArtifactGenerationDbosQueue({
    errorLabel: "Quiz",
    jobSchema: structuredGenerationJobSchema,
    queueName: QUIZ_DBOS_QUEUE,
    workflowName: QUIZ_DBOS_WORKFLOW,
  });
}
