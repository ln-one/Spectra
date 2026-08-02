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
import { teachingDocumentGenerationProfile } from "./config";
import {
  type TeachingDocumentGenerationRequest,
  type TeachingDocumentRevisionContent,
  teachingDocumentGenerationDraftSchema,
} from "./contract";
import { TEACHING_DOCUMENT_DBOS_WORKFLOW } from "./dbos";
import { generateTeachingDocumentDraft } from "./generation";
import {
  type TeachingDocumentGenerationFailureCode,
  teachingDocumentGenerationFailureCode,
} from "./generation-failure";
import { projectTeachingDocument } from "./projector";
import {
  TEACHING_DOCUMENT_TERMINAL_SEQUENCE,
  teachingDocumentDraftEventSchema,
  teachingDocumentDraftMarkdown,
  teachingDocumentTextDeltaEvent,
} from "./realtime";
import {
  claimTeachingDocumentGeneration,
  completeTeachingDocumentProjection,
  failExhaustedTeachingDocumentGeneration,
  getTeachingDocumentGenerationInputById,
  updateTeachingDocumentGeneration,
} from "./service";

type RegisterTeachingDocumentDbosWorkflowInput = {
  beforeFinalize?: (artifactId: string) => Promise<void>;
  db: Database;
  generateDraft?: typeof generateTeachingDocumentDraft;
  generationStep?: { timeoutMS?: number };
  pool: Pool;
};

type GeneratedDocument = {
  attemptId: string;
  content: TeachingDocumentRevisionContent;
  outcome: "complete" | "partial";
  sequence: number;
  status: "success";
};

type PersistedStreamRow = { value: string };

function parsePersistedTeachingDocumentEvent(value: string) {
  try {
    const outer: unknown = JSON.parse(value);
    const event: unknown = typeof outer === "string" ? JSON.parse(outer) : outer;
    return teachingDocumentDraftEventSchema.safeParse(event);
  } catch {
    return null;
  }
}

export function recoverTeachingDocumentStreamTail(
  checkpoint: { markdown: string; sequence: number },
  rows: readonly PersistedStreamRow[],
) {
  let markdown = "";
  let sequence = 0;
  for (const row of rows) {
    const parsed = parsePersistedTeachingDocumentEvent(row.value);
    if (!parsed?.success || parsed.data.event !== "text_delta") continue;
    const event = parsed.data;
    if (event.sequence <= sequence) continue;
    if (event.sequence !== sequence + 1 || event.startOffset !== markdown.length) break;
    markdown += event.delta;
    sequence = event.sequence;
  }
  return sequence >= checkpoint.sequence && markdown.startsWith(checkpoint.markdown)
    ? { markdown, sequence }
    : checkpoint;
}

