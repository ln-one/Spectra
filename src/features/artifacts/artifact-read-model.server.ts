import "server-only";

import { and, eq, exists, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import { artifactRevisions, artifactSources, artifacts, sources } from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import { requireWorkspacePermission } from "@/features/workspaces/access.server";
import { artifactGroundingSourcesFromMetadata } from "./grounding";
import type { ArtifactKind } from "./types";

const artifactLookupSchema = z
  .object({
    artifactId: z.string().uuid(),
    conversationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export function createArtifactReadModel<const Kind extends ArtifactKind, Content>(config: {
  contentSchema: z.ZodType<Content>;
  errorLabel: string;
  kind: Kind;
  notFoundError(): Error;
}) {
  function toRevision(row: typeof artifactRevisions.$inferSelect) {
    return {
      artifactId: row.artifactId,
      content: config.contentSchema.parse(row.content),
      contentSha256: row.contentSha256,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      parentRevisionId: row.parentRevisionId,
      revisionNumber: row.revisionNumber,
    };
  }

  function toArtifact(
    row: typeof artifacts.$inferSelect,
    revision: typeof artifactRevisions.$inferSelect,
  ) {
    if (
      row.kind !== config.kind ||
      row.currentRevisionId !== revision.id ||
      revision.artifactId !== row.id
    ) {
      throw new Error(`${config.errorLabel} current revision invariant failed`);
    }
    return {
      createdAt: row.createdAt.toISOString(),
      currentRevision: toRevision(revision),
      groundingSources: artifactGroundingSourcesFromMetadata(revision.generationMetadata),
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      workspaceId: row.workspaceId,
    };
  }

  async function requirePrivateArtifactCreate(actor: Actor, workspaceId: string, db: Database) {
    try {
      await requireWorkspacePermission(actor, workspaceId, "workspace.read", db);
      await requireWorkspacePermission(actor, workspaceId, "artifact.private.create", db);
    } catch {
      throw config.notFoundError();
    }
  }

  async function requirePrivateArtifactManage(
    actor: Actor,
    input: { artifactId: string; conversationId: string; workspaceId: string },
    db: Database | DatabaseTransaction,
  ) {
    const parsed = artifactLookupSchema.safeParse({
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    });
    if (!parsed.success) throw config.notFoundError();
    try {
      await requireWorkspacePermission(
        actor,
        parsed.data.workspaceId,
        "artifact.private.manage",
        db,
      );
    } catch {
      throw config.notFoundError();
    }
    const [artifact] = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.id, parsed.data.artifactId),
          eq(artifacts.workspaceId, parsed.data.workspaceId),
          eq(artifacts.conversationId, parsed.data.conversationId),
          eq(artifacts.kind, config.kind),
          eq(artifacts.createdByPrincipalId, actor.principalId),
          isNull(artifacts.deletedAt),
        ),
      )
      .limit(1);
    if (!artifact) throw config.notFoundError();
  }

  async function getDetailForConversation<Detail>(
    actor: Actor,
    input: { artifactId: string; conversationId: string; workspaceId: string },
    toDetail: (
      artifact: typeof artifacts.$inferSelect,
      revision: typeof artifactRevisions.$inferSelect | null,
    ) => Detail,
    db: Database = database,
  ) {
    const parsed = artifactLookupSchema.safeParse(input);
    if (!parsed.success) throw config.notFoundError();
    await requireWorkspacePermission(actor, parsed.data.workspaceId, "workspace.read", db);
    const [row] = await db
      .select({ artifact: artifacts, revision: artifactRevisions })
      .from(artifacts)
      .leftJoin(
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
          eq(artifacts.kind, config.kind),
          isNull(artifacts.deletedAt),
          or(
            eq(artifacts.createdByPrincipalId, actor.principalId),
            exists(
              db
                .select({ sourceId: artifactSources.sourceId })
                .from(artifactSources)
                .innerJoin(sources, eq(artifactSources.sourceId, sources.id))
                .where(
                  and(eq(artifactSources.artifactId, artifacts.id), isNull(sources.deletedAt)),
                ),
            ),
          ),
        ),
      )
      .limit(1);
    if (!row) throw config.notFoundError();
    return toDetail(row.artifact, row.revision);
  }

  return {
    getDetailForConversation,
    requirePrivateArtifactCreate,
    requirePrivateArtifactManage,
    toArtifact,
    toRevision,
  };
}
