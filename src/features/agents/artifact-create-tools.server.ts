import "server-only";

import type { TracingContext } from "@mastra/core/observability";
import { createTool } from "@mastra/core/tools";
import type { ArtifactDetail } from "@/features/artifacts/contract";
import type { ArtifactGroundingBundle } from "@/features/artifacts/grounding";
import type { ArtifactCreationCapabilities } from "@/features/artifacts/task-agent/creation-capabilities";
import { safeLogError, webLogger } from "@/observability/server";
import type {
  ArtifactToolDependencies,
  artifactAgentComposition,
} from "./artifact-composition.server";
import {
  type ArtifactCreationRequest,
  artifactCreationRequestFromPlanItem,
  createArtifactsToolInputSchemaFor,
  createArtifactsToolOutputSchema,
} from "./artifact-create-tool-contract";
import { artifactCreationInputExamples } from "./artifact-create-tool-examples";
import { resolveArtifactCreationBrief } from "./artifact-creation-brief";
import {
  type ArtifactPlanResult,
  artifactPlanArtifactSummarySchema,
  commitArtifactPlanToolInputSchema,
  commitArtifactPlanToolOutputSchema,
} from "./artifact-plan-contract";
import { enqueueArtifactPlanWorkflow, readArtifactPlanEvents } from "./artifact-plan-dbos.server";
import {
  type ArtifactPlanWorkflowInput,
  artifactPlanWorkflowInputSchema,
} from "./artifact-plan-dbos-contract.server";
import { artifactPlanItemId, artifactPlanWorkflowId } from "./artifact-plan-identity.server";
import { artifactToolScope } from "./artifact-tool-context.server";
import {
  createOnce,
  type InputBoundAttempt,
  runInputBoundOnce,
} from "./artifact-tool-idempotency.server";
import { ARTIFACT_AGENT_TOOL_IDS } from "./artifact-tool-protocol";
import {
  type WorkspaceAgentToolContext,
  workspaceAgentToolContextSchema,
} from "./workspace-agent-tool-context";

function commitArtifactPlanModelOutput(output: unknown) {
  const parsed = commitArtifactPlanToolOutputSchema.safeParse(output);
  if (!parsed.success) {
    return {
      type: "text" as const,
      value: "The Artifact plan result was invalid. Report that the plan could not be confirmed.",
    };
  }
  const started = parsed.data.results.filter((result) => result.status === "started");
  const failed = parsed.data.results.filter((result) => result.status === "failed");
  const created = started
    .map((result) => `${result.artifact.kind} titled "${result.artifact.title}"`)
    .join("; ");
  const failure =
    failed.length > 0
      ? ` ${failed.length} planned item(s) could not be started. State this partial failure briefly.`
      : "";
  return {
    type: "text" as const,
    value: `Artifact plan execution finished. Started: ${created || "none"}.${failure} Give one short natural summary, do not call any more tools, do not poll generation, and do not mention internal identifiers.`,
  };
}

function legacyArtifactBundleCreationModelOutput(output: unknown) {
  const parsed = createArtifactsToolOutputSchema.safeParse(output);
  if (!parsed.success) {
    return {
      type: "text" as const,
      value:
        "The legacy Artifact result was invalid. Correct the creation arguments and try once more.",
    };
  }
  const created = parsed.data.artifacts
    .map(
      (artifact) =>
        `${artifact.kind} titled "${artifact.title}" with generation state ${artifact.generationState}`,
    )
    .join("; ");
  const failure =
    parsed.data.status === "partial"
      ? ` Could not start: ${parsed.data.failedKinds.join(", ")}. State this partial failure plainly.`
      : "";
  return {
    type: "text" as const,
    value: `Created artifacts: ${created}.${failure} Never call any creation tool again in this turn. Do not mention internal identifiers.`,
  };
}

export type ArtifactPlanToolRuntime = {
  enqueue: typeof enqueueArtifactPlanWorkflow;
  readEvents: typeof readArtifactPlanEvents;
};

