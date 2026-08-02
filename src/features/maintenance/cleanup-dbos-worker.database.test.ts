import { randomUUID } from "node:crypto";
import type { WorkflowStatusString } from "@dbos-inc/dbos-sdk";
import { createMigratedTestDatabase } from "@tests/database";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { aiConversations, artifacts, principals, sources, workspaces } from "@/database/schema";
import type { ArtifactRenderStorage } from "@/features/artifacts/render-storage.server";
import {
  artifactOwnedWorkflowIds,
  cancelTaskAgentRemoteExecutions,
  deleteArtifactRenderJobVersions,
  enqueueUnpurgedCleanupRetries,
  enqueueUnpurgedConversationCleanupRetries,
  garbageCollectTerminalWorkflowHistory,
} from "./cleanup-dbos-worker";

test("cancels every Animation remote execution during reliable artifact cleanup", async () => {
  const attemptIds = [randomUUID(), randomUUID()];
  const cancelAnimation = vi.fn(async () => undefined);
  await cancelTaskAgentRemoteExecutions("animation", attemptIds, { cancelAnimation });
  expect(cancelAnimation.mock.calls).toEqual(attemptIds.map((attemptId) => [attemptId]));
});

test("owns the generation workflow and every fenced render attempt", () => {
  const artifactId = randomUUID();
  const jobId = randomUUID();
  expect(artifactOwnedWorkflowIds(artifactId, [{ attemptNumber: 2, id: jobId }])).toEqual([
    artifactId,
    `render:${jobId}:1`,
    `render:${jobId}:2`,
  ]);
});

test("deletes every version for every render attempt", async () => {
  const artifactId = randomUUID();
  const jobId = randomUUID();
  const firstKey = `artifacts/${artifactId}/renders/${jobId}/1.docx`;
  const secondKey = `artifacts/${artifactId}/renders/${jobId}/2.docx`;
  const deleteVersion = vi.fn().mockResolvedValue(undefined);
  const storage: ArtifactRenderStorage = {
    delete: deleteVersion,
    get: vi.fn(),
    listVersions: vi
      .fn()
      .mockResolvedValueOnce(["attempt-1-version"])
      .mockResolvedValueOnce(["attempt-2-version"]),
    put: vi.fn(),
  };

  await expect(
    deleteArtifactRenderJobVersions(storage, artifactId, {
      attemptNumber: 2,
      id: jobId,
      outputObjectKey: null,
    }),
  ).resolves.toEqual({
    deleted: [
      { key: firstKey, versionId: "attempt-1-version" },
      { key: secondKey, versionId: "attempt-2-version" },
    ],
    keys: [firstKey, secondKey],
  });
  expect(deleteVersion.mock.calls).toEqual([
    [{ key: firstKey, versionId: "attempt-1-version" }],
    [{ key: secondKey, versionId: "attempt-2-version" }],
  ]);
});

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.sources, public.artifacts, public.workspaces, public.principals CASCADE",
  );
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("re-enqueues every tombstoned entity that has not been purged", async () => {
  const principalId = randomUUID();
  const workspaceId = randomUUID();
  const deletedAt = new Date("2026-07-18T08:00:00.000Z");
  const scheduledAt = new Date("2026-07-18T09:15:00.000Z");
  const pendingArtifactId = randomUUID();
  const purgedArtifactId = randomUUID();
  const pendingSourceId = randomUUID();
  const purgedSourceId = randomUUID();
  await testDatabase.db.insert(principals).values({
    authUserId: `cleanup-${principalId}`,
    handle: `cleanup-${principalId.slice(0, 8)}`,
    id: principalId,
  });
  await testDatabase.db.insert(workspaces).values({
    id: workspaceId,
    name: "Cleanup recovery",
    ownerId: principalId,
  });
  await testDatabase.db.insert(artifacts).values([
    {
      createdByPrincipalId: principalId,
      deletedAt,
      generationState: "cancelled",
      id: pendingArtifactId,
      kind: "teaching_document",
      title: "Pending cleanup",
      workspaceId,
    },
    {
      createdByPrincipalId: principalId,
      deletedAt,
      generationState: "cancelled",
      id: purgedArtifactId,
      kind: "teaching_document",
      purgedAt: deletedAt,
      title: "Already purged",
      workspaceId,
    },
  ]);
  await testDatabase.db.insert(sources).values([
    {
      deletedAt,
      id: pendingSourceId,
      kind: "uploaded_file",
      workspaceId,
    },
    {
      deletedAt,
      id: purgedSourceId,
      kind: "uploaded_file",
      purgedAt: deletedAt,
      workspaceId,
    },
  ]);
  const retries: Array<{
    entityId: string;
    workflowId: string;
    workflowName: string;
  }> = [];

  await expect(
    enqueueUnpurgedCleanupRetries(testDatabase.db, scheduledAt, async (retry) => {
      retries.push(retry);
    }),
  ).resolves.toEqual({ artifactCount: 1, sourceCount: 1 });

  expect(retries).toEqual(
    expect.arrayContaining([
      {
        entityId: pendingArtifactId,
        workflowId: `cleanup-retry:artifact:${pendingArtifactId}:${scheduledAt.toISOString()}`,
        workflowName: "cleanupArtifact",
      },
      {
        entityId: pendingSourceId,
        workflowId: `cleanup-retry:source:${pendingSourceId}:${scheduledAt.toISOString()}`,
        workflowName: "cleanupSource",
      },
    ]),
  );
  expect(retries).toHaveLength(2);
});

