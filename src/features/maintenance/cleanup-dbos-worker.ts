import "server-only";

import { DBOS, type WorkflowStatusString } from "@dbos-inc/dbos-sdk";
import { and, asc, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/database/client";
import {
  aiConversations,
  artifactGenerationAttempts,
  artifactRenderJobs,
  artifactRevisions,
  artifactSourceBundles,
  artifacts,
  presentationEditorSnapshots,
} from "@/database/schema";
import { convergeStaleAiRuns } from "@/features/agents/run-recovery";
import { artifactDbosClient } from "@/features/artifacts/dbos-client.server";
import { artifactRenderWorkflowId } from "@/features/artifacts/render-dbos";
import {
  type ArtifactRenderStorage,
  createArtifactRenderStorage,
} from "@/features/artifacts/render-storage.server";
import { artifactServerModule } from "@/features/artifacts/server-modules.server";
import { taskAgentRemoteCancellation } from "@/features/artifacts/task-agent/cancellation.server";
import { artifactKindSchema } from "@/features/artifacts/types";
import type { KnowledgeSourceCleanupOperations } from "@/features/knowledge/cleanup";
import { createKnowledgeSourceCleanupOperations } from "@/features/knowledge/cleanup.server";
import type { SourceCleanupOperations } from "@/features/sources/cleanup";
import { createSourceCleanupOperations } from "@/features/sources/cleanup.server";
import { workerLogger } from "@/observability/server";
import type { DbosScheduleDefinition } from "@/worker/dbos-schedules";
import {
  ARTIFACT_CLEANUP_WORKFLOW,
  CONVERSATION_CLEANUP_WORKFLOW,
  DBOS_MAINTENANCE_QUEUE,
  SOURCE_CLEANUP_WORKFLOW,
} from "./cleanup-dbos";
import { cleanupScopeHasFailure, recordCleanupReceipt } from "./cleanup-receipts";

const TERMINAL_WORKFLOW_STATUSES = [
  "SUCCESS",
  "ERROR",
  "CANCELLED",
  "MAX_RECOVERY_ATTEMPTS_EXCEEDED",
] as const;
const CLEANUP_RECOVERY_PAGE_SIZE = 500;
const cancelAnimationRemoteExecution = taskAgentRemoteCancellation("animation-remotion-v1");
const cancelPresentationRemoteExecution = taskAgentRemoteCancellation("presentation-pptd-v1");

type TerminalWorkflowHistoryOperations = {
  deleteWorkflows: (workflowIds: string[], deleteChildren: boolean) => Promise<void>;
  listWorkflows: (input: {
    completedBefore: string;
    limit: number;
    status: WorkflowStatusString[];
  }) => Promise<Array<{ workflowID: string }>>;
};

type CleanupRetry = {
  entityId: string;
  workflowId: string;
  workflowName: typeof ARTIFACT_CLEANUP_WORKFLOW | typeof SOURCE_CLEANUP_WORKFLOW;
};

export async function cancelTaskAgentRemoteExecutions(
  kind: z.infer<typeof artifactKindSchema>,
  attemptIds: string[],
  operations: {
    cancelAnimation?: (attemptId: string) => Promise<void>;
    cancelPresentation?: (attemptId: string) => Promise<void>;
  } = {},
) {
  const cancel =
    kind === "animation"
      ? (operations.cancelAnimation ?? cancelAnimationRemoteExecution)
      : kind === "presentation"
        ? (operations.cancelPresentation ?? cancelPresentationRemoteExecution)
        : null;
  if (!cancel) return;
  for (const attemptId of attemptIds) await cancel(attemptId);
}

export async function deleteArtifactRenderJobVersions(
  storage: ArtifactRenderStorage,
  artifactId: string,
  job: { attemptNumber: number; id: string; outputObjectKey: string | null },
) {
  const keys = new Set(
    Array.from(
      { length: job.attemptNumber },
      (_, index) => `artifacts/${artifactId}/renders/${job.id}/${index + 1}.docx`,
    ),
  );
  if (job.outputObjectKey) keys.add(job.outputObjectKey);
  const deleted: Array<{ key: string; versionId: string }> = [];
  for (const key of keys) {
    const versionIds = await storage.listVersions({ key });
    for (const versionId of versionIds) {
      await storage.delete({ key, versionId });
      deleted.push({ key, versionId });
    }
  }
  return { deleted, keys: [...keys] };
}

export function artifactOwnedWorkflowIds(
  artifactId: string,
  jobs: ReadonlyArray<{ attemptNumber: number; id: string }>,
  generationAttemptIds: readonly string[] = [],
) {
  return [
    artifactId,
    ...generationAttemptIds,
    ...jobs.flatMap((job) =>
      Array.from({ length: job.attemptNumber }, (_, index) =>
        artifactRenderWorkflowId(job.id, index + 1),
      ),
    ),
  ];
}

export async function garbageCollectTerminalWorkflowHistory(
  operations: TerminalWorkflowHistoryOperations,
  completedBefore: string,
) {
  let deletedCount = 0;
  let pageCount = 0;
  while (true) {
    const workflows = await operations.listWorkflows({
      completedBefore,
      limit: 1000,
      status: [...TERMINAL_WORKFLOW_STATUSES],
    });
    if (workflows.length === 0) return { deletedCount, pageCount };
    await operations.deleteWorkflows(
      workflows.map((workflow) => workflow.workflowID),
      true,
    );
    deletedCount += workflows.length;
    pageCount += 1;
  }
}

export async function enqueueUnpurgedCleanupRetries(
  db: Database,
  scheduledAt: Date,
  enqueue: (retry: CleanupRetry) => Promise<void>,
  sourceCleanup: Pick<
    SourceCleanupOperations,
    "listUnpurgedSourceIds"
  > = createSourceCleanupOperations(db),
) {
  let artifactCount = 0;
  let artifactCursor: string | null = null;
  while (true) {
    const rows = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(
        and(
          isNotNull(artifacts.deletedAt),
          isNull(artifacts.purgedAt),
          artifactCursor ? gt(artifacts.id, artifactCursor) : undefined,
        ),
      )
      .orderBy(asc(artifacts.id))
      .limit(CLEANUP_RECOVERY_PAGE_SIZE);
    for (const row of rows) {
      await enqueue({
        entityId: row.id,
        workflowId: `cleanup-retry:artifact:${row.id}:${scheduledAt.toISOString()}`,
        workflowName: ARTIFACT_CLEANUP_WORKFLOW,
      });
      artifactCount += 1;
    }
    if (rows.length < CLEANUP_RECOVERY_PAGE_SIZE) break;
    artifactCursor = rows.at(-1)?.id ?? null;
  }

  let sourceCursor: string | null = null;
  let sourceCount = 0;
  while (true) {
    const sourceIds = await sourceCleanup.listUnpurgedSourceIds(
      sourceCursor,
      CLEANUP_RECOVERY_PAGE_SIZE,
    );
    for (const sourceId of sourceIds) {
      await enqueue({
        entityId: sourceId,
        workflowId: `cleanup-retry:source:${sourceId}:${scheduledAt.toISOString()}`,
        workflowName: SOURCE_CLEANUP_WORKFLOW,
      });
      sourceCount += 1;
    }
    if (sourceIds.length < CLEANUP_RECOVERY_PAGE_SIZE) break;
    sourceCursor = sourceIds.at(-1) ?? null;
  }
  return { artifactCount, sourceCount };
}

export async function enqueueUnpurgedConversationCleanupRetries(
  db: Database,
  scheduledAt: Date,
  enqueue: (retry: {
    conversationId: string;
    workflowId: string;
    workspaceId: string;
  }) => Promise<void>,
) {
  let conversationCount = 0;
  let cursor: { conversationId: string; workspaceId: string } | null = null;
  while (true) {
    const rows = await db
      .select({
        conversationId: aiConversations.conversationId,
        workspaceId: aiConversations.workspaceId,
      })
      .from(aiConversations)
      .where(
        and(
          isNotNull(aiConversations.deletedAt),
          isNull(aiConversations.purgedAt),
          cursor
            ? or(
                gt(aiConversations.workspaceId, cursor.workspaceId),
                and(
                  eq(aiConversations.workspaceId, cursor.workspaceId),
                  gt(aiConversations.conversationId, cursor.conversationId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(aiConversations.workspaceId), asc(aiConversations.conversationId))
      .limit(CLEANUP_RECOVERY_PAGE_SIZE);
    for (const row of rows) {
      await enqueue({
        conversationId: row.conversationId,
        workflowId: `cleanup-retry:conversation:${row.workspaceId}:${row.conversationId}:${scheduledAt.toISOString()}`,
        workspaceId: row.workspaceId,
      });
      conversationCount += 1;
    }
    if (rows.length < CLEANUP_RECOVERY_PAGE_SIZE) break;
    cursor = rows.at(-1) ?? null;
  }
  return { conversationCount };
}

export function registerCleanupDbosWorkflows(input: {
  db: Database;
  knowledgeCleanup?: KnowledgeSourceCleanupOperations;
  sourceCleanup?: SourceCleanupOperations;
}): DbosScheduleDefinition[] {
  function scheduledDate(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new TypeError("Invalid DBOS scheduled timestamp");
    return date;
  }
  const sourceCleanup = input.sourceCleanup ?? createSourceCleanupOperations(input.db);
  const knowledgeCleanup =
    input.knowledgeCleanup ?? createKnowledgeSourceCleanupOperations(input.db);
  const renderStorage = createArtifactRenderStorage();
  const cancelAndDelete = DBOS.registerStep(
    async (sourceId: string, workflowIds: string[]) => {
      const client = await artifactDbosClient();
      for (const workflowId of workflowIds) {
        try {
          await client.cancelWorkflow(workflowId, { cancelChildren: true });
          await client.deleteWorkflow(workflowId, true);
          await recordCleanupReceipt(input.db, {
            outcome: "deleted",
            owner: "dbos",
            resourceId: workflowId,
            resourceType: "workflow",
            scopeId: sourceId,
            scopeType: "source",
          });
        } catch {
          await recordCleanupReceipt(input.db, {
            failureCode: "workflow_cleanup_failed",
            outcome: "failed",
            owner: "dbos",
            resourceId: workflowId,
            resourceType: "workflow",
            scopeId: sourceId,
            scopeType: "source",
          });
          throw new Error("source_workflow_cleanup_failed");
        }
      }
    },
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 5,
      name: "cancelAndDeleteEntityWorkflows",
      retriesAllowed: true,
    },
  );
  const loadArtifactResources = DBOS.registerStep(
    async (artifactId: string) => {
      const [artifact] = await input.db
        .select({ kind: artifacts.kind })
        .from(artifacts)
        .where(and(eq(artifacts.id, artifactId), isNotNull(artifacts.deletedAt)))
        .limit(1);
      if (!artifact) return null;
      const jobs = await input.db
        .select()
        .from(artifactRenderJobs)
        .where(eq(artifactRenderJobs.artifactId, artifactId));
      const sourceBundles = await input.db
        .select({
          objectKey: artifactSourceBundles.objectKey,
          objectVersionId: artifactSourceBundles.objectVersionId,
        })
        .from(artifactSourceBundles)
        .where(eq(artifactSourceBundles.artifactId, artifactId));
      const editorSnapshots = await input.db
        .select({
          coverObjectKey: presentationEditorSnapshots.coverObjectKey,
          coverObjectVersionId: presentationEditorSnapshots.coverObjectVersionId,
          projectObjectKey: presentationEditorSnapshots.projectObjectKey,
          projectObjectVersionId: presentationEditorSnapshots.projectObjectVersionId,
        })
        .from(presentationEditorSnapshots)
        .where(eq(presentationEditorSnapshots.artifactId, artifactId));
      const editorSnapshotObjects = editorSnapshots.flatMap((snapshot) => [
        {
          objectKey: snapshot.projectObjectKey,
          objectVersionId: snapshot.projectObjectVersionId,
        },
        ...(snapshot.coverObjectKey && snapshot.coverObjectVersionId
          ? [
              {
                objectKey: snapshot.coverObjectKey,
                objectVersionId: snapshot.coverObjectVersionId,
              },
            ]
          : []),
      ]);
      const attempts = await input.db
        .select({ id: artifactGenerationAttempts.id })
        .from(artifactGenerationAttempts)
        .where(eq(artifactGenerationAttempts.artifactId, artifactId));
      const revisions = await input.db
        .select({ id: artifactRevisions.id })
        .from(artifactRevisions)
        .where(eq(artifactRevisions.artifactId, artifactId));
      const deterministicEditorObjects = revisions.flatMap((revision) =>
        ["project.json", "cover.jpg", "cover.png", "cover.webp"].map((filename) => ({
          objectKey: `artifacts/${artifactId}/presentation-editor/${revision.id}/${filename}`,
          objectVersionId: "unknown",
        })),
      );
      const deterministicTaskAgentObjects = attempts.flatMap((attempt) => [
        {
          objectKey: `artifacts/${artifactId}/attempts/${attempt.id}/source/final.tar.gz`,
          objectVersionId: "unknown",
        },
        {
          objectKey: `artifacts/${artifactId}/attempts/${attempt.id}/renders/final.pptx`,
          objectVersionId: "unknown",
        },
        {
          objectKey: `artifacts/${artifactId}/attempts/${attempt.id}/renders/final.mp4`,
          objectVersionId: "unknown",
        },
      ]);
      return {
        deterministicTaskAgentObjects,
        deterministicEditorObjects,
        editorSnapshotObjects,
        generationAttemptIds: attempts.map((attempt) => attempt.id),
        jobs,
        kind: artifactKindSchema.parse(artifact.kind),
        sourceBundles,
      };
    },
    { name: "loadArtifactCleanupResources" },
  );
  const cancelArtifactWorkflows = DBOS.registerStep(
    async (artifactId: string, workflowIds: string[]) => {
      const client = await artifactDbosClient();
      for (const workflowId of workflowIds) {
        try {
          await client.cancelWorkflow(workflowId, { cancelChildren: true });
          await client.deleteWorkflow(workflowId, true);
          await recordCleanupReceipt(input.db, {
            outcome: "deleted",
            owner: "dbos",
            resourceId: workflowId,
            resourceType: "workflow",
            scopeId: artifactId,
            scopeType: "artifact",
          });
        } catch {
          await recordCleanupReceipt(input.db, {
            failureCode: "workflow_cleanup_failed",
            outcome: "failed",
            owner: "dbos",
            resourceId: workflowId,
            resourceType: "workflow",
            scopeId: artifactId,
            scopeType: "artifact",
          });
          throw new Error("artifact_workflow_cleanup_failed");
        }
      }
    },
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 5,
      name: "cancelArtifactOwnedWorkflows",
      retriesAllowed: true,
    },
  );
  const cancelTaskAgentRemotes = DBOS.registerStep(
    async (kind: z.infer<typeof artifactKindSchema>, attemptIds: string[]) =>
      cancelTaskAgentRemoteExecutions(kind, attemptIds),
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 5,
      name: "cancelTaskAgentRemoteExecutions",
      retriesAllowed: true,
    },
  );
  const deleteArtifactRenderOutputs = DBOS.registerStep(
    async (
      artifactId: string,
      jobs: Array<{
        attemptNumber: number;
        id: string;
        outputObjectKey: string | null;
        outputObjectVersionId: string | null;
      }>,
    ) => {
      for (const job of jobs) {
        const expectedKey =
          job.outputObjectKey ??
          `artifacts/${artifactId}/renders/${job.id}/${job.attemptNumber}.docx`;
        const fallbackResourceId = `${expectedKey}@${job.outputObjectVersionId ?? "none"}`;
        try {
          const { deleted, keys } = await deleteArtifactRenderJobVersions(
            renderStorage,
            artifactId,
            job,
          );
          for (const version of deleted) {
            await recordCleanupReceipt(input.db, {
              outcome: "deleted",
              owner: "artifact_renderer",
              resourceId: `${version.key}@${version.versionId}`,
              resourceType: "versioned_object",
              scopeId: artifactId,
              scopeType: "artifact",
            });
          }
          await input.db
            .update(artifactRenderJobs)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(artifactRenderJobs.id, job.id));
          if (deleted.length === 0) {
            for (const key of keys) {
              await recordCleanupReceipt(input.db, {
                outcome: "already_absent",
                owner: "artifact_renderer",
                resourceId: `${key}@none`,
                resourceType: "versioned_object",
                scopeId: artifactId,
                scopeType: "artifact",
              });
            }
          }
        } catch {
          await recordCleanupReceipt(input.db, {
            failureCode: "render_output_cleanup_failed",
            outcome: "failed",
            owner: "artifact_renderer",
            resourceId: fallbackResourceId,
            resourceType: "versioned_object",
            scopeId: artifactId,
            scopeType: "artifact",
          });
          throw new Error("artifact_render_cleanup_failed");
        }
      }
      await input.db
        .delete(artifactRenderJobs)
        .where(eq(artifactRenderJobs.artifactId, artifactId));
    },
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 5,
      name: "deleteArtifactRenderOutputs",
      retriesAllowed: true,
    },
  );
  const deleteArtifactSourceBundles = DBOS.registerStep(
    async (artifactId: string, objects: Array<{ objectKey: string; objectVersionId: string }>) => {
      for (const object of objects) {
        try {
          const versions = await renderStorage.listVersions({ key: object.objectKey });
          for (const versionId of versions) {
            await renderStorage.delete({ key: object.objectKey, versionId });
            await recordCleanupReceipt(input.db, {
              outcome: "deleted",
              owner: "artifact_task_agent",
              resourceId: object.objectKey,
              resourceType: "versioned_object_key",
              scopeId: artifactId,
              scopeType: "artifact",
            });
          }
          if (versions.length === 0) {
            await recordCleanupReceipt(input.db, {
              outcome: "already_absent",
              owner: "artifact_task_agent",
              resourceId: object.objectKey,
              resourceType: "versioned_object_key",
              scopeId: artifactId,
              scopeType: "artifact",
            });
          }
        } catch {
          await recordCleanupReceipt(input.db, {
            failureCode: "source_bundle_cleanup_failed",
            outcome: "failed",
            owner: "artifact_task_agent",
            resourceId: object.objectKey,
            resourceType: "versioned_object_key",
            scopeId: artifactId,
            scopeType: "artifact",
          });
          throw new Error("artifact_source_bundle_cleanup_failed");
        }
      }
      await input.db
        .delete(artifactSourceBundles)
        .where(eq(artifactSourceBundles.artifactId, artifactId));
    },
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 5,
      name: "deleteArtifactSourceBundles",
      retriesAllowed: true,
    },
  );
  const purgeArtifact = DBOS.registerStep(
    async (artifactId: string, kind: string) => {
      try {
        await artifactServerModule(artifactKindSchema.parse(kind)).purge(artifactId, input.db);
        await recordCleanupReceipt(input.db, {
          outcome: "deleted",
          owner: "artifact_core",
          resourceId: artifactId,
          resourceType: "artifact_content",
          scopeId: artifactId,
          scopeType: "artifact",
        });
      } catch {
        await recordCleanupReceipt(input.db, {
          failureCode: "artifact_content_cleanup_failed",
          outcome: "failed",
          owner: "artifact_core",
          resourceId: artifactId,
          resourceType: "artifact_content",
          scopeId: artifactId,
          scopeType: "artifact",
        });
        throw new Error("artifact_content_cleanup_failed");
      }
      if (await cleanupScopeHasFailure(input.db, { scopeId: artifactId, scopeType: "artifact" })) {
        throw new Error("artifact_cleanup_receipt_failed");
      }
      await input.db
        .update(artifacts)
        .set({ purgedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(artifacts.id, artifactId), isNotNull(artifacts.deletedAt)));
    },
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 5,
      name: "purgeDeletedArtifact",
      retriesAllowed: true,
    },
  );
  const purgeSource = DBOS.registerStep(
    async (sourceId: string) => {
      const result = await sourceCleanup.purgeDeletedSource(sourceId);
      if (result.kind === "already_absent") {
        await recordCleanupReceipt(input.db, {
          outcome: "already_absent",
          owner: "source_module",
          resourceId: sourceId,
          resourceType: "source_content",
          scopeId: sourceId,
          scopeType: "source",
        });
        return;
      }
      await recordCleanupReceipt(input.db, {
        ...(result.cleanupPending ? { failureCode: "source_cleanup_incomplete" } : {}),
        outcome: result.cleanupPending ? "failed" : "deleted",
        owner: "source_module",
        resourceId: sourceId,
        resourceType: "source_content",
        scopeId: sourceId,
        scopeType: "source",
      });
      if (result.cleanupPending) throw new Error("source_cleanup_incomplete");
    },
    {
      backoffRate: 2,
      intervalSeconds: 10,
      maxAttempts: 10,
      name: "purgeDeletedSource",
      retriesAllowed: true,
    },
  );
  const purgeSourceKnowledge = DBOS.registerStep(
    async (sourceId: string) => {
      try {
        await knowledgeCleanup.purgeDeletedSourceIndex(sourceId);
        await recordCleanupReceipt(input.db, {
          outcome: "deleted",
          owner: "knowledge",
          resourceId: sourceId,
          resourceType: "knowledge_index",
          scopeId: sourceId,
          scopeType: "source",
        });
      } catch {
        await recordCleanupReceipt(input.db, {
          failureCode: "knowledge_index_cleanup_failed",
          outcome: "failed",
          owner: "knowledge",
          resourceId: sourceId,
          resourceType: "knowledge_index",
          scopeId: sourceId,
          scopeType: "source",
        });
        throw new Error("knowledge_index_cleanup_failed");
      }
    },
    {
      backoffRate: 2,
      intervalSeconds: 10,
      maxAttempts: 10,
      name: "purgeDeletedSourceKnowledgeIndex",
      retriesAllowed: true,
    },
  );

  async function cleanupArtifact(artifactId: string) {
    const startedAt = Date.now();
    const bindings = {
      artifactId,
      resourceType: "artifact",
      workflowId: DBOS.workflowID,
    };
    workerLogger.info(
      { ...bindings, event: "maintenance.cleanup.started" },
      "Artifact cleanup started",
    );
    try {
      const resources = await loadArtifactResources(artifactId);
      if (resources) {
        await cancelArtifactWorkflows(
          artifactId,
          artifactOwnedWorkflowIds(artifactId, resources.jobs, resources.generationAttemptIds),
        );
        await cancelTaskAgentRemotes(resources.kind, resources.generationAttemptIds);
        await deleteArtifactRenderOutputs(artifactId, resources.jobs);
        await deleteArtifactSourceBundles(artifactId, [
          ...resources.sourceBundles,
          ...resources.editorSnapshotObjects,
          ...resources.deterministicEditorObjects,
          ...resources.deterministicTaskAgentObjects,
        ]);
        await purgeArtifact(artifactId, resources.kind);
      }
      workerLogger.info(
        { ...bindings, durationMs: Date.now() - startedAt, event: "maintenance.cleanup.completed" },
        "Artifact cleanup completed",
      );
    } catch (error) {
      workerLogger.error(
        {
          ...bindings,
          durationMs: Date.now() - startedAt,
          error,
          event: "maintenance.cleanup.failed",
          failureCode: "artifact_cleanup_failed",
        },
        "Artifact cleanup failed",
      );
      throw error;
    }
  }
  DBOS.registerWorkflow(cleanupArtifact, {
    inputSchema: z.tuple([z.string().uuid()]),
    maxRecoveryAttempts: 5,
    name: ARTIFACT_CLEANUP_WORKFLOW,
    serialization: "portable",
  });

  async function cleanupSource(sourceId: string) {
    const startedAt = Date.now();
    const bindings = {
      resourceType: "source",
      sourceId,
      workflowId: DBOS.workflowID,
    };
    workerLogger.info(
      { ...bindings, event: "maintenance.cleanup.started" },
      "Source cleanup started",
    );
    try {
      const workflowIds = await DBOS.runStep(
        async () => {
          const [ingestions, generations] = await Promise.all([
            sourceCleanup.listWorkflowIds(sourceId),
            knowledgeCleanup.listWorkflowIds(sourceId),
          ]);
          return [...ingestions, ...generations];
        },
        { name: "loadSourceCleanupWorkflowIds" },
      );
      await cancelAndDelete(sourceId, workflowIds);
      await purgeSourceKnowledge(sourceId);
      await purgeSource(sourceId);
      workerLogger.info(
        { ...bindings, durationMs: Date.now() - startedAt, event: "maintenance.cleanup.completed" },
        "Source cleanup completed",
      );
    } catch (error) {
      workerLogger.error(
        {
          ...bindings,
          durationMs: Date.now() - startedAt,
          error,
          event: "maintenance.cleanup.failed",
          failureCode: "source_cleanup_failed",
        },
        "Source cleanup failed",
      );
      throw error;
    }
  }
  DBOS.registerWorkflow(cleanupSource, {
    inputSchema: z.tuple([z.string().uuid()]),
    maxRecoveryAttempts: 5,
    name: SOURCE_CLEANUP_WORKFLOW,
    serialization: "portable",
  });

  const finalizeConversationCleanup = DBOS.registerStep(
    async (workspaceId: string, conversationId: string) => {
      const [pendingArtifact] = await input.db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(
          and(
            eq(artifacts.workspaceId, workspaceId),
            eq(artifacts.conversationId, conversationId),
            isNotNull(artifacts.deletedAt),
            isNull(artifacts.purgedAt),
          ),
        )
        .limit(1);
      if (pendingArtifact) return { status: "pending" as const };
      if (
        await cleanupScopeHasFailure(input.db, {
          scopeId: conversationId,
          scopeType: "conversation",
        })
      ) {
        throw new Error("conversation_cleanup_receipt_failed");
      }
      await input.db
        .update(aiConversations)
        .set({ purgedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(aiConversations.workspaceId, workspaceId),
            eq(aiConversations.conversationId, conversationId),
            isNotNull(aiConversations.deletedAt),
          ),
        );
      return { status: "purged" as const };
    },
    {
      name: "finalizeConversationCleanup",
    },
  );
  async function cleanupConversation(workspaceId: string, conversationId: string) {
    const startedAt = Date.now();
    const bindings = {
      conversationId,
      resourceType: "conversation",
      workflowId: DBOS.workflowID,
      workspaceId,
    };
    workerLogger.info(
      { ...bindings, event: "maintenance.cleanup.started" },
      "Conversation cleanup started",
    );
    try {
      const result = await finalizeConversationCleanup(workspaceId, conversationId);
      if (result.status === "pending") {
        workerLogger.warn(
          { ...bindings, durationMs: Date.now() - startedAt, event: "maintenance.cleanup.pending" },
          "Conversation cleanup is waiting for artifact cleanup",
        );
        return result;
      }
      workerLogger.info(
        { ...bindings, durationMs: Date.now() - startedAt, event: "maintenance.cleanup.completed" },
        "Conversation cleanup completed",
      );
      return result;
    } catch (error) {
      workerLogger.error(
        {
          ...bindings,
          durationMs: Date.now() - startedAt,
          error,
          event: "maintenance.cleanup.failed",
          failureCode: "conversation_cleanup_failed",
        },
        "Conversation cleanup failed",
      );
      throw error;
    }
  }
  DBOS.registerWorkflow(cleanupConversation, {
    inputSchema: z.tuple([z.string().uuid(), z.string().uuid()]),
    maxRecoveryAttempts: 5,
    name: CONVERSATION_CLEANUP_WORKFLOW,
    serialization: "portable",
  });

  const recoverUnpurged = DBOS.registerStep(
    async (scheduledAtIso: string) => {
      const scheduledAt = new Date(scheduledAtIso);
      const client = await artifactDbosClient();
      const entityRetries = await enqueueUnpurgedCleanupRetries(
        input.db,
        scheduledAt,
        async (retry) => {
          await client.enqueuePortable(
            {
              deduplicationID: retry.workflowId,
              duplicationPolicy: "return-existing",
              queueName: DBOS_MAINTENANCE_QUEUE,
              serializationType: "portable",
              workflowID: retry.workflowId,
              workflowName: retry.workflowName,
            },
            [retry.entityId],
          );
        },
        sourceCleanup,
      );
      const conversationRetries = await enqueueUnpurgedConversationCleanupRetries(
        input.db,
        scheduledAt,
        async (retry) => {
          await client.enqueuePortable(
            {
              deduplicationID: retry.workflowId,
              duplicationPolicy: "return-existing",
              queueName: DBOS_MAINTENANCE_QUEUE,
              serializationType: "portable",
              workflowID: retry.workflowId,
              workflowName: CONVERSATION_CLEANUP_WORKFLOW,
            },
            [retry.workspaceId, retry.conversationId],
          );
        },
      );
      return { ...entityRetries, ...conversationRetries };
    },
    {
      backoffRate: 2,
      intervalSeconds: 10,
      maxAttempts: 5,
      name: "enqueueUnpurgedEntityCleanupRetries",
      retriesAllowed: true,
    },
  );
  async function recoverUnpurgedEntityCleanup(scheduledAt: Date, _startedAt: Date) {
    const startedAt = Date.now();
    try {
      const result = await recoverUnpurged(scheduledDate(scheduledAt).toISOString());
      const bindings = {
        durationMs: Date.now() - startedAt,
        recoveryArtifactCount: result.artifactCount,
        recoveryConversationCount: result.conversationCount,
        recoverySourceCount: result.sourceCount,
        workflowId: DBOS.workflowID,
      };
      const workCount = result.artifactCount + result.conversationCount + result.sourceCount;
      if (workCount > 0) {
        workerLogger.info(
          { ...bindings, event: "maintenance.recovery_scan.completed" },
          "Maintenance recovery scan completed",
        );
      } else {
        workerLogger.debug(
          { ...bindings, event: "maintenance.recovery_scan.completed" },
          "Maintenance recovery scan found no work",
        );
      }
    } catch (error) {
      workerLogger.error(
        {
          durationMs: Date.now() - startedAt,
          error,
          event: "maintenance.recovery_scan.failed",
          failureCode: "maintenance_recovery_scan_failed",
          workflowId: DBOS.workflowID,
        },
        "Maintenance recovery scan failed",
      );
      throw error;
    }
  }
  const recoveryWorkflow = DBOS.registerWorkflow(recoverUnpurgedEntityCleanup, {
    maxRecoveryAttempts: 5,
    name: "recoverUnpurgedEntityCleanup",
    serialization: "portable",
  });

  const convergeRuns = DBOS.registerStep(
    (scheduledAtIso: string) => convergeStaleAiRuns(input.db, new Date(scheduledAtIso)),
    { name: "convergeStaleAiRuns" },
  );
  async function convergeStaleRuns(scheduledAt: Date, _startedAt: Date) {
    const startedAt = Date.now();
    try {
      const staleRunCount = await convergeRuns(scheduledDate(scheduledAt).toISOString());
      const bindings = {
        durationMs: Date.now() - startedAt,
        event: "maintenance.stale_runs.completed",
        staleRunCount,
        workflowId: DBOS.workflowID,
      };
      if (staleRunCount > 0) {
        workerLogger.warn(bindings, "Stale AI runs were converged");
      } else {
        workerLogger.debug(bindings, "No stale AI runs found");
      }
    } catch (error) {
      workerLogger.error(
        {
          durationMs: Date.now() - startedAt,
          error,
          event: "maintenance.stale_runs.failed",
          failureCode: "stale_run_convergence_failed",
          workflowId: DBOS.workflowID,
        },
        "Stale AI run convergence failed",
      );
      throw error;
    }
  }
  const staleRunWorkflow = DBOS.registerWorkflow(convergeStaleRuns, {
    maxRecoveryAttempts: 100,
    name: "convergeStaleAiRuns",
    serialization: "portable",
  });

  const gc = DBOS.registerStep(
    async (completedBefore: string) => {
      const client = await artifactDbosClient();
      return garbageCollectTerminalWorkflowHistory(client, completedBefore);
    },
    { name: "garbageCollectTerminalDbosWorkflows" },
  );
  async function garbageCollectDbosHistory(scheduledAt: Date, _startedAt: Date) {
    const startedAt = Date.now();
    try {
      const result = await gc(
        new Date(scheduledDate(scheduledAt).getTime() - 24 * 60 * 60 * 1_000).toISOString(),
      );
      const bindings = {
        deletedCount: result.deletedCount,
        durationMs: Date.now() - startedAt,
        event: "maintenance.dbos_gc.completed",
        pageCount: result.pageCount,
        workflowId: DBOS.workflowID,
      };
      if (result.deletedCount > 0) {
        workerLogger.info(bindings, "DBOS workflow history garbage collection completed");
      } else {
        workerLogger.debug(bindings, "DBOS workflow history garbage collection found no work");
      }
    } catch (error) {
      workerLogger.error(
        {
          durationMs: Date.now() - startedAt,
          error,
          event: "maintenance.dbos_gc.failed",
          failureCode: "dbos_history_gc_failed",
          workflowId: DBOS.workflowID,
        },
        "DBOS workflow history garbage collection failed",
      );
      throw error;
    }
  }
  const gcWorkflow = DBOS.registerWorkflow(garbageCollectDbosHistory, {
    maxRecoveryAttempts: 100,
    name: "garbageCollectDbosHistory",
    serialization: "portable",
  });
  return [
    {
      automaticBackfill: false,
      queueName: DBOS_MAINTENANCE_QUEUE,
      schedule: "15 * * * *",
      scheduleName: "recoverUnpurgedEntityCleanupHourly",
      workflowFn: recoveryWorkflow,
    },
    {
      automaticBackfill: false,
      queueName: DBOS_MAINTENANCE_QUEUE,
      schedule: "* * * * *",
      scheduleName: "convergeStaleAiRunsMinutely",
      workflowFn: staleRunWorkflow,
    },
    {
      automaticBackfill: false,
      queueName: DBOS_MAINTENANCE_QUEUE,
      schedule: "30 * * * *",
      scheduleName: "garbageCollectDbosHistoryHourly",
      workflowFn: gcWorkflow,
    },
  ];
}