export function createArtifactCreationTools(input: {
  capabilities: ArtifactCreationCapabilities;
  dependencies: ArtifactToolDependencies & typeof artifactAgentComposition;
  planRuntime?: ArtifactPlanToolRuntime;
}) {
  const { capabilities, dependencies } = input;
  const planRuntime = input.planRuntime ?? {
    enqueue: enqueueArtifactPlanWorkflow,
    readEvents: readArtifactPlanEvents,
  };
  const artifactCreations = new Map<string, Promise<ArtifactDetail>>();

  async function startArtifact(
    grounding: ArtifactGroundingBundle,
    prompt: string,
    request: ArtifactCreationRequest,
    scope: WorkspaceAgentToolContext,
  ) {
    if (request.kind === "presentation" && !capabilities.has("presentation")) {
      throw new Error("presentation_generation_unavailable");
    }
    if (request.kind === "animation" && !capabilities.has("animation")) {
      throw new Error("animation_generation_unavailable");
    }
    const key = `${request.kind}:${scope.workspaceId}:${scope.conversationId}:${scope.sourceUserMessageId}`;
    const commonInput = {
      actor: scope.actor,
      conversationId: scope.conversationId,
      grounding,
      locale: scope.locale,
      prompt,
      requestedTitle: request.title,
      rootRunId: scope.rootRunId,
      sourceUserMessageId: scope.sourceUserMessageId,
      workspaceId: scope.workspaceId,
    };
    const { detail, first } = await createOnce(artifactCreations, key, () => {
      switch (request.kind) {
        case "teaching_document":
          return dependencies.createTeachingDocument(commonInput);
        case "mind_map":
          return dependencies.createMindMap(commonInput);
        case "quiz":
          return dependencies.createQuiz(commonInput);
        case "game":
          return dependencies.createGame(commonInput);
        case "presentation":
          return dependencies.createPresentation(commonInput);
        case "animation":
          return dependencies.createAnimation({
            ...commonInput,
            ...(request.brief.durationSeconds
              ? { durationSeconds: request.brief.durationSeconds }
              : {}),
          });
      }
    });
    return {
      detail,
      first,
      output: {
        artifactId: detail.id,
        generationState: detail.generationState,
        kind: detail.kind,
        title: detail.title,
      },
    };
  }

  // Kept for persisted historical tool calls. New Agent turns only receive
  // commit_artifact_plan.
  async function createLegacyArtifactBatch(
    briefContext: "latest" | "continue_previous_artifact_request",
    requests: ArtifactCreationRequest[],
    scope: WorkspaceAgentToolContext,
    requestContext?: object,
    tracingContext?: TracingContext,
  ) {
    const preparedRequests = await Promise.all(
      requests.map(async (request) => ({
        grounding: await dependencies.resolveGroundingRefs({
          refs: request.groundingRefs,
          scope,
          ...(requestContext ? { requestContext } : {}),
          ...(tracingContext ? { tracingContext } : {}),
        }),
        prompt: resolveArtifactCreationBrief({
          briefContext,
          previousArtifactCreationPlan: scope.previousArtifactCreationPlan,
          request,
        }),
        request,
      })),
    );
    const results = await Promise.allSettled(
      preparedRequests.map(({ grounding, prompt, request }) =>
        startArtifact(grounding, prompt, request, scope),
      ),
    );
    const successfulAttempts = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (successfulAttempts.length === 0) {
      const failure = results.find((result) => result.status === "rejected");
      throw failure?.reason ?? new Error("artifact_creation_failed");
    }
    const failedKinds = results.flatMap((result, index) => {
      const request = requests[index];
      return result.status === "rejected" && request ? [request.kind] : [];
    });
    return {
      output: {
        artifacts: successfulAttempts.map((attempt) => attempt.output),
        failedKinds,
        status: failedKinds.length === 0 ? ("complete" as const) : ("partial" as const),
      },
      startedDetails: successfulAttempts.flatMap((attempt) =>
        attempt.first ? [attempt.detail] : [],
      ),
    };
  }

  const legacyArtifactCreationBatches = new Map<
    string,
    InputBoundAttempt<Awaited<ReturnType<typeof createLegacyArtifactBatch>>>
  >();

  const legacyCreateArtifacts = createTool({
    id: ARTIFACT_AGENT_TOOL_IDS.createArtifacts,
    description: "Legacy compatibility tool. It is not exposed to new workspace Agent turns.",
    inputExamples: artifactCreationInputExamples(capabilities),
    inputSchema: createArtifactsToolInputSchemaFor(capabilities),
    outputSchema: createArtifactsToolOutputSchema,
    requestContextSchema: workspaceAgentToolContextSchema,
    strict: true,
    execute: async ({ briefContext, requests }, context) => {
      const scope = artifactToolScope(context);
      const key = `${scope.workspaceId}:${scope.conversationId}:${scope.sourceUserMessageId}`;
      const existing = legacyArtifactCreationBatches.get(key);
      if (existing) return (await existing.attempt).output;
      const { detail: batch, first } = await runInputBoundOnce(
        legacyArtifactCreationBatches,
        key,
        { briefContext, requests },
        "artifact_creation_already_started_this_run",
        () =>
          createLegacyArtifactBatch(
            briefContext,
            requests,
            scope,
            context?.requestContext,
            context?.tracingContext,
          ),
      );
      if (first) {
        for (const detail of batch.startedDetails) {
          await context?.writer?.custom({ data: detail, type: "data-artifactStarted" });
        }
      }
      return batch.output;
    },
    toModelOutput: legacyArtifactBundleCreationModelOutput,
  });

  const commitArtifactPlan = createTool({
    id: ARTIFACT_AGENT_TOOL_IDS.commitArtifactPlan,
    description:
      "Commit one complete, ordered Artifact plan after deciding what the user needs. Include every independently useful Artifact as its own item; kinds may repeat and there is no product item-count limit. Use only Evidence refs returned in this run. This single mutation reliably starts items in order and returns after they are queued; never call another creation or polling tool afterward.",
    inputSchema: commitArtifactPlanToolInputSchema,
    outputSchema: commitArtifactPlanToolOutputSchema,
    requestContextSchema: workspaceAgentToolContextSchema,
    strict: true,
    execute: async ({ items }, context) => {
      const scope = artifactToolScope(context);
      if (
        items.some(
          (item) =>
            (item.kind === "presentation" && !capabilities.has("presentation")) ||
            (item.kind === "animation" && !capabilities.has("animation")),
        )
      ) {
        throw new Error("artifact_plan_contains_unavailable_kind");
      }
      const workflowId = artifactPlanWorkflowId(scope);
      const preparedItems = await Promise.all(
        items.map(async (item, index) => {
          const request = artifactCreationRequestFromPlanItem(item);
          const grounding = await dependencies.resolveGroundingRefs({
            refs: item.groundingRefs,
            scope,
            ...(context.requestContext ? { requestContext: context.requestContext } : {}),
            ...(context.tracingContext ? { tracingContext: context.tracingContext } : {}),
          });
          return {
            grounding,
            kind: item.kind,
            planItemId: artifactPlanItemId({
              index,
              item,
              sourceUserMessageId: scope.sourceUserMessageId,
            }),
            prompt: resolveArtifactCreationBrief({
              briefContext: "latest",
              request,
            }),
            title: item.title,
          };
        }),
      );
      const workflowInput: ArtifactPlanWorkflowInput = artifactPlanWorkflowInputSchema.parse({
        actor: scope.actor,
        conversationId: scope.conversationId,
        items: preparedItems,
        locale: scope.locale,
        rootRunId: scope.rootRunId,
        sourceUserMessageId: scope.sourceUserMessageId,
        workflowId,
        workspaceId: scope.workspaceId,
      });
      const startedAt = Date.now();
      webLogger.info(
        {
          component: "agent",
          conversationId: scope.conversationId,
          event: "agent.artifact_plan.started",
          itemCount: items.length,
          runId: scope.rootRunId,
          workflowId,
          workspaceId: scope.workspaceId,
        },
        "Workspace Artifact plan started",
      );
      await planRuntime.enqueue(workflowInput);
      const results: ArtifactPlanResult[] = [];
      const terminalItemIds = new Set<string>();
      let completed = false;
      try {
        const events = await planRuntime.readEvents(workflowId);
        for await (const event of events) {
          switch (event.type) {
            case "item-running":
              await context.writer?.custom({
                data: {
                  index: event.index,
                  kind: event.kind,
                  planItemId: event.planItemId,
                  status: "running",
                  title: event.title,
                  workflowId,
                },
                id: `artifact-plan-progress:${workflowId}`,
                transient: true,
                type: "data-artifactPlanProgress",
              });
              break;
            case "item-started":
              if (terminalItemIds.has(event.planItemId)) break;
              terminalItemIds.add(event.planItemId);
              results.push({
                artifact: artifactPlanArtifactSummarySchema.parse({
                  artifactId: event.artifact.id,
                  generationState: event.artifact.generationState,
                  kind: event.artifact.kind,
                  title: event.artifact.title,
                }),
                kind: event.artifact.kind,
                planItemId: event.planItemId,
                status: "started",
              });
              await context.writer?.custom({
                data: event.artifact,
                id: `artifact-plan-started:${event.planItemId}`,
                type: "data-artifactStarted",
              });
              break;
            case "item-failed":
              if (terminalItemIds.has(event.planItemId)) break;
              terminalItemIds.add(event.planItemId);
              results.push({
                errorCode: event.errorCode,
                kind: event.kind,
                planItemId: event.planItemId,
                status: "failed",
              });
              await context.writer?.custom({
                data: {
                  errorCode: event.errorCode,
                  index: event.index,
                  kind: event.kind,
                  planItemId: event.planItemId,
                  title: event.title,
                  workflowId,
                },
                id: `artifact-plan-failed:${event.planItemId}`,
                type: "data-artifactPlanItemFailed",
              });
              break;
            case "completed":
              completed = true;
              await context.writer?.custom({
                data: { status: "completed", workflowId },
                id: `artifact-plan-progress:${workflowId}`,
                transient: true,
                type: "data-artifactPlanProgress",
              });
              break;
          }
        }
      } catch (error) {
        if (results.length === 0) throw error;
        webLogger.warn(
          {
            component: "agent",
            conversationId: scope.conversationId,
            durationMs: Date.now() - startedAt,
            error: safeLogError(error),
            event: "agent.artifact_plan.stream_failed",
            failureCode: "artifact_plan_status_unavailable",
            runId: scope.rootRunId,
            workflowId,
            workspaceId: scope.workspaceId,
          },
          "Workspace Artifact plan stream failed after partial delivery",
        );
      }
      if (!completed) {
        for (const [index, item] of preparedItems.entries()) {
          if (terminalItemIds.has(item.planItemId)) continue;
          results.push({
            errorCode: "artifact_plan_status_unavailable",
            kind: item.kind,
            planItemId: item.planItemId,
            status: "failed",
          });
          await context.writer?.custom({
            data: {
              errorCode: "artifact_plan_status_unavailable",
              index,
              kind: item.kind,
              planItemId: item.planItemId,
              title: item.title,
              workflowId,
            },
            id: `artifact-plan-failed:${item.planItemId}`,
            type: "data-artifactPlanItemFailed",
          });
        }
        await context.writer?.custom({
          data: { status: "completed", workflowId },
          id: `artifact-plan-progress:${workflowId}`,
          transient: true,
          type: "data-artifactPlanProgress",
        });
      }
      webLogger.info(
        {
          component: "agent",
          conversationId: scope.conversationId,
          durationMs: Date.now() - startedAt,
          event: "agent.artifact_plan.completed",
          failedCount: results.filter((result) => result.status === "failed").length,
          runId: scope.rootRunId,
          startedCount: results.filter((result) => result.status === "started").length,
          workflowId,
          workspaceId: scope.workspaceId,
        },
        "Workspace Artifact plan completed",
      );
      return commitArtifactPlanToolOutputSchema.parse({ results, workflowId });
    },
    toModelOutput: commitArtifactPlanModelOutput,
  });

  return {
    [legacyCreateArtifacts.id]: legacyCreateArtifacts,
    [commitArtifactPlan.id]: commitArtifactPlan,
  };
}
