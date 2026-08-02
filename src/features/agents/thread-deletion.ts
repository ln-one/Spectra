import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Pool } from "pg";
import { type Database, database } from "@/database/client";
import {
  aiConversations,
  aiMessages,
  aiRunAttempts,
  aiRuns,
  artifactGenerationAttempts,
  artifactProviderAttempts,
  artifacts,
} from "@/database/schema";
import { transitionArtifactGenerationAttempt } from "@/features/artifacts/attempt-state";
import { transitionArtifactGeneration } from "@/features/artifacts/generation-state";
import { artifactGenerationStateSchema } from "@/features/artifacts/types";
import {
  type ArtifactCleanupQueue,
  type ConversationCleanupQueue,
  createArtifactCleanupQueue,
  createConversationCleanupQueue,
} from "@/features/maintenance/cleanup-dbos";
import type { Workspace } from "@/features/workspaces/types";
import { transitionAiRun, transitionAiRunAttempt } from "./run-state";
import { withWorkspaceThreadLock, workspaceThreadLockPool } from "./thread-coordination";
import { conversationThreadId } from "./thread-id";

type WorkspaceThreadDeletionDependencies = {
  artifactCleanup?: ArtifactCleanupQueue;
  conversationCleanup?: ConversationCleanupQueue;
  createdByPrincipalId: string;
  db?: Database;
  lockPool?: Pool;
};

export async function deleteWorkspaceThread(
  workspace: Workspace,
  conversationId: string,
  dependencies: WorkspaceThreadDeletionDependencies,
) {
  const threadId = conversationThreadId(workspace.id, conversationId);
  const lockPool = dependencies.lockPool ?? workspaceThreadLockPool;
  return withWorkspaceThreadLock(lockPool, threadId, async () => {
    const conversationCleanup =
      dependencies.conversationCleanup ?? createConversationCleanupQueue();
    const artifactCleanup = dependencies.artifactCleanup ?? createArtifactCleanupQueue();
    const db = dependencies.db ?? database;
    const deleted = await db.transaction(async (tx) => {
      const [conversation] = await tx
        .select()
        .from(aiConversations)
        .where(
          and(
            eq(aiConversations.workspaceId, workspace.id),
            eq(aiConversations.conversationId, conversationId),
            eq(aiConversations.createdByPrincipalId, dependencies.createdByPrincipalId),
          ),
        )
        .limit(1)
        .for("update");
      if (!conversation) return false;
      const deletedAt = new Date();
      await tx
        .update(aiConversations)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(eq(aiConversations.id, conversation.id));
      await tx
        .delete(aiMessages)
        .where(
          and(
            eq(aiMessages.workspaceId, workspace.id),
            eq(aiMessages.conversationId, conversationId),
          ),
        );
      const activeRuns = await tx
        .select({ id: aiRuns.id, state: aiRuns.state })
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.workspaceId, workspace.id),
            eq(aiRuns.conversationId, conversationId),
            inArray(aiRuns.state, ["claimed", "running", "publishing"]),
          ),
        );
      if (activeRuns.length > 0) {
        for (const run of activeRuns) transitionAiRun(run.state, "cancelled");
        const nextAttemptState = transitionAiRunAttempt("running", "cancelled");
        await tx
          .update(aiRunAttempts)
          .set({
            errorCode: "conversation_deleted",
            finishedAt: deletedAt,
            state: nextAttemptState,
            usageState: "unknown",
          })
          .where(
            and(
              inArray(
                aiRunAttempts.runId,
                activeRuns.map((run) => run.id),
              ),
              eq(aiRunAttempts.state, "running"),
            ),
          );
      }
      await tx
        .update(aiRuns)
        .set({
          abortReason: "conversation_deleted",
          failureCode: null,
          finishedAt: deletedAt,
          state: transitionAiRun("running", "cancelled"),
          updatedAt: deletedAt,
        })
        .where(
          and(
            eq(aiRuns.workspaceId, workspace.id),
            eq(aiRuns.conversationId, conversationId),
            inArray(aiRuns.state, ["claimed", "running", "publishing"]),
          ),
        );
      const ownedArtifacts = await tx
        .select({
          generationAttemptId: artifacts.generationAttemptId,
          generationState: artifacts.generationState,
          id: artifacts.id,
        })
        .from(artifacts)
        .where(
          and(
            eq(artifacts.workspaceId, workspace.id),
            eq(artifacts.conversationId, conversationId),
            isNull(artifacts.deletedAt),
          ),
        );
      for (const artifact of ownedArtifacts) {
        const nextGenerationState = transitionArtifactGeneration(
          artifactGenerationStateSchema.parse(artifact.generationState),
          "cancelled",
        );
        await tx
          .update(artifacts)
          .set({
            deletedAt,
            generationAttemptId: null,
            generationDraft: null,
            generationFailureCode: null,
            generationRequest: null,
            generationSequence: 0,
            generationState: nextGenerationState,
            updatedAt: deletedAt,
          })
          .where(eq(artifacts.id, artifact.id));
        if (artifact.generationAttemptId) {
          const [attempt] = await tx
            .select({ state: artifactGenerationAttempts.state })
            .from(artifactGenerationAttempts)
            .where(eq(artifactGenerationAttempts.id, artifact.generationAttemptId))
            .limit(1)
            .for("update");
          if (attempt && ["queued", "running"].includes(attempt.state)) {
            await tx
              .update(artifactGenerationAttempts)
              .set({
                finishedAt: deletedAt,
                state: transitionArtifactGenerationAttempt(attempt.state, "cancelled"),
                updatedAt: deletedAt,
              })
              .where(eq(artifactGenerationAttempts.id, artifact.generationAttemptId));
            await tx
              .update(artifactProviderAttempts)
              .set({
                errorCode: "generation_cancelled",
                finishedAt: deletedAt,
                state: "failed",
              })
              .where(
                and(
                  eq(artifactProviderAttempts.generationAttemptId, artifact.generationAttemptId),
                  eq(artifactProviderAttempts.state, "running"),
                ),
              );
          }
        }
        await artifactCleanup.enqueue(tx, artifact.id);
      }
      await conversationCleanup.enqueue(tx, { conversationId, workspaceId: workspace.id });
      return true;
    });
    if (!deleted) return null;
    return { conversationId };
  });
}
