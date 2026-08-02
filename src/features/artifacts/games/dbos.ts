import "server-only";

import { createArtifactGenerationDbosQueue } from "../dbos-queue.server";
import {
  type StructuredGenerationQueue,
  structuredGenerationJobSchema,
} from "../structured-generation-queue";

export const GAME_DBOS_QUEUE = "game-generation";
export const GAME_DBOS_WORKFLOW = "generateGame";

export function createGameDbosQueue(): StructuredGenerationQueue {
  return createArtifactGenerationDbosQueue({
    errorLabel: "Game",
    jobSchema: structuredGenerationJobSchema,
    queueName: GAME_DBOS_QUEUE,
    workflowName: GAME_DBOS_WORKFLOW,
  });
}
