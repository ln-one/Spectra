import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import type { DatabaseTransaction } from "@/database/client";
import {
  type artifactRevisions,
  artifactSources,
  type artifacts,
  sources,
} from "@/database/schema";
import { isArtifactSourceKind } from "@/features/artifacts/types";
import {
  knowledgeIndexGenerationConfig,
  stageArtifactKnowledgeIndexGeneration,
} from "@/features/knowledge/indexing.server";
import { safeLogError, webLogger } from "@/observability/server";

type ArtifactRevisionPublication = {
  artifact: typeof artifacts.$inferSelect;
  revision: typeof artifactRevisions.$inferSelect;
};

function indexingConfig() {
  try {
    return knowledgeIndexGenerationConfig();
  } catch (error) {
    webLogger.error(
      {
        component: "artifact-source",
        error: safeLogError(error),
        event: "artifact.source.indexing_config_failed",
        retryable: true,
      },
      "Artifact Source indexing configuration is unavailable",
    );
    return null;
  }
}

async function stageArtifactRevision(
  transaction: DatabaseTransaction,
  sourceId: string,
  artifactRevisionId: string,
) {
  const config = indexingConfig();
  if (!config) return;
  await stageArtifactKnowledgeIndexGeneration(
    transaction,
    { artifactRevisionId, sourceId },
    config,
  );
}

export async function publishArtifactSourceRevision(
  transaction: DatabaseTransaction,
  context: ArtifactRevisionPublication,
) {
  if (!isArtifactSourceKind(context.artifact.kind)) return;
  const [source] = await transaction
    .select({ id: sources.id })
    .from(artifactSources)
    .innerJoin(sources, eq(artifactSources.sourceId, sources.id))
    .where(and(eq(artifactSources.artifactId, context.artifact.id), isNull(sources.deletedAt)))
    .limit(1);
  if (!source) return;
  await stageArtifactRevision(transaction, source.id, context.revision.id);
}
