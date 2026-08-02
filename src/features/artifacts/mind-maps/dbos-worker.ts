import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { DrizzleDataSource } from "@dbos-inc/drizzle-datasource";
import type { Pool } from "pg";
import { z } from "zod";
import type { Database } from "@/database/client";
import * as databaseSchema from "@/database/schema";
import { artifactDbosStreamKey } from "@/features/artifacts/dbos-realtime.server";
import { hasVisibleArtifactOutput } from "@/features/artifacts/generation";
import {
  settleArtifactProviderAttempt,
  startArtifactProviderAttempt,
} from "@/features/artifacts/provider-attempts.server";
import { workerLogger } from "@/observability/server";
import { ARTIFACT_DBOS_SCHEMA } from "../dbos-queue.server";
import { mindMapGenerationProfile } from "./config";
import {
  type MindMapDraftSnapshot,
  type MindMapGenerationRequest,
  type MindMapRevisionContent,
  mindMapGenerationDraftSchema,
  mindMapRevisionContentSchema,
} from "./contract";
import { MIND_MAP_DBOS_WORKFLOW } from "./dbos";
import { generateMindMapDraft } from "./generation";
import {
  type MindMapGenerationFailureCode,
  mindMapGenerationFailureCode,
} from "./generation-failure";
import { projectMindMap } from "./projector";
import { mindMapDraftEventSchema, shouldPublishMindMapSnapshot } from "./realtime";
import {
  claimMindMapGeneration,
  completeMindMapGeneration,
  failMindMapGeneration,
  getMindMapGenerationInputById,
  updateMindMapGeneration,
} from "./service";

const CHECKPOINT_INTERVAL_MS = 750;

type GeneratedMindMap = {
  attemptId: string;
  content: MindMapRevisionContent;
  outcome: "complete" | "partial";
  sequence: number;
  status: "success";
};

function finalContent(input: {
  outcome: "complete" | "partial";
  rawOutput: string;
  snapshot: MindMapDraftSnapshot | null;
}) {
  if (!input.snapshot) {
    return projectMindMap({
      outcome: input.outcome,
      rawOutput: input.rawOutput,
    }).revision;
  }
  return mindMapRevisionContentSchema.parse({
    ...input.snapshot,
    generation: {
      outcome: input.outcome,
      rawOutput: input.rawOutput,
      warnings: input.outcome === "partial" ? ["partial_generation"] : [],
    },
    schemaVersion: 2,
  });
}

