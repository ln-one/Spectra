import "server-only";

import { createHash } from "node:crypto";
import { artifactDbosClient } from "@/features/artifacts/dbos-client.server";
import type { ArtifactSuggestionTarget } from "@/features/artifacts/suggestions/contract";
import type { Locale } from "@/i18n/config";

export const ARTIFACT_SUGGESTIONS_QUEUE = "artifact-suggestions";
export const ARTIFACT_SUGGESTIONS_WORKFLOW = "generateArtifactSuggestions";
const ARTIFACT_SUGGESTIONS_CONTRACT_VERSION = "v4";
const MAX_SUGGESTION_WORKFLOW_ATTEMPTS = 3;
const RETRYABLE_TERMINAL_STATES = new Set(["CANCELLED", "ERROR", "MAX_RECOVERY_ATTEMPTS_EXCEEDED"]);

function workflowIdentity(
  workspaceId: string,
  locale: Locale,
  target: ArtifactSuggestionTarget,
  requestIdentity: string,
) {
  const requestKey = [
    workspaceId,
    locale,
    target,
    ARTIFACT_SUGGESTIONS_CONTRACT_VERSION,
    requestIdentity,
  ].join(":");
  return `artifact-suggestions-${createHash("sha256").update(requestKey).digest("hex")}`;
}

function retryWorkflowIdentity(identity: string, status: string, updatedAt: number | undefined) {
  return `artifact-suggestions-${createHash("sha256")
    .update(`${identity}:${status}:${updatedAt ?? "unknown"}`)
    .digest("hex")}`;
}

export async function enqueueArtifactSuggestions(
  workspaceId: string,
  locale: Locale,
  target: ArtifactSuggestionTarget,
  requestIdentity: string,
  expectedContextHash: string,
  requestEpoch: number,
) {
  const client = await artifactDbosClient();
  let identity = workflowIdentity(workspaceId, locale, target, requestIdentity);
  for (let attempt = 0; attempt < MAX_SUGGESTION_WORKFLOW_ATTEMPTS; attempt += 1) {
    const status = await client.retrieveWorkflow(identity).getStatus();
    if (status && RETRYABLE_TERMINAL_STATES.has(status.status)) {
      identity = retryWorkflowIdentity(identity, status.status, status.updatedAt);
      continue;
    }
    return client.enqueuePortable(
      {
        deduplicationID: identity,
        duplicationPolicy: "return-existing",
        queueName: ARTIFACT_SUGGESTIONS_QUEUE,
        serializationType: "portable",
        workflowID: identity,
        workflowName: ARTIFACT_SUGGESTIONS_WORKFLOW,
      },
      [workspaceId, locale, target, expectedContextHash, requestEpoch],
    );
  }
  throw new Error("Artifact suggestion workflow retry budget exhausted.");
}
