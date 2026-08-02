import "server-only";

import { createArtifactGenerationDbosQueue } from "../dbos-queue.server";
import type { MindMapGenerationQueue } from "./generation-queue";
import { mindMapGenerationJobSchema } from "./generation-queue";

export const MIND_MAP_DBOS_QUEUE = "mind-map-generation";
export const MIND_MAP_DBOS_WORKFLOW = "generateMindMap";

export function createMindMapDbosQueue(): MindMapGenerationQueue {
  return createArtifactGenerationDbosQueue({
    errorLabel: "Mind map",
    jobSchema: mindMapGenerationJobSchema,
    queueName: MIND_MAP_DBOS_QUEUE,
    workflowName: MIND_MAP_DBOS_WORKFLOW,
  });
}
