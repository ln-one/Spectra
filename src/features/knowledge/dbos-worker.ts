import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Pool } from "pg";
import { z } from "zod";
import { workerLogger } from "@/observability/server";
import type { DbosScheduleDefinition } from "@/worker/dbos-schedules";
import {
  KNOWLEDGE_INDEX_DBOS_QUEUE,
  KNOWLEDGE_INDEX_DBOS_WORKFLOW,
  reconcileKnowledgeIndexing,
} from "./dbos";
import { buildKnowledgeIndexGeneration } from "./indexing.server";

export function registerKnowledgeIndexingDbosWorkflow(pool: Pool): DbosScheduleDefinition[] {
  const build = DBOS.registerStep(
    (generationId: string) => buildKnowledgeIndexGeneration(generationId),
    {
      backoffRate: 2,
      intervalSeconds: 10,
      maxAttempts: 3,
      name: "buildKnowledgeIndexGeneration",
      retriesAllowed: true,
    },
  );
  DBOS.registerWorkflow(
    async (generationId: string) => {
      const startedAt = Date.now();
      workerLogger.info(
        {
          event: "knowledge.index.started",
          generationId,
          workflowId: DBOS.workflowID,
        },
        "Knowledge index build started",
      );
      try {
        const result = await build(generationId);
        const bindings = {
          durationMs: Date.now() - startedAt,
          generationId,
          workflowId: DBOS.workflowID,
        };
        if (result.status === "completed") {
          workerLogger.info(
            { ...bindings, event: "knowledge.index.completed" },
            "Knowledge index build completed",
          );
        } else {
          workerLogger.debug(
            { ...bindings, event: "knowledge.index.skipped", stage: result.reason },
            "Knowledge index build skipped",
          );
        }
      } catch (error) {
        workerLogger.error(
          {
            durationMs: Date.now() - startedAt,
            error,
            event: "knowledge.index.failed",
            failureCode: "knowledge_index_build_failed",
            generationId,
            workflowId: DBOS.workflowID,
          },
          "Knowledge index build failed",
        );
        throw error;
      }
    },
    {
      inputSchema: z.tuple([z.string().uuid()]),
      maxRecoveryAttempts: 100,
      name: KNOWLEDGE_INDEX_DBOS_WORKFLOW,
      serialization: "portable",
    },
  );
  const reconcile = DBOS.registerStep(() => reconcileKnowledgeIndexing(pool), {
    name: "reconcileKnowledgeIndexing",
  });
  const reconciliationWorkflow = DBOS.registerWorkflow(
    async (_scheduledAt: Date, _startedAt: Date) => {
      const startedAt = Date.now();
      try {
        const result = await reconcile();
        const bindings = {
          durationMs: Date.now() - startedAt,
          failedCount: result.failedIngestionIds.length,
          garbageCollectedCount: result.garbageCollection.removed,
          garbageCollectionFailureCount: result.garbageCollection.failed,
          queuedCount: result.queued,
          workflowId: DBOS.workflowID,
        };
        if (bindings.failedCount > 0 || bindings.garbageCollectionFailureCount > 0) {
          workerLogger.warn(
            { ...bindings, event: "knowledge.reconciliation.degraded" },
            "Knowledge indexing reconciliation completed with failures",
          );
        } else if (bindings.queuedCount > 0 || bindings.garbageCollectedCount > 0) {
          workerLogger.info(
            { ...bindings, event: "knowledge.reconciliation.completed" },
            "Knowledge indexing reconciliation completed",
          );
        } else {
          workerLogger.debug(
            { ...bindings, event: "knowledge.reconciliation.completed" },
            "Knowledge indexing reconciliation found no work",
          );
        }
      } catch (error) {
        workerLogger.error(
          {
            durationMs: Date.now() - startedAt,
            error,
            event: "knowledge.reconciliation.failed",
            failureCode: "knowledge_reconciliation_failed",
            workflowId: DBOS.workflowID,
          },
          "Knowledge indexing reconciliation failed",
        );
        throw error;
      }
    },
    {
      maxRecoveryAttempts: 100,
      name: "reconcileKnowledgeIndexingScheduled",
      serialization: "portable",
    },
  );
  return [
    {
      automaticBackfill: false,
      queueName: KNOWLEDGE_INDEX_DBOS_QUEUE,
      schedule: "* * * * *",
      scheduleName: "reconcileKnowledgeIndexingMinutely",
      workflowFn: reconciliationWorkflow,
    },
  ];
}