export function registerMindMapDbosWorkflow(input: {
  beforeFinalize?: (artifactId: string) => Promise<void>;
  db: Database;
  generateDraft?: typeof generateMindMapDraft;
  generationStep?: { timeoutMS?: number };
  pool: Pool;
}) {
  const dataSource = new DrizzleDataSource<Database>(
    "spectra-mind-map-product",
    input.pool,
    databaseSchema,
    ARTIFACT_DBOS_SCHEMA,
  );
  const generate = input.generateDraft ?? generateMindMapDraft;
  const prepareFinalization = DBOS.registerStep(input.beforeFinalize ?? (async () => undefined), {
    name: "prepareMindMapFinalization",
  });

  const loadGeneration = dataSource.registerTransaction(
    async (artifactId: string) => {
      const generation = await getMindMapGenerationInputById(artifactId, dataSource.client);
      return generation
        ? {
            actorId: generation.artifact.createdByPrincipalId,
            request: generation.request,
          }
        : null;
    },
    { name: "loadMindMapGeneration" },
  );
  const finalizeGeneration = dataSource.registerTransaction(
    async (artifactId: string, generated: GeneratedMindMap, actorId: string) => {
      const artifact = await completeMindMapGeneration(
        artifactId,
        generated.attemptId,
        actorId,
        generated.content,
        dataSource.client,
        null,
      );
      return { id: artifact.id, title: artifact.title };
    },
    { name: "finalizeMindMapGeneration" },
  );
  const failGeneration = dataSource.registerTransaction(
    async (
      artifactId: string,
      generationAttemptId: string,
      failureCode: MindMapGenerationFailureCode,
    ) => {
      await failMindMapGeneration(artifactId, failureCode, generationAttemptId, dataSource.client);
    },
    { name: "failMindMapGeneration" },
  );

  const generateDraft = DBOS.registerStep(
    async (artifactId: string, generationAttemptId: string, request: MindMapGenerationRequest) => {
      const current = await getMindMapGenerationInputById(artifactId, input.db);
      if (!current) throw new Error("Mind map generation is no longer active");
      const checkpoint = mindMapGenerationDraftSchema
        .nullable()
        .safeParse(current.artifact.generationDraft);
      if (
        checkpoint.success &&
        checkpoint.data &&
        hasVisibleArtifactOutput(checkpoint.data.rawOutput) &&
        current.artifact.generationAttemptId
      ) {
        const content = finalContent({
          outcome: "partial",
          rawOutput: checkpoint.data.rawOutput,
          snapshot: checkpoint.data.snapshot,
        });
        await updateMindMapGeneration(
          artifactId,
          current.artifact.generationAttemptId,
          {
            draft: checkpoint.data.snapshot,
            rawOutput: checkpoint.data.rawOutput,
            sequence: current.artifact.generationSequence,
            state: "finalizing",
          },
          input.db,
        );
        return {
          attemptId: current.artifact.generationAttemptId,
          content,
          outcome: "partial" as const,
          sequence: current.artifact.generationSequence,
          status: "success" as const,
        };
      }

      const attemptId = current.artifact.generationAttemptId;
      if (!attemptId || attemptId !== generationAttemptId) {
        throw new Error("Mind map generation attempt is unavailable");
      }
      const streamKey = artifactDbosStreamKey(attemptId);
      let lastCheckpointAt = 0;
      let lastStreamAt: number | null = null;
      let sequence = 0;
      let rawOutput = "";
      let latestSnapshot: MindMapDraftSnapshot | null = null;
      let providerAttemptId: string | null = null;
      try {
        await claimMindMapGeneration(artifactId, attemptId, input.db);
        const providerAttempt = await startArtifactProviderAttempt(
          {
            generationAttemptId,
            model: mindMapGenerationProfile.modelId,
            provider: "dashscope",
          },
          input.db,
        );
        if (!providerAttempt) throw new Error("artifact_generation_attempt_unavailable");
        providerAttemptId = providerAttempt.id;
        const generated = await generate({
          abortSignal: DBOS.stepStatus?.timeoutSignal ?? new AbortController().signal,
          grounding: request.grounding,
          locale: request.locale,
          onTextDelta: async (_delta, currentRawOutput) => {
            rawOutput = currentRawOutput;
            const now = Date.now();
            if (lastCheckpointAt !== 0 && now - lastCheckpointAt < CHECKPOINT_INTERVAL_MS) return;
            await updateMindMapGeneration(
              artifactId,
              attemptId,
              {
                draft: latestSnapshot,
                rawOutput,
                sequence,
                state: "generating",
              },
              input.db,
            );
            lastCheckpointAt = now;
          },
          onSnapshot: async (snapshot, currentRawOutput) => {
            rawOutput = currentRawOutput;
            latestSnapshot = snapshot;
            const now = Date.now();
            if (shouldPublishMindMapSnapshot(lastStreamAt, now)) {
              sequence += 1;
              // Persist before publishing so recovery cannot lose a visible snapshot.
              await updateMindMapGeneration(
                artifactId,
                attemptId,
                {
                  draft: snapshot,
                  rawOutput,
                  sequence,
                  state: "generating",
                },
                input.db,
              );
              await DBOS.writeStream(
                streamKey,
                JSON.stringify(
                  mindMapDraftEventSchema.parse({
                    draft: snapshot,
                    event: "snapshot",
                    kind: "mind_map",
                    sequence,
                    version: 2,
                  }),
                ),
              );
              lastStreamAt = now;
              lastCheckpointAt = now;
            }
          },
          prompt: request.prompt,
        });
        rawOutput = generated.rawOutput;
        latestSnapshot = generated.snapshot ?? latestSnapshot;
        const content = finalContent({
          outcome: generated.outcome,
          rawOutput,
          snapshot: latestSnapshot,
        });
        const streamSnapshot: MindMapDraftSnapshot = {
          nodes: content.nodes,
          rootId: content.rootId,
        };
        sequence += 1;
        await updateMindMapGeneration(
          artifactId,
          attemptId,
          { draft: streamSnapshot, rawOutput, sequence, state: "finalizing" },
          input.db,
        );
        await DBOS.writeStream(
          streamKey,
          JSON.stringify(
            mindMapDraftEventSchema.parse({
              draft: streamSnapshot,
              event: "snapshot",
              kind: "mind_map",
              sequence,
              version: 2,
            }),
          ),
        );
        if (providerAttemptId) {
          await settleArtifactProviderAttempt(
            {
              attemptId: providerAttemptId,
              effectiveModel: mindMapGenerationProfile.modelId,
              effectiveProvider: "dashscope",
              ...(generated.outcome === "partial"
                ? { errorCode: "partial_generation", state: "exhausted" as const }
                : { state: "succeeded" as const }),
            },
            input.db,
          );
        }
        return {
          attemptId,
          content,
          outcome: generated.outcome,
          sequence,
          status: "success" as const,
        };
      } catch (error) {
        const hasVisibleContent = hasVisibleArtifactOutput(rawOutput);
        if (hasVisibleContent) {
          let content: MindMapRevisionContent;
          try {
            content = finalContent({
              outcome: "partial",
              rawOutput,
              snapshot: latestSnapshot,
            });
          } catch (projectionError) {
            const failureCode = mindMapGenerationFailureCode(projectionError);
            if (providerAttemptId) {
              await settleArtifactProviderAttempt(
                { attemptId: providerAttemptId, errorCode: failureCode, state: "failed" },
                input.db,
              );
            }
            return { attemptId, failureCode, status: "failure" as const };
          }
          if (providerAttemptId) {
            await settleArtifactProviderAttempt(
              {
                attemptId: providerAttemptId,
                errorCode: "partial_generation",
                state: "exhausted",
              },
              input.db,
            );
          }
          await updateMindMapGeneration(
            artifactId,
            attemptId,
            { draft: latestSnapshot, rawOutput, sequence, state: "finalizing" },
            input.db,
          );
          return {
            attemptId,
            content,
            outcome: "partial" as const,
            sequence,
            status: "success" as const,
          };
        }
        const failureCode = mindMapGenerationFailureCode(error);
        if (providerAttemptId) {
          await settleArtifactProviderAttempt(
            { attemptId: providerAttemptId, errorCode: failureCode, state: "failed" },
            input.db,
          );
        }
        return { attemptId, failureCode, status: "failure" as const };
      }
    },
    { name: "generateMindMapDraft", timeoutMS: input.generationStep?.timeoutMS ?? 150_000 },
  );

  async function workflow(artifactId: string, generationAttemptId: string) {
    const startedAt = Date.now();
    let activeAttemptId: string | null = null;
    try {
      const generation = await loadGeneration(artifactId);
      if (!generation) return null;
      workerLogger.info(
        {
          artifactId,
          artifactKind: "mind_map",
          attemptId: generationAttemptId,
          event: "artifact.generation.started",
          workflowId: DBOS.workflowID,
        },
        "Artifact generation started",
      );
      const result = await generateDraft(artifactId, generationAttemptId, generation.request);
      activeAttemptId = result.attemptId;
      if (result.status === "failure") {
        await failGeneration(artifactId, generationAttemptId, result.failureCode);
        await DBOS.closeStream(artifactDbosStreamKey(result.attemptId));
        workerLogger.error(
          {
            artifactId,
            artifactKind: "mind_map",
            attemptId: generationAttemptId,
            durationMs: Date.now() - startedAt,
            event: "artifact.generation.failed",
            failureCode: result.failureCode,
            workflowId: DBOS.workflowID,
          },
          "Artifact generation failed",
        );
        return null;
      }
      workerLogger.info(
        {
          artifactId,
          artifactKind: "mind_map",
          attemptId: generationAttemptId,
          event: "artifact.generation.stage_changed",
          stage: "finalizing",
          workflowId: DBOS.workflowID,
        },
        "Artifact generation entered finalization",
      );
      await prepareFinalization(artifactId);
      const artifact = await finalizeGeneration(artifactId, result, generation.actorId);
      await DBOS.closeStream(artifactDbosStreamKey(result.attemptId));
      activeAttemptId = null;
      workerLogger.info(
        {
          artifactId,
          artifactKind: "mind_map",
          attemptId: generationAttemptId,
          durationMs: Date.now() - startedAt,
          event: "artifact.generation.completed",
          workflowId: DBOS.workflowID,
        },
        "Artifact generation completed",
      );
      return artifact;
    } catch (error) {
      if (activeAttemptId) await DBOS.closeStream(artifactDbosStreamKey(activeAttemptId));
      const failureCode = mindMapGenerationFailureCode(error);
      await failGeneration(artifactId, generationAttemptId, failureCode);
      workerLogger.error(
        {
          artifactId,
          artifactKind: "mind_map",
          attemptId: generationAttemptId,
          durationMs: Date.now() - startedAt,
          error,
          event: "artifact.generation.failed",
          failureCode,
          workflowId: DBOS.workflowID,
        },
        "Artifact generation failed",
      );
      return null;
    }
  }

  return DBOS.registerWorkflow(workflow, {
    inputSchema: z.tuple([z.string().uuid(), z.string().uuid()]),
    maxRecoveryAttempts: 100,
    name: MIND_MAP_DBOS_WORKFLOW,
    serialization: "portable",
  });
}
