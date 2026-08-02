import { createMigratedTestDatabase } from "@tests/database";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { startTeachingDocumentGeneration } from "@/features/artifacts/documents/service";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import type { MindMapDraftSnapshot } from "./contract";
import { MindMapError } from "./errors";
import {
  claimMindMapGeneration,
  completeMindMapGeneration,
  deleteMindMapForConversationWithCleanupQueue,
  getMindMapDetailForConversation,
  purgeDeletedMindMapContent,
  saveMindMapRevision,
  startMindMapGeneration,
  updateMindMapGeneration,
} from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let actor: Actor;
const conversationId = "00000000-0000-4000-8000-000000000801";

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});
beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.artifact_revisions, public.artifacts, public.workspaces, public.principals CASCADE",
  );
  actor = await ensurePrincipalForAuthUser("mind-map-user", "mind-map-user", testDatabase.db);
});
afterAll(async () => {
  await testDatabase.destroy();
});

function content(label: string): MindMapDraftSnapshot {
  return {
    nodes: [
      { id: "root", label, order: 0, parentId: null },
      { id: "child", label: "Child", order: 0, parentId: "root" },
    ],
    rootId: "root",
  };
}

function revisionContent(label: string) {
  return {
    ...content(label),
    generation: { outcome: "complete" as const, rawOutput: "{}", warnings: [] },
    schemaVersion: 2 as const,
  };
}

async function createReadyMindMap(workspaceId: string, sourceUserMessageId = crypto.randomUUID()) {
  const started = await startMindMapGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt: "Create a map",
      sourceUserMessageId,
      workspaceId,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const attemptId = started.generationAttemptId;
  if (!attemptId) throw new Error("Generation attempt missing");
  await claimMindMapGeneration(started.id, attemptId, testDatabase.db);
  await updateMindMapGeneration(
    started.id,
    attemptId,
    { draft: content("First"), state: "finalizing" },
    testDatabase.db,
  );
  return completeMindMapGeneration(
    started.id,
    attemptId,
    actor.principalId,
    revisionContent("First"),
    testDatabase.db,
  );
}

test("creates and manually appends immutable mind map revisions with CAS", async () => {
  const workspace = await createWorkspace(actor, { name: "Maps" }, testDatabase.db);
  const first = await createReadyMindMap(workspace.id);
  expect(first).toMatchObject({ title: "First", currentRevision: { revisionNumber: 1 } });
  const second = await saveMindMapRevision(
    actor,
    {
      artifactId: first.id,
      content: revisionContent("Second"),
      conversationId,
      expectedRevisionId: first.currentRevision.id,
      workspaceId: workspace.id,
    },
    testDatabase.db,
  );
  expect(second).toMatchObject({
    title: "Second",
    currentRevision: { parentRevisionId: first.currentRevision.id, revisionNumber: 2 },
  });
  await expect(
    saveMindMapRevision(
      actor,
      {
        artifactId: first.id,
        content: revisionContent("Stale"),
        conversationId,
        expectedRevisionId: first.currentRevision.id,
        workspaceId: workspace.id,
      },
      testDatabase.db,
    ),
  ).rejects.toMatchObject({ code: "mind_map_conflict" });
});

test("allows one source message to create one document and one mind map", async () => {
  const workspace = await createWorkspace(actor, { name: "Mixed" }, testDatabase.db);
  const sourceUserMessageId = "same-message";
  const map = await startMindMapGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt: "Map",
      sourceUserMessageId,
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const document = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt: "Document",
      sourceUserMessageId,
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  expect(map.kind).toBe("mind_map");
  expect(document.kind).toBe("teaching_document");
});

test("tombstones, queues cleanup, and purges a deleted mind map", async () => {
  const workspace = await createWorkspace(actor, { name: "Delete" }, testDatabase.db);
  const artifact = await createReadyMindMap(workspace.id);
  const queued: string[] = [];
  await deleteMindMapForConversationWithCleanupQueue(
    actor,
    { artifactId: artifact.id, conversationId, workspaceId: workspace.id },
    testDatabase.db,
    {
      async enqueue(_transaction, artifactId) {
        queued.push(artifactId);
      },
    },
  );
  expect(queued).toEqual([artifact.id]);
  await expect(
    getMindMapDetailForConversation(
      actor,
      { artifactId: artifact.id, conversationId, workspaceId: workspace.id },
      testDatabase.db,
    ),
  ).rejects.toBeInstanceOf(MindMapError);
  await purgeDeletedMindMapContent(artifact.id, testDatabase.db);
  const rows = await testDatabase.pool.query(
    "SELECT count(*)::int AS count FROM artifact_revisions WHERE artifact_id = $1",
    [artifact.id],
  );
  expect(rows.rows).toEqual([{ count: 0 }]);
});
