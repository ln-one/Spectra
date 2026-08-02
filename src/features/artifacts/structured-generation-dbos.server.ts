import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { DrizzleDataSource } from "@dbos-inc/drizzle-datasource";
import type { Pool } from "pg";
import { z } from "zod";
import type { Database } from "@/database/client";
import * as databaseSchema from "@/database/schema";
import type { Locale } from "@/i18n/config";
import { workerLogger } from "@/observability/server";
import { ARTIFACT_DBOS_SCHEMA } from "./dbos-queue.server";
import type { ArtifactGroundingBundle } from "./grounding";
import {
  settleArtifactProviderAttempt,
  startArtifactProviderAttempt,
} from "./provider-attempts.server";

type StructuredGenerationRequest = {
  grounding: ArtifactGroundingBundle;
  locale: Locale;
  prompt: string;
};

export function registerStructuredArtifactDbosWorkflow<
  Request extends StructuredGenerationRequest,
  Content,
  FailureCode extends string,
>(input: {
  claim(artifactId: string, attemptId: string, db: Database): Promise<unknown>;
  complete(
    artifactId: string,
    attemptId: string,
    actorId: string,
    content: Content,
    db: Database,
    producingAttemptId?: string | null,
  ): Promise<{ id: string; title: string }>;
  dataSourceName: string;
  db: Database;
  fail(
    artifactId: string,
    failureCode: FailureCode,
    attemptId: string,
    db: Database,
  ): Promise<unknown>;
  failureCode(error: unknown): FailureCode;
  finalizeState(artifactId: string, attemptId: string, db: Database): Promise<unknown>;
  generate(input: {
    abortSignal: AbortSignal;
    grounding: ArtifactGroundingBundle;
    locale: Locale;
    prompt: string;
  }): Promise<{ content: Content }>;
  load(
    artifactId: string,
    db: Database,
  ): Promise<{ artifact: { createdByPrincipalId: string }; request: Request } | null>;
  modelId: string;
  kind: string;
  names: {
    fail: string;
    finalize: string;
    generate: string;
    load: string;
    workflow: string;
  };
  pool: Pool;
}) {
  const dataSource = new DrizzleDataSource<Database>(
    input.dataSourceName,
    input.pool,
    databaseSchema,
    ARTIFACT_DBOS_SCHEMA,
  );
  const loadGeneration = dataSource.registerTransaction(
    async (artifactId: string) => {
      const generation = await input.load(artifactId, dataSource.client);
      return generation
        ? {
            actorId: generation.artifact.createdByPrincipalId,
            request: generation.request,
          }
        : null;
    },
    { name: input.names.load },
  );
  const generate = DBOS.registerStep(
    async (artifactId: string, request: Request, generationAttemptId: string) => {
      let providerAttemptId: string | null = null;
      await input.claim(artifactId, generationAttemptId, input.db);
      try {
        const providerAttempt = await startArtifactProviderAttempt(
          {
            generationAttemptId,
            model: input.modelId,
            provider: "dashscope",
          },
          input.db,
        );
        if (!providerAttempt) throw new Error("artifact_generation_attempt_unavailable");
        providerAttemptId = providerAttempt.id;
        const generated = await input.generate({
          abortSignal: DBOS.stepStatus?.timeoutSignal ?? new AbortController().signal,
          grounding: request.grounding,
          locale: request.locale,
          prompt: request.prompt,
        });
        await settleArtifactProviderAttempt(
          {
            attemptId: providerAttemptId,
            effectiveModel: input.modelId,
            effectiveProvider: "dashscope",
            state: "succeeded",
          },
          input.db,
        );
        await input.finalizeState(artifactId, generationAttemptId, input.db);
        return { attemptId: generationAttemptId, content: generated.content };
      } catch (error) {
        const failureCode = input.failureCode(error);
        if (providerAttemptId) {
          await settleArtifactProviderAttempt(
            { attemptId: providerAttemptId, errorCode: failureCode, state: "failed" },
            input.db,
          );
        }
        throw new Error(failureCode, { cause: error });
      }
    },
    { name: input.names.generate, timeoutMS: 150_000 },
  );
  const finalize = dataSource.registerTransaction(
    async (
      artifactId: string,
      generated: Awaited<ReturnType<typeof generate>>,
      actorId: string,
    ) => {
      const artifact = await input.complete(
        artifactId,
        generated.attemptId,
        actorId,
        generated.content,
        dataSource.client,
        null,
      );
      return { id: artifact.id, title: artifact.title };
    },
    { name: input.names.finalize },
  );
  const fail = dataSource.registerTransaction(
    (artifactId: string, generationAttemptId: string, failureCode: FailureCode) =>
      input.fail(artifactId, failureCode, generationAttemptId, dataSource.client),
    { name: input.names.fail },
  );

  async function workflow(artifactId: string, generationAttemptId: string) {
    const startedAt = Date.now();
    try {
      const generation = await loadGeneration(artifactId);
      if (!generation) return null;
      workerLogger.info(
        {
          artifactId,
          artifactKind: input.kind,
          attemptId: generationAttemptId,
          event: "artifact.generation.started",
          workflowId: DBOS.workflowID,
        },
        "Artifact generation started",
      );
      const generated = await generate(artifactId, generation.request, generationAttemptId);
      workerLogger.info(
        {
          artifactId,
          artifactKind: input.kind,
          attemptId: generationAttemptId,
          event: "artifact.generation.stage_changed",
          stage: "finalizing",
          workflowId: DBOS.workflowID,
        },
        "Artifact generation entered finalization",
      );
      const artifact = await finalize(artifactId, generated, generation.actorId);
      workerLogger.info(
        {
          artifactId,
          artifactKind: input.kind,
          attemptId: generationAttemptId,
          durationMs: Date.now() - startedAt,
          event: "artifact.generation.completed",
          workflowId: DBOS.workflowID,
        },
        "Artifact generation completed",
      );
      return artifact;
    } catch (error) {
      const failureCode = input.failureCode(error);
      await fail(artifactId, generationAttemptId, failureCode);
      workerLogger.error(
        {
          artifactId,
          artifactKind: input.kind,
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
    name: input.names.workflow,
    serialization: "portable",
  });
}
