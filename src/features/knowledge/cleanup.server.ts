import "server-only";

import { eq } from "drizzle-orm";
import { type Database, database } from "@/database/client";
import { retrievalIndexGenerations } from "@/database/schema";
import type { KnowledgeSourceCleanupOperations } from "./cleanup";
import { stratumindEnvironment } from "./config";
import { createStratumindIndexPort, type KnowledgeIndexPort } from "./index-writer";

export function createKnowledgeSourceCleanupOperations(
  db: Database = database,
  initialIndex?: KnowledgeIndexPort,
): KnowledgeSourceCleanupOperations {
  let index = initialIndex;
  return {
    async listWorkflowIds(sourceId) {
      const rows = await db
        .select({ id: retrievalIndexGenerations.workflowId })
        .from(retrievalIndexGenerations)
        .where(eq(retrievalIndexGenerations.sourceId, sourceId));
      return rows.map((row) => row.id);
    },
    async purgeDeletedSourceIndex(sourceId) {
      const generations = await db
        .select({
          collection: retrievalIndexGenerations.collectionName,
          id: retrievalIndexGenerations.id,
        })
        .from(retrievalIndexGenerations)
        .where(eq(retrievalIndexGenerations.sourceId, sourceId));
      if (generations.length === 0) return;
      if (!index) {
        const environment = stratumindEnvironment();
        index = createStratumindIndexPort({
          url: environment.url,
          ...(environment.apiKey ? { apiKey: environment.apiKey } : {}),
        });
      }
      for (const generation of generations) {
        await index.removeGeneration({
          collection: generation.collection,
          generationId: generation.id,
        });
      }
      await db
        .delete(retrievalIndexGenerations)
        .where(eq(retrievalIndexGenerations.sourceId, sourceId));
    },
  };
}