export function registerTeachingDocumentDbosWorkflow(
  input: RegisterTeachingDocumentDbosWorkflowInput,
) {
  const artifactDataSource = new DrizzleDataSource<Database>(
    "spectra-artifact-product",
    input.pool,
    databaseSchema,
    ARTIFACT_DBOS_SCHEMA,
  );
  const generateDocument = input.generateDraft ?? generateTeachingDocumentDraft;
  const prepareFinalization = DBOS.registerStep(input.beforeFinalize ?? (async () => undefined), {
    name: "prepareTeachingDocumentFinalization",
  });

  const loadGeneration = artifactDataSource.registerTransaction(
    async (artifactId: string) => {
      const generation = await getTeachingDocumentGenerationInputById(
        artifactId,
        artifactDataSource.client,
      );
      if (!generation) return null;
      return {
        actorId: generation.artifact.createdByPrincipalId,
        request: generation.request,
      };
    },
    { name: "loadTeachingDocumentGeneration" },
  );

  const finalizeGeneration = artifactDataSource.registerTransaction(
    async (artifactId: string, generated: GeneratedDocument, actorId: string) => {
      const result = await completeTeachingDocumentProjection(
        artifactId,
        generated.attemptId,
        actorId,
        generated.content,
        artifactDataSource.client,
        null,
      );
      return {
        contentSha256: result.revision.contentSha256,
        id: result.artifact.id,
        revisionId: result.revision.id,
        title: result.artifact.title,
      };
    },
    { name: "finalizeTeachingDocumentGeneration" },
  );

  const failGeneration = artifactDataSource.registerTransaction(
    async (
      artifactId: string,
      generationAttemptId: string,
      failureCode: TeachingDocumentGenerationFailureCode,
    ) => {
      await failExhaustedTeachingDocumentGeneration(
        artifactId,
        failureCode,
        generationAttemptId,
        artifactDataSource.client,
      );
    },
    { name: "failTeachingDocumentGeneration" },
  );

  const generateDraft = DBOS.registerStep(
    async (
      artifactId: string,
      generationAttemptId: string,
      request: TeachingDocumentGenerationRequest,
    ) => {
      const current = await getTeachingDocumentGenerationInputById(artifactId, input.db);
      if (!current) throw new Error("Teaching document generation is no longer active");
      const storedDraft = teachingDocumentGenerationDraftSchema
        .nullable()
        .safeParse(current.artifact.generationDraft);
      let storedMarkdown = storedDraft.success
        ? teachingDocumentDraftMarkdown(storedDraft.data)
        : "";
      let storedSequence = current.artifact.generationSequence;
      if (hasVisibleArtifactOutput(storedMarkdown) && current.artifact.generationAttemptId) {
        const persistedRows = await input.pool.query<PersistedStreamRow>(
          `SELECT value FROM "${ARTIFACT_DBOS_SCHEMA}".streams WHERE workflow_uuid = $1 AND key = $2 ORDER BY "offset"`,
          [generationAttemptId, artifactDbosStreamKey(current.artifact.generationAttemptId)],
        );
        const recovered = recoverTeachingDocumentStreamTail(
          { markdown: storedMarkdown, sequence: storedSequence },
          persistedRows.rows,
        );
        storedMarkdown = recovered.markdown;
        storedSequence = recovered.sequence;
        await updateTeachingDocumentGeneration(
          artifactId,
          current.artifact.generationAttemptId,
          {
            draft: { format: "markdown", markdown: storedMarkdown },
            sequence: storedSequence,
            state: "finalizing",
          },
          input.db,
        );
        return {
          attemptId: current.artifact.generationAttemptId,
          content: projectTeachingDocument({
            outcome: "partial",
            rawOutput: storedMarkdown,
            requestedTitle: request.prompt,
          }).revision,
          outcome: "partial" as const,
          sequence: storedSequence,
          status: "success" as const,
        };
      }

      const attemptId = current.artifact.generationAttemptId;
      if (!attemptId || attemptId !== generationAttemptId) {
        throw new Error("Teaching document generation attempt is unavailable");
      }
      const streamKey = artifactDbosStreamKey(attemptId);
      let markdown = "";
      let sequence = 0;
      let lastCheckpointAt = 0;
      let lastCheckpointLength = 0;
      let providerAttemptId: string | null = null;
      try {
        await claimTeachingDocumentGeneration(artifactId, attemptId, input.db);
        const providerAttempt = await startArtifactProviderAttempt(
          {
            generationAttemptId,
            model: teachingDocumentGenerationProfile.modelId,
            provider: "dashscope",
          },
          input.db,
        );
        if (!providerAttempt) throw new Error("artifact_generation_attempt_unavailable");
        providerAttemptId = providerAttempt.id;

        const generated = await generateDocument({
          abortSignal: DBOS.stepStatus?.timeoutSignal ?? new AbortController().signal,
          grounding: request.grounding,
          locale: request.locale,
          onTextDelta: async (delta) => {
            const startOffset = markdown.length;
            markdown += delta;
            sequence += 1;
            const now = Date.now();
            if (
              lastCheckpointAt === 0 ||
              now - lastCheckpointAt >= 250 ||
              markdown.length - lastCheckpointLength >= 2_048
            ) {
              await updateTeachingDocumentGeneration(
                artifactId,
                attemptId,
                {
                  draft: { format: "markdown", markdown },
                  sequence,
                  state: "generating",
                },
                input.db,
              );
              lastCheckpointAt = now;
              lastCheckpointLength = markdown.length;
            }
            await DBOS.writeStream(
              streamKey,
              JSON.stringify(teachingDocumentTextDeltaEvent({ delta, sequence, startOffset })),
            );
          },
          prompt: request.prompt,
        });
        markdown = generated.markdown;
        const content = projectTeachingDocument({
          outcome: generated.outcome,
          rawOutput: markdown,
          requestedTitle: request.prompt,
        }).revision;
        await updateTeachingDocumentGeneration(
          artifactId,
          attemptId,
          {
            draft: { format: "markdown", markdown },
            sequence,
            state: "finalizing",
          },
          input.db,
        );
        if (providerAttemptId) {
          await settleArtifactProviderAttempt(
            {
              attemptId: providerAttemptId,
              effectiveModel: teachingDocumentGenerationProfile.modelId,
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
        const hasVisibleContent = hasVisibleArtifactOutput(markdown);
        if (hasVisibleContent) {
          let content: TeachingDocumentRevisionContent;
          try {
            content = projectTeachingDocument({
              outcome: "partial",
              rawOutput: markdown,
              requestedTitle: request.prompt,
            }).revision;
          } catch (projectionError) {
            const failureCode = teachingDocumentGenerationFailureCode(projectionError);
            if (providerAttemptId) {
              await settleArtifactProviderAttempt(
                { attemptId: providerAttemptId, errorCode: failureCode, state: "failed" },
                input.db,
              );
            }
            return {
              attemptId,
              failureCode,
              sequence: Math.max(1, sequence + 1),
              status: "failure" as const,
            };
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
          await updateTeachingDocumentGeneration(
            artifactId,
            attemptId,
            {
              draft: { format: "markdown", markdown },
              sequence,
              state: "finalizing",
            },
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
        const failureCode = teachingDocumentGenerationFailureCode(error);
        if (providerAttemptId) {
          await settleArtifactProviderAttempt(
            { attemptId: providerAttemptId, errorCode: failureCode, state: "failed" },
            input.db,
          );
        }
        return {
          attemptId,
          failureCode,
          sequence: Math.max(1, sequence + 1),
          status: "failure" as const,
        };
      }
    },
    {
      name: "generateTeachingDocumentDraft",
      timeoutMS: input.generationStep?.timeoutMS ?? 150_000,
    },
  );

  async function teachingDocumentWorkflow(artifactId: string, generationAttemptId: string) {
    const startedAt = Date.now();
    let activeAttemptId: string | null = null;
    try {
      const generation = await loadGeneration(artifactId);
      if (!generation) return null;
      workerLogger.info(
        {
          artifactId,
          artifactKind: "teaching_document",
          attemptId: generationAttemptId,
          event: "artifact.generation.started",
          workflowId: DBOS.workflowID,
        },
        "Artifact generation started",
      );
      const result = await generateDraft(artifactId, generationAttemptId, generation.request);
      activeAttemptId = result.attemptId;
      const streamKey = artifactDbosStreamKey(result.attemptId);
      if (result.status === "failure") {
        await failGeneration(artifactId, generationAttemptId, result.failureCode);
        await DBOS.writeStream(
          streamKey,
          JSON.stringify(
            teachingDocumentDraftEventSchema.parse({
              event: "failed",
              failureCode: result.failureCode,
              kind: "teaching_document",
              sequence: TEACHING_DOCUMENT_TERMINAL_SEQUENCE,
              version: 3,
            }),
          ),
        );
        await DBOS.closeStream(streamKey);
        workerLogger.error(
          {
            artifactId,
            artifactKind: "teaching_document",
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
          artifactKind: "teaching_document",
          attemptId: generationAttemptId,
          event: "artifact.generation.stage_changed",
          stage: "finalizing",
          workflowId: DBOS.workflowID,
        },
        "Artifact generation entered finalization",
      );
      await prepareFinalization(artifactId);
      const artifact = await finalizeGeneration(artifactId, result, generation.actorId);
      await DBOS.writeStream(
        streamKey,
        JSON.stringify(
          teachingDocumentDraftEventSchema.parse({
            contentSha256: artifact.contentSha256,
            event: result.outcome === "partial" ? "partial_completed" : "completed",
            kind: "teaching_document",
            revisionId: artifact.revisionId,
            sequence: TEACHING_DOCUMENT_TERMINAL_SEQUENCE,
            version: 3,
          }),
        ),
      );
      await DBOS.closeStream(streamKey);
      activeAttemptId = null;
      workerLogger.info(
        {
          artifactId,
          artifactKind: "teaching_document",
          attemptId: generationAttemptId,
          durationMs: Date.now() - startedAt,
          event: "artifact.generation.completed",
          workflowId: DBOS.workflowID,
        },
        "Artifact generation completed",
      );
      return artifact;
    } catch (error) {
      const failureCode = teachingDocumentGenerationFailureCode(error);
      await failGeneration(artifactId, generationAttemptId, failureCode);
      if (activeAttemptId) await DBOS.closeStream(artifactDbosStreamKey(activeAttemptId));
      workerLogger.error(
        {
          artifactId,
          artifactKind: "teaching_document",
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

  return DBOS.registerWorkflow(teachingDocumentWorkflow, {
    inputSchema: z.tuple([z.string().uuid(), z.string().uuid()]),
    maxRecoveryAttempts: 100,
    name: TEACHING_DOCUMENT_DBOS_WORKFLOW,
    serialization: "portable",
  });
}