test("re-enqueues every tombstoned conversation across recovery pages", async () => {
  const principalId = randomUUID();
  const workspaceId = randomUUID();
  const deletedAt = new Date("2026-07-18T08:00:00.000Z");
  const scheduledAt = new Date("2026-07-18T09:15:00.000Z");
  const conversationIds = Array.from({ length: 501 }, () => randomUUID());
  await testDatabase.db.insert(principals).values({
    authUserId: `conversation-cleanup-${principalId}`,
    handle: `conversation-cleanup-${principalId.slice(0, 8)}`,
    id: principalId,
  });
  await testDatabase.db.insert(workspaces).values({
    id: workspaceId,
    name: "Conversation cleanup recovery",
    ownerId: principalId,
  });
  await testDatabase.db.insert(aiConversations).values(
    conversationIds.map((conversationId) => ({
      conversationId,
      createdByPrincipalId: principalId,
      deletedAt,
      workspaceId,
    })),
  );
  const retries: Array<{ conversationId: string; workflowId: string; workspaceId: string }> = [];

  await expect(
    enqueueUnpurgedConversationCleanupRetries(testDatabase.db, scheduledAt, async (retry) => {
      retries.push(retry);
    }),
  ).resolves.toEqual({ conversationCount: conversationIds.length });

  expect(retries).toHaveLength(conversationIds.length);
  expect(new Set(retries.map((retry) => retry.conversationId))).toEqual(new Set(conversationIds));
});

test("drains every terminal workflow page older than the retention cutoff", async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    workflowID: `old-${index}`,
  }));
  const secondPage = [{ workflowID: "old-1000" }, { workflowID: "old-1001" }];
  const pages = [firstPage, secondPage, []];
  const listWorkflows = vi.fn(
    async (_input: { completedBefore: string; limit: number; status: WorkflowStatusString[] }) =>
      pages.shift() ?? [],
  );
  const deleteWorkflows = vi.fn(async (_workflowIds: string[], _deleteChildren: boolean) =>
    Promise.resolve(),
  );

  await expect(
    garbageCollectTerminalWorkflowHistory(
      { deleteWorkflows, listWorkflows },
      "2026-07-17T09:30:00.000Z",
    ),
  ).resolves.toEqual({ deletedCount: 1002, pageCount: 2 });

  expect(listWorkflows).toHaveBeenCalledTimes(3);
  expect(deleteWorkflows).toHaveBeenCalledTimes(2);
  expect(deleteWorkflows.mock.calls[0]?.[0]).toHaveLength(1000);
  expect(deleteWorkflows.mock.calls[1]?.[0]).toEqual(["old-1000", "old-1001"]);
});
