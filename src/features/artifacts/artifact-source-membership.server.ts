import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { type Database, database, productPool } from "@/database/client";
import { artifactRevisions, artifactSources, artifacts, sources } from "@/database/schema";
import { ArtifactError } from "@/features/artifacts/errors";
import {
  artifactGenerationStateSchema,
  artifactSourceKindSchema,
  isArtifactSourceKind,
} from "@/features/artifacts/types";
import type { Actor } from "@/features/identity/types";
import { enqueueKnowledgeIndexWorkflow } from "@/features/knowledge/dbos";
import {
  knowledgeIndexGenerationConfig,
  stageArtifactKnowledgeIndexGeneration,
} from "@/features/knowledge/indexing.server";
import type { ArtifactSource } from "@/features/sources/types";
import { requireWorkspacePermission } from "@/features/workspaces/access.server";
import { safeLogError, webLogger } from "@/observability/server";

const inputSchema = z
  .object({
    artifactId: z.string().uuid(),
    conversationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

type ArtifactSourcePublicationDependencies = {
  db: Database;
  enqueueKnowledgeIndex: (
    generation: Parameters<typeof enqueueKnowledgeIndexWorkflow>[1],
  ) => Promise<void>;
};

function defaultPublicationDependencies(): ArtifactSourcePublicationDependencies {
  return {
    db: database,
    enqueueKnowledgeIndex: (generation) => enqueueKnowledgeIndexWorkflow(productPool, generation),
  };
}

export async function publishArtifactSource(
  actor: Actor,
  input: z.input<typeof inputSchema>,
  overrides: Partial<ArtifactSourcePublicationDependencies> = {},
) {
  const dependencies = { ...defaultPublicationDependencies(), ...overrides };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new ArtifactError("artifact_not_found");
  await requireWorkspacePermission(
    actor,
    parsed.data.workspaceId,
    "artifact.publishToSources",
    dependencies.db,
  );

  const membership = await dependencies.db.transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({
        artifact: artifacts,
        revision: artifactRevisions,
      })
      .from(artifacts)
      .innerJoin(
        artifactRevisions,
        and(
          eq(artifacts.currentRevisionId, artifactRevisions.id),
          eq(artifactRevisions.artifactId, artifacts.id),
        ),
      )
      .where(
        and(
          eq(artifacts.id, parsed.data.artifactId),
          eq(artifacts.workspaceId, parsed.data.workspaceId),
          eq(artifacts.conversationId, parsed.data.conversationId),
          isNull(artifacts.deletedAt),
        ),
      )
      .for("update", { of: [artifacts] })
      .limit(1);
    if (
      !candidate ||
      candidate.artifact.createdByPrincipalId !== actor.principalId ||
      (candidate.artifact.kind === "presentation" &&
        candidate.artifact.generationState !== "ready") ||
      !isArtifactSourceKind(candidate.artifact.kind)
    ) {
      throw new ArtifactError("artifact_not_found");
    }

    const [existingMembership] = await transaction
      .select({ source: sources })
      .from(artifactSources)
      .innerJoin(sources, eq(artifactSources.sourceId, sources.id))
      .where(eq(artifactSources.artifactId, candidate.artifact.id))
      .limit(1);
    if (existingMembership && !existingMembership.source.deletedAt) {
      return {
        generation: null,
        sourceId: existingMembership.source.id,
        source: artifactSourceResponse(
          existingMembership.source,
          candidate.artifact,
          candidate.revision,
        ),
      };
    }
    if (existingMembership) {
      await transaction
        .delete(artifactSources)
        .where(eq(artifactSources.sourceId, existingMembership.source.id));
    }

    const sourceId = randomUUID();
    const [source] = await transaction
      .insert(sources)
      .values({
        id: sourceId,
        workspaceId: candidate.artifact.workspaceId,
        kind: "artifact",
      })
      .returning();
    if (!source) throw new Error("Artifact Source creation returned no row");
    await transaction.insert(artifactSources).values({
      sourceId,
      artifactId: candidate.artifact.id,
    });

    let config: ReturnType<typeof knowledgeIndexGenerationConfig> = null;
    try {
      config = knowledgeIndexGenerationConfig();
    } catch (error) {
      webLogger.error(
        {
          artifactId: candidate.artifact.id,
          component: "artifact-source",
          error: safeLogError(error),
          event: "artifact.source.indexing_config_failed",
          retryable: true,
          workspaceId: candidate.artifact.workspaceId,
        },
        "Artifact Source indexing configuration is unavailable",
      );
    }
    const generation = config
      ? await stageArtifactKnowledgeIndexGeneration(
          transaction,
          { artifactRevisionId: candidate.revision.id, sourceId },
          config,
        )
      : null;
    return {
      generation,
      sourceId,
      source: artifactSourceResponse(
        source,
        candidate.artifact,
        candidate.revision,
        generation !== null,
      ),
    };
  });
  if (membership.generation) {
    try {
      await dependencies.enqueueKnowledgeIndex(membership.generation);
    } catch (error) {
      // The durable queued generation remains discoverable by minutely reconciliation.
      webLogger.error(
        {
          artifactId: parsed.data.artifactId,
          component: "artifact-source",
          error: safeLogError(error),
          event: "artifact.source.indexing_dispatch_failed",
          retryable: true,
          workspaceId: parsed.data.workspaceId,
        },
        "Artifact Source indexing dispatch failed",
      );
    }
  }
  return membership;
}

function artifactSourceResponse(
  source: typeof sources.$inferSelect,
  artifact: typeof artifacts.$inferSelect,
  revision: typeof artifactRevisions.$inferSelect,
  queued = false,
): ArtifactSource {
  if (!artifact.conversationId) throw new Error("Artifact Source has no conversation");
  return {
    id: source.id,
    workspaceId: source.workspaceId,
    kind: "artifact",
    artifact: {
      id: artifact.id,
      kind: artifactSourceKindSchema.parse(artifact.kind),
      title: artifact.title,
      conversationId: artifact.conversationId,
      generationState: artifactGenerationStateSchema.parse(artifact.generationState),
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString(),
      currentRevision: {
        id: revision.id,
        revisionNumber: revision.revisionNumber,
      },
    },
    ...(queued
      ? {
          knowledgeIndex: {
            state: "queued" as const,
            chunkCount: 0,
            failureCode: null,
            retryCount: 0,
            nextRetryAt: null,
            updatedAt: source.updatedAt.toISOString(),
          },
        }
      : {}),
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}
