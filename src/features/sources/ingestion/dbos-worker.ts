import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { DrizzleDataSource } from "@dbos-inc/drizzle-datasource";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import type { Database } from "@/database/client";
import * as databaseSchema from "@/database/schema";
import { sourceIngestions } from "@/database/schema";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import { workerLogger } from "@/observability/server";
import { createS3SourceStorage } from "../s3-storage";
import { SOURCE_INGESTION_DBOS_WORKFLOW, SOURCE_INGESTION_POLL_DELAY_MS } from "./dbos";
import { analyzeMedia } from "./media-understanding";
import { createMinerUProvider } from "./mineru";
import {
  ingestionFailure,
  markSourceIngestionFailed,
  pollSourceIngestion,
  type SourceIngestionProcessorDependencies,
  submitSourceIngestion,
} from "./processor";

type RegisterSourceIngestionWorkflowInput = {
  db: Database;
  pool: Pool;
  dependencies?: SourceIngestionProcessorDependencies;
  knowledgeIndexingEnabled: boolean;
  scheduleReadyIngestion: (ingestionId: string) => Promise<void>;
};

export function shouldScheduleKnowledgeIndexing(ready: boolean, enabled: boolean) {
  return ready && enabled;
}

export function registerSourceIngestionDbosWorkflow(input: RegisterSourceIngestionWorkflowInput) {
  const dependencies =
    input.dependencies ??
    ({
      analyzeMedia,
      db: input.db,
      now: () => new Date(),
      provider: createMinerUProvider(),
      storage: createS3SourceStorage(),
    } satisfies SourceIngestionProcessorDependencies);
  const sourceDataSource = new DrizzleDataSource<Database>(
    "spectra-source-product",
    input.pool,
    databaseSchema,
    ARTIFACT_DBOS_SCHEMA,
  );
  const loadState = sourceDataSource.registerTransaction(
    async (ingestionId: string) => {
      const [ingestion] = await sourceDataSource.client
        .select({
          provider: sourceIngestions.provider,
          providerBatchId: sourceIngestions.providerBatchId,
          state: sourceIngestions.state,
        })
        .from(sourceIngestions)
        .where(eq(sourceIngestions.id, ingestionId))
        .limit(1);
      return ingestion ?? null;
    },
    { name: "loadSourceIngestionState" },
  );
  const submit = DBOS.registerStep(
    (ingestionId: string) => submitSourceIngestion(ingestionId, dependencies),
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 3,
      name: "submitSourceIngestion",
      retriesAllowed: true,
      shouldRetry: (error) => ingestionFailure(error).retryable,
    },
  );
  const poll = DBOS.registerStep(
    (ingestionId: string) => pollSourceIngestion(ingestionId, dependencies),
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 3,
      name: "pollSourceIngestion",
      retriesAllowed: true,
      shouldRetry: (error) => ingestionFailure(error).retryable,
    },
  );
  const fail = DBOS.registerStep(
    async (
      ingestionId: string,
      errorCode: ReturnType<typeof ingestionFailure>["errorCode"],
      retryable: boolean,
    ) => {
      await markSourceIngestionFailed(ingestionId, { errorCode, retryable }, dependencies);
    },
    { name: "failSourceIngestion" },
  );
  const loadKnowledgeIndexingPolicy = DBOS.registerStep(
    async () => input.knowledgeIndexingEnabled,
    { name: "loadKnowledgeIndexingPolicy" },
  );
  const scheduleKnowledgeIndexing = DBOS.registerStep(
    async (ingestionId: string) => input.scheduleReadyIngestion(ingestionId),
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 4,
      name: "scheduleKnowledgeIndexing",
      retriesAllowed: true,
    },
  );

  async function processSourceIngestion(ingestionId: string) {
    let ready = false;
    try {
      await submit(ingestionId);
      while (true) {
        const state = await loadState(ingestionId);
        if (
          state?.state !== "processing" ||
          state.provider !== "mineru" ||
          !state.providerBatchId
        ) {
          ready = state?.state === "ready";
          break;
        }
        await DBOS.sleep(SOURCE_INGESTION_POLL_DELAY_MS);
        await poll(ingestionId);
      }
    } catch (error) {
      const failure = ingestionFailure(error);
      await fail(ingestionId, failure.errorCode, failure.retryable);
      workerLogger.error(
        {
          component: "source-ingestion",
          error,
          event: "source.ingestion.failed",
          failureCode: failure.errorCode,
          ingestionId,
          retryable: failure.retryable,
          workflowId: DBOS.workflowID,
        },
        "Source ingestion failed",
      );
      return { failed: true, ready: false };
    }
    return { failed: false, ready };
  }

  async function sourceIngestionWorkflow(ingestionId: string) {
    const startedAt = Date.now();
    workerLogger.info(
      {
        component: "source-ingestion",
        event: "source.ingestion.started",
        ingestionId,
        workflowId: DBOS.workflowID,
      },
      "Source ingestion started",
    );
    const knowledgeIndexingEnabled = await loadKnowledgeIndexingPolicy();
    const result = await processSourceIngestion(ingestionId);
    if (shouldScheduleKnowledgeIndexing(result.ready, knowledgeIndexingEnabled)) {
      await scheduleKnowledgeIndexing(ingestionId);
    }
    if (!result.failed) {
      workerLogger.info(
        {
          component: "source-ingestion",
          durationMs: Date.now() - startedAt,
          event: result.ready ? "source.ingestion.ready" : "source.ingestion.completed",
          ingestionId,
          knowledgeIndexingScheduled: result.ready && knowledgeIndexingEnabled,
          ready: result.ready,
          workflowId: DBOS.workflowID,
        },
        "Source ingestion completed",
      );
    }
  }

  return DBOS.registerWorkflow(sourceIngestionWorkflow, {
    inputSchema: z.tuple([z.string().uuid()]),
    maxRecoveryAttempts: 100,
    name: SOURCE_INGESTION_DBOS_WORKFLOW,
    serialization: "portable",
  });
}
