import "server-only";

import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import type { Pool } from "pg";
import { database } from "@/database/client";
import { artifactSources, artifacts, retrievalIndexGenerations, sources } from "@/database/schema";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import { artifactSourceKindSchema } from "@/features/artifacts/types";
import { knowledgeIndexingEnabled } from "./config";
import {
  collectObsoleteKnowledgeIndexGenerations,
  createKnowledgeIndexGeneration,
  defaultKnowledgeIndexingDependencies,
  knowledgeIndexGenerationConfig,
  stageArtifactKnowledgeIndexGeneration,
} from "./indexing.server";

export const KNOWLEDGE_INDEX_DBOS_QUEUE = "knowledge-index";
export const KNOWLEDGE_INDEX_DBOS_WORKFLOW = "indexKnowledgeGeneration";

export function artifactGenerationReconciliationKey(input: {
  artifactRevisionId: string | null;
  sourceId: string;
}) {
  return input.artifactRevisionId ? `${input.sourceId}:${input.artifactRevisionId}` : null;
}

export async function enqueueKnowledgeIndexWorkflow(
  pool: Pool,
  input: { generationId: string; workflowId: string },
) {
  const result = await pool.query<{ workflowId: string }>(
    `
    SELECT ${ARTIFACT_DBOS_SCHEMA}.enqueue_workflow(
      workflow_name => $1,
      queue_name => $2,
      positional_args => ARRAY[$3::json],
      workflow_id => $4
    ) AS "workflowId"
  `,
    [
      KNOWLEDGE_INDEX_DBOS_WORKFLOW,
      KNOWLEDGE_INDEX_DBOS_QUEUE,
      JSON.stringify(input.generationId),
      input.workflowId,
    ],
  );
  if (result.rows[0]?.workflowId !== input.workflowId)
    throw new Error("Knowledge indexing workflow was not created");
}

export async function queueKnowledgeIndexForIngestion(ingestionId: string, pool: Pool) {
  if (!knowledgeIndexingEnabled()) return null;
  const dependencies = defaultKnowledgeIndexingDependencies();
  const generation = await createKnowledgeIndexGeneration(ingestionId, {
    db: database,
    collection: dependencies.collection,
    embeddingModel: dependencies.embeddingModel,
    embeddingDimension: dependencies.embeddingDimension,
    now: dependencies.now,
  });
  if (generation) await enqueueKnowledgeIndexWorkflow(pool, generation);
  return generation?.generationId ?? null;
}

export async function reconcileKnowledgeIndexing(pool: Pool) {
  if (!knowledgeIndexingEnabled()) {
    return { queued: 0, failedIngestionIds: [], garbageCollection: { removed: 0, failed: 0 } };
  }
  const now = new Date();
  const recoverable = await database
    .select({
      artifactRevisionId: retrievalIndexGenerations.artifactRevisionId,
      generationId: retrievalIndexGenerations.id,
      ingestionId: retrievalIndexGenerations.sourceIngestionId,
      sourceId: retrievalIndexGenerations.sourceId,
      state: retrievalIndexGenerations.state,
      workflowId: retrievalIndexGenerations.workflowId,
    })
    .from(retrievalIndexGenerations)
    .where(
      or(
        eq(retrievalIndexGenerations.state, "queued"),
        and(
          eq(retrievalIndexGenerations.state, "failed"),
          lte(retrievalIndexGenerations.nextRetryAt, now),
        ),
      ),
    );
  let queued = 0;
  const failedIngestionIds: string[] = [];
  const reconciledArtifactGenerations = new Set<string>();
  for (const generation of recoverable) {
    const artifactGenerationKey = artifactGenerationReconciliationKey(generation);
    if (artifactGenerationKey) reconciledArtifactGenerations.add(artifactGenerationKey);
    try {
      if (generation.state === "queued") {
        await enqueueKnowledgeIndexWorkflow(pool, generation);
        queued += 1;
      } else if (generation.ingestionId) {
        if (await queueKnowledgeIndexForIngestion(generation.ingestionId, pool)) queued += 1;
      } else if (generation.artifactRevisionId) {
        const artifactRevisionId = generation.artifactRevisionId;
        const config = knowledgeIndexGenerationConfig();
        if (!config) continue;
        const retried = await database.transaction((transaction) =>
          stageArtifactKnowledgeIndexGeneration(
            transaction,
            {
              artifactRevisionId,
              sourceId: generation.sourceId,
            },
            config,
          ),
        );
        if (retried) {
          await enqueueKnowledgeIndexWorkflow(pool, retried);
          queued += 1;
        }
      }
    } catch {
      failedIngestionIds.push(
        generation.ingestionId ?? generation.artifactRevisionId ?? generation.generationId,
      );
    }
  }
  const activeArtifactSources = await database
    .select({
      artifactRevisionId: artifacts.currentRevisionId,
      sourceId: artifactSources.sourceId,
    })
    .from(artifactSources)
    .innerJoin(sources, eq(artifactSources.sourceId, sources.id))
    .innerJoin(artifacts, eq(artifactSources.artifactId, artifacts.id))
    .where(
      and(
        inArray(artifacts.kind, artifactSourceKindSchema.options),
        isNull(artifacts.deletedAt),
        isNull(sources.deletedAt),
      ),
    );
  const config = knowledgeIndexGenerationConfig();
  if (config) {
    for (const source of activeArtifactSources) {
      const artifactGenerationKey = artifactGenerationReconciliationKey(source);
      if (
        !source.artifactRevisionId ||
        (artifactGenerationKey && reconciledArtifactGenerations.has(artifactGenerationKey))
      ) {
        continue;
      }
      try {
        const artifactRevisionId = source.artifactRevisionId;
        const generation = await database.transaction((transaction) =>
          stageArtifactKnowledgeIndexGeneration(
            transaction,
            {
              artifactRevisionId,
              sourceId: source.sourceId,
            },
            config,
          ),
        );
        if (generation) {
          await enqueueKnowledgeIndexWorkflow(pool, generation);
          queued += 1;
        }
      } catch {
        failedIngestionIds.push(source.artifactRevisionId);
      }
    }
  }
  const dependencies = defaultKnowledgeIndexingDependencies();
  const garbageCollection = await collectObsoleteKnowledgeIndexGenerations({
    db: database,
    index: dependencies.index,
    now: dependencies.now,
  });
  return { queued, failedIngestionIds, garbageCollection };
}
