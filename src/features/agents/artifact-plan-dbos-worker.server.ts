import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { z } from "zod";
import type { ArtifactDetail } from "@/features/artifacts/contract";
import { artifactServerModule } from "@/features/artifacts/server-modules.server";
import { safeLogError, workerLogger } from "@/observability/server";
import { artifactPlanArtifactSummarySchema } from "./artifact-plan-contract";
import {
  ARTIFACT_PLAN_DBOS_WORKFLOW,
  artifactPlanDbosStreamKey,
} from "./artifact-plan-dbos.server";
import {
  type ArtifactPlanEvent,
  type ArtifactPlanWorkflowInput,
  artifactPlanWorkflowInputSchema,
  artifactPlanWorkflowResultSchema,
} from "./artifact-plan-dbos-contract.server";

export const ARTIFACT_PLAN_STEP_CONFIG = {
  backoffRate: 2,
  intervalSeconds: 1,
  maxAttempts: 2,
  name: "startWorkspaceArtifactPlanItem",
  retriesAllowed: true,
} as const;

function artifactPlanFailureCode() {
  return "artifact_enqueue_failed";
}

function artifactSummary(detail: ArtifactDetail) {
  return artifactPlanArtifactSummarySchema.parse({
    artifactId: detail.id,
    generationState: detail.generationState,
    kind: detail.kind,
    title: detail.title,
  });
}

async function startArtifactPlanItem(
  input: ArtifactPlanWorkflowInput,
  item: ArtifactPlanWorkflowInput["items"][number],
) {
  return artifactServerModule(item.kind).createFromAgent({
    actor: input.actor,
    conversationId: input.conversationId,
    grounding: item.grounding,
    locale: input.locale,
    prompt: item.prompt,
    requestedTitle: item.title,
    rootRunId: input.rootRunId,
    sourcePlanItemId: item.planItemId,
    sourceUserMessageId: input.sourceUserMessageId,
    workspaceId: input.workspaceId,
  });
}

export async function executeArtifactPlanWorkflow(
  rawInput: ArtifactPlanWorkflowInput,
  dependencies: {
    closeStream: (key: string) => Promise<void>;
    startItem: typeof startArtifactPlanItem;
    writeEvent: (key: string, event: ArtifactPlanEvent) => Promise<void>;
  },
) {
  const input = artifactPlanWorkflowInputSchema.parse(rawInput);
  const streamKey = artifactPlanDbosStreamKey(input.workflowId);
  const results: Array<z.infer<typeof artifactPlanWorkflowResultSchema>["results"][number]> = [];
  try {
    for (const [index, item] of input.items.entries()) {
      await dependencies.writeEvent(streamKey, {
        index,
        kind: item.kind,
        planItemId: item.planItemId,
        title: item.title,
        type: "item-running",
        workflowId: input.workflowId,
      });
      try {
        const artifact = await dependencies.startItem(input, item);
        results.push({
          artifact: artifactSummary(artifact),
          kind: item.kind,
          planItemId: item.planItemId,
          status: "started",
        });
        await dependencies.writeEvent(streamKey, {
          artifact,
          index,
          planItemId: item.planItemId,
          type: "item-started",
          workflowId: input.workflowId,
        });
      } catch (error) {
        const errorCode = artifactPlanFailureCode();
        results.push({
          errorCode,
          kind: item.kind,
          planItemId: item.planItemId,
          status: "failed",
        });
        await dependencies.writeEvent(streamKey, {
          errorCode,
          index,
          kind: item.kind,
          planItemId: item.planItemId,
          title: item.title,
          type: "item-failed",
          workflowId: input.workflowId,
        });
        workerLogger.warn(
          {
            component: "agent",
            error: safeLogError(error),
            event: "agent.artifact_plan.item_failed",
            kind: item.kind,
            planItemId: item.planItemId,
            workflowId: input.workflowId,
            workspaceId: input.workspaceId,
          },
          "Workspace Artifact plan item failed",
        );
      }
    }
    await dependencies.writeEvent(streamKey, {
      type: "completed",
      workflowId: input.workflowId,
    });
    return artifactPlanWorkflowResultSchema.parse({
      results,
      workflowId: input.workflowId,
    });
  } finally {
    await dependencies.closeStream(streamKey);
  }
}

export function registerArtifactPlanDbosWorkflow() {
  const startItem = DBOS.registerStep(startArtifactPlanItem, ARTIFACT_PLAN_STEP_CONFIG);

  async function workflow(input: ArtifactPlanWorkflowInput) {
    if (DBOS.workflowID !== input.workflowId) throw new Error("artifact_plan_workflow_id_mismatch");
    return executeArtifactPlanWorkflow(input, {
      closeStream: (key) => DBOS.closeStream(key),
      startItem,
      writeEvent: (key, event) => DBOS.writeStream(key, JSON.stringify(event)),
    });
  }

  return DBOS.registerWorkflow(workflow, {
    inputSchema: z.tuple([artifactPlanWorkflowInputSchema]),
    maxRecoveryAttempts: 100,
    name: ARTIFACT_PLAN_DBOS_WORKFLOW,
    serialization: "portable",
  });
}
