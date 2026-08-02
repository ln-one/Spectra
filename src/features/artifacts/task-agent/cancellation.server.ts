import "server-only";

import { openHandsAuthoringEnvironment } from "./config.server";
import {
  createOpenHandsAuthoringClient,
  stableTaskAgentConversationId,
} from "./openhands-client.server";
import type { TaskAgentRecipeVersion } from "./recipe";

async function cancelTaskAgentRemoteExecution(recipe: TaskAgentRecipeVersion, attemptId: string) {
  const environment = openHandsAuthoringEnvironment(undefined, recipe, attemptId);
  await createOpenHandsAuthoringClient(environment).stopConversation({
    conversationId: stableTaskAgentConversationId(recipe, attemptId),
  });
}

export function taskAgentRemoteCancellation(recipe: TaskAgentRecipeVersion) {
  return (attemptId: string) => cancelTaskAgentRemoteExecution(recipe, attemptId);
}
