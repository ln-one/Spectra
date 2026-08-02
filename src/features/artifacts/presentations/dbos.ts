import "server-only";

import {
  createTaskAgentDbosQueue,
  TASK_AGENT_AUTHORING_DBOS_QUEUE,
} from "../task-agent/generation-queue";

export const PRESENTATION_AUTHORING_DBOS_QUEUE = TASK_AGENT_AUTHORING_DBOS_QUEUE;
export const PRESENTATION_AUTHORING_DBOS_WORKFLOW = "authorPresentationPptdV1";

export function createPresentationDbosQueue() {
  return createTaskAgentDbosQueue(
    PRESENTATION_AUTHORING_DBOS_WORKFLOW,
    "Presentation DBOS workflow was not created",
  );
}
