import "server-only";

import {
  createTaskAgentDbosQueue,
  TASK_AGENT_AUTHORING_DBOS_QUEUE,
} from "../task-agent/generation-queue";

export const ANIMATION_AUTHORING_DBOS_QUEUE = TASK_AGENT_AUTHORING_DBOS_QUEUE;
export const ANIMATION_AUTHORING_DBOS_WORKFLOW = "authorAnimationRemotionV1";

export function createAnimationDbosQueue() {
  return createTaskAgentDbosQueue(
    ANIMATION_AUTHORING_DBOS_WORKFLOW,
    "Animation DBOS workflow was not created",
  );
}
