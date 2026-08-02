import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { DrizzleDataSource } from "@dbos-inc/drizzle-datasource";
import { eq, lt } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import type { Database } from "@/database/client";
import * as databaseSchema from "@/database/schema";
import { artifactSuggestionSnapshots, principals, workspaces } from "@/database/schema";
import {
  type ArtifactSuggestionTarget,
  artifactSuggestionTargetSchema,
} from "@/features/artifacts/suggestions/contract";
import type { Locale } from "@/i18n/config";
import { workerLogger } from "@/observability/server";
import type { DbosScheduleDefinition } from "@/worker/dbos-schedules";
import { ARTIFACT_DBOS_SCHEMA } from "../dbos-queue.server";
import { ARTIFACT_SUGGESTIONS_WORKFLOW } from "./suggestion-dbos";
import {
  artifactSuggestionContextHash,
  readArtifactSuggestionSnapshot,
  writeArtifactSuggestionSnapshotIfCurrentRequest,
} from "./suggestion-snapshots.server";
import { generateArtifactSuggestions, loadArtifactSuggestionContext } from "./suggestions";

const localeSchema = z.enum(["zh-CN", "en-US"]);

export function registerArtifactSuggestionDbosWorkflows(input: {
  db: Database;
  maintenanceQueueName: string;
  pool: Pool;
}): DbosScheduleDefinition[] {
  const dataSource = new DrizzleDataSource<Database>(
    "spectra-suggestion-product",
    input.pool,
    databaseSchema,
    ARTIFACT_DBOS_SCHEMA,
  );
  const generate = DBOS.registerStep(
    async (
      workspaceId: string,
      locale: Locale,
      target: ArtifactSuggestionTarget,
      expectedContextHash: string,
    ) => {
      const [owner] = await input.db
        .select({ handle: principals.handle, principalId: principals.id })
        .from(workspaces)
        .innerJoin(principals, eq(principals.id, workspaces.ownerId))
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (!owner) return null;
      const context = await loadArtifactSuggestionContext(owner, workspaceId, locale, target);
      if (artifactSuggestionContextHash(context) !== expectedContextHash) return null;
      const snapshot = await readArtifactSuggestionSnapshot(context, new Date(), input.db);
      const previousSuggestions =
        snapshot.status === "fresh" || snapshot.status === "stale" ? snapshot.suggestions : [];
      const suggestions = await generateArtifactSuggestions(
        context,
        DBOS.stepStatus?.timeoutSignal ?? AbortSignal.timeout(30_000),
        previousSuggestions,
      );
      return { context, suggestions };
    },
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 3,
      name: "generateArtifactSuggestions",
      retriesAllowed: true,
      timeoutMS: 30_000,
    },
  );
  const contextIsCurrent = DBOS.registerStep(
    async (
      workspaceId: string,
      locale: Locale,
      target: ArtifactSuggestionTarget,
      expectedContextHash: string,
    ) => {
      const [owner] = await input.db
        .select({ handle: principals.handle, principalId: principals.id })
        .from(workspaces)
        .innerJoin(principals, eq(principals.id, workspaces.ownerId))
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (!owner) return false;
      const context = await loadArtifactSuggestionContext(owner, workspaceId, locale, target);
      return artifactSuggestionContextHash(context) === expectedContextHash;
    },
    { name: "artifactSuggestionContextIsCurrent" },
  );
  const save = dataSource.registerTransaction(
    async (
      result: NonNullable<Awaited<ReturnType<typeof generate>>>,
      requestEpoch: number,
      generatedAtIso: string,
    ) => {
      return writeArtifactSuggestionSnapshotIfCurrentRequest(
        result.context,
        result.suggestions,
        requestEpoch,
        new Date(generatedAtIso),
        dataSource.client,
      );
    },
    { name: "saveArtifactSuggestions" },
  );
  async function suggestionWorkflow(
    workspaceId: string,
    locale: Locale,
    target: ArtifactSuggestionTarget,
    expectedContextHash: string | undefined,
    requestEpoch: number | undefined,
  ) {
    const startedAt = Date.now();
    workerLogger.info(
      {
        artifactKind: target,
        component: "artifact-suggestions",
        event: "artifact.suggestions.started",
        locale,
        workflowId: DBOS.workflowID,
        workspaceId,
      },
      "Artifact suggestion generation started",
    );
    try {
      let shouldSave = false;
      if (expectedContextHash !== undefined && requestEpoch !== undefined) {
        const result = await generate(workspaceId, locale, target, expectedContextHash);
        if (
          result !== null &&
          (await contextIsCurrent(workspaceId, locale, target, expectedContextHash))
        ) {
          shouldSave = await save(result, requestEpoch, new Date().toISOString());
        }
      }
      workerLogger.info(
        {
          artifactKind: target,
          component: "artifact-suggestions",
          durationMs: Date.now() - startedAt,
          event: shouldSave ? "artifact.suggestions.completed" : "artifact.suggestions.skipped",
          locale,
          workflowId: DBOS.workflowID,
          workspaceId,
        },
        shouldSave
          ? "Artifact suggestion generation completed"
          : "Artifact suggestion generation skipped",
      );
    } catch (error) {
      workerLogger.error(
        {
          artifactKind: target,
          component: "artifact-suggestions",
          durationMs: Date.now() - startedAt,
          error,
          event: "artifact.suggestions.failed",
          locale,
          workflowId: DBOS.workflowID,
          workspaceId,
        },
        "Artifact suggestion generation failed",
      );
      throw error;
    }
  }
  DBOS.registerWorkflow(suggestionWorkflow, {
    inputSchema: z.tuple([
      z.string().uuid(),
      localeSchema,
      artifactSuggestionTargetSchema,
      z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      z.number().int().positive().optional(),
    ]),
    maxRecoveryAttempts: 100,
    name: ARTIFACT_SUGGESTIONS_WORKFLOW,
    serialization: "portable",
  });

  const purgeExpired = dataSource.registerTransaction(
    async (cutoffIso: string) => {
      await dataSource.client
        .delete(artifactSuggestionSnapshots)
        .where(lt(artifactSuggestionSnapshots.expiresAt, new Date(cutoffIso)));
    },
    { name: "purgeExpiredArtifactSuggestions" },
  );
  async function cleanupSuggestions(scheduledAt: Date, _startedAt: Date) {
    await purgeExpired(scheduledAt.toISOString());
  }
  const cleanup = DBOS.registerWorkflow(cleanupSuggestions, {
    maxRecoveryAttempts: 100,
    name: "cleanupArtifactSuggestions",
    serialization: "portable",
  });
  return [
    {
      automaticBackfill: false,
      queueName: input.maintenanceQueueName,
      schedule: "0 3 * * *",
      scheduleName: "cleanupArtifactSuggestionsDaily",
      workflowFn: cleanup,
    },
  ];
}
