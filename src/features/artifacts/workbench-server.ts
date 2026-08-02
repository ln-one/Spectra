import "server-only";

import { and, asc, desc, eq, exists, isNull, notExists, or } from "drizzle-orm";
import { type Database, database } from "@/database/client";
import { artifactSources, artifacts, sources } from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import {
  requireWorkspacePermission,
  type WorkspaceAccessSnapshot,
} from "@/features/workspaces/access.server";
import { hasWorkspacePermission, type WorkspacePermission } from "@/features/workspaces/policy";
import type { ArtifactDetail } from "./contract";
import { cancelArtifactDbosExecution } from "./dbos-client.server";
import { ArtifactError } from "./errors";
import { type ArtifactCleanupQueue, tombstoneArtifact } from "./lifecycle.server";
import { artifactServerModule } from "./server-modules.server";
import {
  type ArtifactHistoryItem,
  artifactEffectiveGenerationState,
  artifactGenerationStateSchema,
  artifactHistoryItemSchema,
  artifactKindSchema,
} from "./types";

type ArtifactScope = { conversationId: string; workspaceId: string };
type ArtifactLookup = ArtifactScope & { artifactId: string };

async function findAccessibleArtifact(
  actor: Actor,
  input: ArtifactScope & {
    artifactId?: string;
    kind?: ArtifactHistoryItem["kind"];
    sourceUserMessageId?: string;
    access: "manage" | "read";
  },
  db: Database,
  accessSnapshot?: WorkspaceAccessSnapshot,
) {
  const permission: WorkspacePermission =
    input.access === "manage" ? "artifact.private.manage" : "workspace.read";
  if (
    accessSnapshot?.workspaceId !== input.workspaceId ||
    !hasWorkspacePermission(accessSnapshot.permissions, permission)
  ) {
    await requireWorkspacePermission(actor, input.workspaceId, permission, db);
  }
  const [row] = await db
    .select({
      conversationId: artifacts.conversationId,
      createdByPrincipalId: artifacts.createdByPrincipalId,
      generationAttemptId: artifacts.generationAttemptId,
      id: artifacts.id,
      kind: artifacts.kind,
    })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.workspaceId, input.workspaceId),
        isNull(artifacts.deletedAt),
        input.access === "manage"
          ? and(
              eq(artifacts.createdByPrincipalId, actor.principalId),
              eq(artifacts.conversationId, input.conversationId),
            )
          : or(
              and(
                eq(artifacts.createdByPrincipalId, actor.principalId),
                eq(artifacts.conversationId, input.conversationId),
              ),
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
        ...(input.artifactId ? [eq(artifacts.id, input.artifactId)] : []),
        ...(input.sourceUserMessageId
          ? [eq(artifacts.sourceUserMessageId, input.sourceUserMessageId)]
          : []),
        ...(input.kind ? [eq(artifacts.kind, input.kind)] : []),
      ),
    )
    .limit(1);
  if (!row?.conversationId) throw new ArtifactError("artifact_not_found");
  return {
    conversationId: row.conversationId,
    createdByPrincipalId: row.createdByPrincipalId,
    generationAttemptId: row.generationAttemptId,
    id: row.id,
    kind: artifactKindSchema.parse(row.kind),
  };
}

function normalizeModuleError(module: { isNotFoundError: (error: unknown) => boolean }) {
  return (error: unknown): never => {
    if (module.isNotFoundError(error)) throw new ArtifactError("artifact_not_found");
    throw error;
  };
}

export async function listArtifactHistory(
  actor: Actor,
  input: ArtifactScope,
  db: Database = database,
  accessSnapshot?: WorkspaceAccessSnapshot,
): Promise<ArtifactHistoryItem[]> {
  if (
    accessSnapshot?.workspaceId !== input.workspaceId ||
    !hasWorkspacePermission(accessSnapshot.permissions, "workspace.read")
  ) {
    await requireWorkspacePermission(actor, input.workspaceId, "workspace.read", db);
  }
  const rows = await db
    .select({
      createdAt: artifacts.createdAt,
      currentRevisionId: artifacts.currentRevisionId,
      generationState: artifacts.generationState,
      id: artifacts.id,
      kind: artifacts.kind,
      title: artifacts.title,
      updatedAt: artifacts.updatedAt,
    })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.createdByPrincipalId, actor.principalId),
        eq(artifacts.workspaceId, input.workspaceId),
        eq(artifacts.conversationId, input.conversationId),
        isNull(artifacts.deletedAt),
        notExists(
          db
            .select({ sourceId: artifactSources.sourceId })
            .from(artifactSources)
            .innerJoin(sources, eq(artifactSources.sourceId, sources.id))
            .where(and(eq(artifactSources.artifactId, artifacts.id), isNull(sources.deletedAt))),
        ),
      ),
    )
    .orderBy(desc(artifacts.updatedAt), asc(artifacts.id))
    .limit(50);
  return rows.map((row) =>
    artifactHistoryItemSchema.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
      generationState: artifactEffectiveGenerationState({
        currentRevisionId: row.currentRevisionId,
        generationState: artifactGenerationStateSchema.parse(row.generationState),
      }),
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
}

export async function deleteArtifactForConversationWithCleanup(
  actor: Actor,
  input: ArtifactLookup,
  cleanupQueue: ArtifactCleanupQueue,
  db: Database = database,
) {
  const artifact = await findAccessibleArtifact(actor, { ...input, access: "manage" }, db);
  await tombstoneArtifact({
    actorId: actor.principalId,
    ...input,
    db,
    enqueueCleanup: (transaction, artifactId) => cleanupQueue.enqueue(transaction, artifactId),
    kind: artifact.kind,
  });
  if (artifact.generationAttemptId) {
    const module = artifactServerModule(artifact.kind);
    await Promise.allSettled([
      cancelArtifactDbosExecution(artifact.generationAttemptId),
      ...("cancelGeneration" in module && module.cancelGeneration
        ? [module.cancelGeneration(artifact.generationAttemptId)]
        : []),
    ]);
  }
}

export async function getArtifactDetailForConversation(
  actor: Actor,
  input: ArtifactLookup,
  db: Database = database,
  accessSnapshot?: WorkspaceAccessSnapshot,
): Promise<ArtifactDetail> {
  const artifact = await findAccessibleArtifact(
    actor,
    { ...input, access: "read" },
    db,
    accessSnapshot,
  );
  const module = artifactServerModule(artifact.kind);
  try {
    return await module.getDetail(actor, { ...input, conversationId: artifact.conversationId }, db);
  } catch (error) {
    return normalizeModuleError(module)(error);
  }
}

export async function canManageArtifactForConversation(
  actor: Actor,
  input: ArtifactLookup,
  db: Database = database,
  accessSnapshot?: WorkspaceAccessSnapshot,
) {
  try {
    await findAccessibleArtifact(actor, { ...input, access: "manage" }, db, accessSnapshot);
    return true;
  } catch (error) {
    if (error instanceof ArtifactError && error.code === "artifact_not_found") return false;
    throw error;
  }
}
