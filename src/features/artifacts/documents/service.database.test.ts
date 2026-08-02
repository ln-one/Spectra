import { createMigratedTestDatabase } from "@tests/database";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type {
  ArtifactGroundingBundle,
  ArtifactOperationGroundingReceipt,
} from "@/features/artifacts/grounding";
import { publishArtifactEditProposal } from "@/features/artifacts/proposal-service.server";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import type { TeachingDocumentDraft } from "./contract";
import { TeachingDocumentError } from "./errors";
import { finalizeTeachingDocumentDraft } from "./finalize";
import type { TeachingDocumentGenerationQueue } from "./generation-queue";
import {
  claimTeachingDocumentGeneration,
  completeTeachingDocumentGeneration,
  deleteTeachingDocumentForConversation,
  deleteTeachingDocumentForConversationWithCleanupQueue,
  failExhaustedTeachingDocumentGeneration,
  failTeachingDocumentGeneration,
  getTeachingDocumentArtifact,
  getTeachingDocumentDetailForConversation,
  getTeachingDocumentRevision,
  purgeDeletedTeachingDocumentContent,
  saveTeachingDocumentRevision,
  startTeachingDocumentGeneration,
  updateTeachingDocumentGeneration,
} from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let alice: Actor;
let bob: Actor;
const conversationA = "00000000-0000-4000-8000-000000000101";
const conversationB = "00000000-0000-4000-8000-000000000102";
const emptyGroundingReceipt: ArtifactOperationGroundingReceipt = {
  operationEvidence: [],
  version: 1,
};

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.artifact_revisions, public.artifacts, public.workspaces, public.principals CASCADE",
  );
  alice = await ensurePrincipalForAuthUser("artifact-alice", "artifact-alice", testDatabase.db);
  bob = await ensurePrincipalForAuthUser("artifact-bob", "artifact-bob", testDatabase.db);
});

afterAll(async () => {
  await testDatabase.destroy();
});

function draft(title: string): TeachingDocumentDraft {
  return {
    blocks: [
      { kind: "heading", level: 2, text: "核心概念" },
      { kind: "paragraph", text: "教学正文" },
      { kind: "bullet", text: "要点一" },
      { kind: "bullet", text: "要点二" },
    ],
    title,
  };
}

function content(title: string) {
  return finalizeTeachingDocumentDraft(draft(title));
}

function generationDraft(title: string) {
  return {
    format: "markdown" as const,
    markdown: `# ${title}\n\n## 核心概念\n\n教学正文\n\n- 要点一\n- 要点二`,
  };
}

function requiredGenerationAttemptId(detail: { generationAttemptId: string | null }) {
  if (!detail.generationAttemptId) throw new Error("Generation attempt missing");
  return detail.generationAttemptId;
}

async function createTeachingDocumentArtifact(
  actor: Actor,
  workspaceId: string,
  conversationId: string,
  revisionContent: ReturnType<typeof content>,
  db: typeof testDatabase.db,
) {
  const started = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt: `Create ${revisionContent.title}`,
      sourceUserMessageId: `test:${crypto.randomUUID()}`,
      workspaceId,
    },
    { async enqueue() {} },
    db,
  );
  const attemptId = requiredGenerationAttemptId(started);
  await claimTeachingDocumentGeneration(started.id, attemptId, db);
  await updateTeachingDocumentGeneration(
    started.id,
    attemptId,
    { draft: generationDraft(revisionContent.title), state: "finalizing" },
    db,
  );
  return completeTeachingDocumentGeneration(
    started.id,
    attemptId,
    actor.principalId,
    draft(revisionContent.title),
    revisionContent,
    db,
  );
}

test("creates an immutable first revision and advances the head with CAS", async () => {
  const workspace = await createWorkspace(alice, { name: "Course" }, testDatabase.db);
  const artifact = await createTeachingDocumentArtifact(
    alice,
    workspace.id,
    conversationA,
    content("First"),
    testDatabase.db,
  );
  expect(artifact.currentRevision).toMatchObject({ revisionNumber: 1, parentRevisionId: null });

  const saved = await saveTeachingDocumentRevision(
    alice,
    {
      artifactId: artifact.id,
      conversationId: conversationA,
      content: content("Second"),
      expectedRevisionId: artifact.currentRevision.id,
      workspaceId: workspace.id,
    },
    testDatabase.db,
  );
  expect(saved.currentRevision).toMatchObject({
    parentRevisionId: artifact.currentRevision.id,
    revisionNumber: 2,
  });
  await expect(getTeachingDocumentArtifact(alice, artifact.id, testDatabase.db)).resolves.toEqual(
    saved,
  );
  const count = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM artifact_revisions WHERE artifact_id = $1",
    [artifact.id],
  );
  expect(count.rows).toEqual([{ count: "2" }]);
});

test("publishes a source receipt, clears frozen Evidence, and preserves lineage on manual edits", async () => {
  const workspace = await createWorkspace(alice, { name: "Grounded course" }, testDatabase.db);
  const grounding: ArtifactGroundingBundle = {
    evidence: [
      {
        content: { kind: "exact_text", text: "TCP provides ordered reliable delivery." },
        contentHash: "a".repeat(64),
        evidenceId: "11111111-1111-4111-8111-111111111111",
        fidelity: "source",
        locator: { end: 39, kind: "text_range", start: 0 },
        representationHash: "b".repeat(64),
        sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sourceName: "计算机网络讲义.pdf",
        sourceRevision: 3,
      },
    ],
    version: 1,
  };
  const started = await startTeachingDocumentGeneration(
    alice,
    {
      conversationId: conversationA,
      grounding,
      locale: "zh-CN",
      prompt: "创建 TCP 教学文档",
      sourceUserMessageId: "user:grounded-document",
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const attemptId = requiredGenerationAttemptId(started);
  await claimTeachingDocumentGeneration(started.id, attemptId, testDatabase.db);
  await updateTeachingDocumentGeneration(
    started.id,
    attemptId,
    { draft: generationDraft("TCP 教学文档"), state: "finalizing" },
    testDatabase.db,
  );
  const ready = await completeTeachingDocumentGeneration(
    started.id,
    attemptId,
    alice.principalId,
    draft("TCP 教学文档"),
    content("TCP 教学文档"),
    testDatabase.db,
  );
  expect(ready.groundingSources).toEqual([
    {
      sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sourceName: "计算机网络讲义.pdf",
    },
  ]);
  await expect(
    testDatabase.pool.query<{ generationRequest: unknown }>(
      `SELECT generation_request AS "generationRequest" FROM artifacts WHERE id = $1`,
      [ready.id],
    ),
  ).resolves.toMatchObject({ rows: [{ generationRequest: null }] });

  const saved = await saveTeachingDocumentRevision(
    alice,
    {
      artifactId: ready.id,
      conversationId: conversationA,
      content: content("人工修改后的 TCP 教学文档"),
      expectedRevisionId: ready.currentRevision.id,
      workspaceId: workspace.id,
    },
    testDatabase.db,
  );
  expect(saved.groundingSources).toEqual(ready.groundingSources);
  const metadata = await testDatabase.pool.query<{ generationMetadata: unknown }>(
    `SELECT generation_metadata AS "generationMetadata"
       FROM artifact_revisions
      WHERE id = $1`,
    [saved.currentRevision.id],
  );
  expect(metadata.rows[0]?.generationMetadata).toMatchObject({
    groundingReceipt: {
      lineageSources: ready.groundingSources,
      operationEvidence: [],
      version: 1,
    },
  });
});

test("rejects stale revisions and hides another owner's artifact", async () => {
  const workspace = await createWorkspace(alice, { name: "Private" }, testDatabase.db);
  const artifact = await createTeachingDocumentArtifact(
    alice,
    workspace.id,
    conversationA,
    content("Private"),
    testDatabase.db,
  );

  await expect(
    saveTeachingDocumentRevision(
      alice,
      {
        artifactId: artifact.id,
        conversationId: conversationA,
        content: content("Stale"),
        expectedRevisionId: crypto.randomUUID(),
        workspaceId: workspace.id,
      },
      testDatabase.db,
    ),
  ).rejects.toEqual(new TeachingDocumentError("teaching_document_conflict"));
  await expect(getTeachingDocumentArtifact(bob, artifact.id, testDatabase.db)).rejects.toEqual(
    new TeachingDocumentError("teaching_document_not_found"),
  );
});

test("hides a creator's document after its private manage permission is revoked", async () => {
  const workspace = await createWorkspace(alice, { name: "Revoked access" }, testDatabase.db);
  await testDatabase.pool.query("UPDATE workspaces SET visibility = 'public' WHERE id = $1", [
    workspace.id,
  ]);
  const artifact = await createTeachingDocumentArtifact(
    bob,
    workspace.id,
    conversationA,
    content("Previously accessible"),
    testDatabase.db,
  );
  await testDatabase.pool.query("UPDATE workspaces SET visibility = 'private' WHERE id = $1", [
    workspace.id,
  ]);

  await expect(getTeachingDocumentArtifact(bob, artifact.id, testDatabase.db)).rejects.toEqual(
    new TeachingDocumentError("teaching_document_not_found"),
  );
  await expect(
    getTeachingDocumentRevision(bob, artifact.id, artifact.currentRevision.id, testDatabase.db),
  ).rejects.toEqual(new TeachingDocumentError("teaching_document_not_found"));
});

test("rejects revision writes from another conversation without creating a revision", async () => {
  const workspace = await createWorkspace(alice, { name: "Scoped history" }, testDatabase.db);
  const artifact = await createTeachingDocumentArtifact(
    alice,
    workspace.id,
    conversationA,
    content("Original"),
    testDatabase.db,
  );

  await expect(
    saveTeachingDocumentRevision(
      alice,
      {
        artifactId: artifact.id,
        conversationId: conversationB,
        content: content("Forged"),
        expectedRevisionId: artifact.currentRevision.id,
        workspaceId: workspace.id,
      },
      testDatabase.db,
    ),
  ).rejects.toEqual(new TeachingDocumentError("teaching_document_not_found"));

  const count = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM artifact_revisions WHERE artifact_id = $1",
    [artifact.id],
  );
  expect(count.rows).toEqual([{ count: "1" }]);
});

test("never resolves a current revision that belongs to another artifact", async () => {
  const workspace = await createWorkspace(alice, { name: "Course" }, testDatabase.db);
  const first = await createTeachingDocumentArtifact(
    alice,
    workspace.id,
    conversationA,
    content("First"),
    testDatabase.db,
  );
  const second = await createTeachingDocumentArtifact(
    alice,
    workspace.id,
    conversationA,
    content("Second"),
    testDatabase.db,
  );
  await testDatabase.pool.query("UPDATE artifacts SET current_revision_id = $1 WHERE id = $2", [
    second.currentRevision.id,
    first.id,
  ]);

  await expect(getTeachingDocumentArtifact(alice, first.id, testDatabase.db)).rejects.toEqual(
    new TeachingDocumentError("teaching_document_not_found"),
  );
});

test("uses plan item identity so repeated kinds create distinct Artifacts and replay idempotently", async () => {
  const workspace = await createWorkspace(alice, { name: "Planned documents" }, testDatabase.db);
  const jobs: unknown[] = [];
  const queue: TeachingDocumentGenerationQueue = {
    async enqueue(_transaction, job) {
      jobs.push(job);
    },
  };
  const common = {
    conversationId: conversationA,
    locale: "en-US" as const,
    prompt: "Create a planned teaching document",
    sourceUserMessageId: "user:two-documents",
    workspaceId: workspace.id,
  };
  const first = await startTeachingDocumentGeneration(
    alice,
    { ...common, sourcePlanItemId: "40000000-0000-4000-8000-000000000001" },
    queue,
    testDatabase.db,
  );
  const second = await startTeachingDocumentGeneration(
    alice,
    { ...common, sourcePlanItemId: "40000000-0000-4000-8000-000000000002" },
    queue,
    testDatabase.db,
  );
  const replay = await startTeachingDocumentGeneration(
    alice,
    { ...common, sourcePlanItemId: "40000000-0000-4000-8000-000000000001" },
    queue,
    testDatabase.db,
  );

  expect(first.id).not.toBe(second.id);
  expect(replay.id).toBe(first.id);
  expect(jobs).toHaveLength(2);
});

test("persists a queued generation before work starts and projects draft updates", async () => {
  const workspace = await createWorkspace(alice, { name: "Background documents" }, testDatabase.db);
  const jobs: unknown[] = [];
  const started = await startTeachingDocumentGeneration(
    alice,
    {
      conversationId: conversationA,
      locale: "en-US",
      prompt: "Create a concise document about HCI",
      sourceUserMessageId: "user:background-document",
      workspaceId: workspace.id,
    },
    {
      async enqueue(_transaction, job) {
        jobs.push(job);
      },
    },
    testDatabase.db,
  );

  expect(started).toMatchObject({
    artifact: null,
    generationState: "queued",
    title: "Create a concise document about HCI",
  });
  expect(jobs).toEqual([
    expect.objectContaining({
      artifactId: started.id,
      conversationId: conversationA,
      generationAttemptId: requiredGenerationAttemptId(started),
      workspaceId: workspace.id,
    }),
  ]);
  const replay = await startTeachingDocumentGeneration(
    alice,
    {
      conversationId: conversationA,
      locale: "en-US",
      prompt: "Create a concise document about HCI",
      sourceUserMessageId: "user:background-document",
      workspaceId: workspace.id,
    },
    {
      async enqueue(_transaction, job) {
        jobs.push(job);
      },
    },
    testDatabase.db,
  );
  expect(replay.id).toBe(started.id);
  expect(jobs).toHaveLength(1);
  await expect(
    startTeachingDocumentGeneration(
      alice,
      {
        conversationId: conversationA,
        grounding: {
          evidence: [
            {
              content: { kind: "exact_text", text: "Different frozen context." },
              contentHash: "a".repeat(64),
              evidenceId: "11111111-1111-4111-8111-111111111111",
              fidelity: "source",
              locator: { end: 25, kind: "text_range", start: 0 },
              representationHash: "b".repeat(64),
              sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              sourceName: "Different.pdf",
              sourceRevision: 1,
            },
          ],
          version: 1,
        },
        locale: "en-US",
        prompt: "Create a concise document about HCI",
        sourceUserMessageId: "user:background-document",
        workspaceId: workspace.id,
      },
      { async enqueue() {} },
      testDatabase.db,
    ),
  ).rejects.toMatchObject({ code: "artifact_creation_conflict" });
  await expect(
    testDatabase.pool.query<{ count: string }>(
      "SELECT count(*) FROM artifact_generation_attempts WHERE artifact_id = $1",
      [started.id],
    ),
  ).resolves.toMatchObject({ rows: [{ count: "1" }] });
  await expect(
    getTeachingDocumentDetailForConversation(
      alice,
      { artifactId: started.id, conversationId: conversationB, workspaceId: workspace.id },
      testDatabase.db,
    ),
  ).rejects.toEqual(new TeachingDocumentError("teaching_document_not_found"));

  const completedDraft = {
    blocks: [
      { kind: "heading" as const, level: 2, text: "Core" },
      { kind: "paragraph" as const, text: "Body" },
      { kind: "bullet" as const, text: "One" },
      { kind: "bullet" as const, text: "Two" },
    ],
    title: "AI-generated title",
  };
  const liveDraft = generationDraft(completedDraft.title);
  const attemptId = requiredGenerationAttemptId(started);
  await claimTeachingDocumentGeneration(started.id, attemptId, testDatabase.db);
  await updateTeachingDocumentGeneration(
    started.id,
    attemptId,
    {
      draft: liveDraft,
      state: "generating",
    },
    testDatabase.db,
  );
  const generating = await getTeachingDocumentDetailForConversation(
    alice,
    { artifactId: started.id, conversationId: conversationA, workspaceId: workspace.id },
    testDatabase.db,
  );
  expect(generating).toMatchObject({
    draft: liveDraft,
    generationState: "generating",
    generationAttemptId: attemptId,
  });

  await updateTeachingDocumentGeneration(
    started.id,
    attemptId,
    { state: "finalizing" },
    testDatabase.db,
  );
  const ready = await completeTeachingDocumentGeneration(
    started.id,
    attemptId,
    alice.principalId,
    completedDraft,
    content(completedDraft.title),
    testDatabase.db,
  );
  expect(ready.title).toBe(completedDraft.title);
  const readyDetail = await getTeachingDocumentDetailForConversation(
    alice,
    { artifactId: started.id, conversationId: conversationA, workspaceId: workspace.id },
    testDatabase.db,
  );
  expect(readyDetail.generationAttemptId).toBeNull();
  await expect(
    testDatabase.pool.query<{ generationAttemptId: string | null }>(
      `SELECT generation_attempt_id AS "generationAttemptId"
         FROM artifact_revisions
        WHERE id = $1`,
      [ready.currentRevision.id],
    ),
  ).resolves.toMatchObject({ rows: [{ generationAttemptId: attemptId }] });
  expect(
    await failTeachingDocumentGeneration(
      started.id,
      "teaching_document_generation_failed",
      attemptId,
      testDatabase.db,
    ),
  ).toBe(false);
});

test("concurrent creation returns one Artifact, generation attempt, and job", async () => {
  const workspace = await createWorkspace(alice, { name: "Concurrent creation" }, testDatabase.db);
  const jobs: unknown[] = [];
  const queue: TeachingDocumentGenerationQueue = {
    async enqueue(_transaction, job) {
      jobs.push(job);
    },
  };
  const command = {
    conversationId: conversationA,
    locale: "en-US" as const,
    prompt: "Create one document",
    sourceUserMessageId: "user:concurrent-document",
    workspaceId: workspace.id,
  };

  const [first, second] = await Promise.all([
    startTeachingDocumentGeneration(alice, command, queue, testDatabase.db),
    startTeachingDocumentGeneration(alice, command, queue, testDatabase.db),
  ]);

  expect(second.id).toBe(first.id);
  expect(second.generationAttemptId).toBe(first.generationAttemptId);
  expect(jobs).toHaveLength(1);
  await expect(
    testDatabase.pool.query<{ count: string }>(
      "SELECT count(*) FROM artifact_generation_attempts WHERE artifact_id = $1",
      [first.id],
    ),
  ).resolves.toMatchObject({ rows: [{ count: "1" }] });
});

test("does not let a stale execution complete after terminal failure", async () => {
  const workspace = await createWorkspace(alice, { name: "Failed documents" }, testDatabase.db);
  const started = await startTeachingDocumentGeneration(
    alice,
    {
      conversationId: conversationA,
      locale: "en-US",
      prompt: "Create a document that will fail",
      sourceUserMessageId: "user:failed-document",
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const draft = {
    blocks: [
      { kind: "heading" as const, level: 2, text: "Core" },
      { kind: "paragraph" as const, text: "Body" },
      { kind: "bullet" as const, text: "One" },
      { kind: "bullet" as const, text: "Two" },
    ],
    title: "Failed title",
  };
  const attemptId = requiredGenerationAttemptId(started);
  await claimTeachingDocumentGeneration(started.id, attemptId, testDatabase.db);
  await updateTeachingDocumentGeneration(
    started.id,
    attemptId,
    { state: "finalizing" },
    testDatabase.db,
  );
  expect(
    await failTeachingDocumentGeneration(
      started.id,
      "teaching_document_generation_failed",
      attemptId,
      testDatabase.db,
    ),
  ).toBe(true);

  await expect(
    completeTeachingDocumentGeneration(
      started.id,
      attemptId,
      alice.principalId,
      draft,
      content(draft.title),
      testDatabase.db,
    ),
  ).rejects.toThrow("Teaching document generation is not completable");
});

test("fences a workflow that does not own the current generation attempt", async () => {
  const workspace = await createWorkspace(alice, { name: "Overlapping attempts" }, testDatabase.db);
  const started = await startTeachingDocumentGeneration(
    alice,
    {
      conversationId: conversationA,
      locale: "en-US",
      prompt: "Create a document with an overlapping retry",
      sourceUserMessageId: "user:overlapping-retry",
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const staleAttemptId = crypto.randomUUID();
  const activeAttemptId = requiredGenerationAttemptId(started);
  await expect(
    claimTeachingDocumentGeneration(started.id, staleAttemptId, testDatabase.db),
  ).rejects.toThrow("Teaching document generation is no longer claimable");
  await expect(
    claimTeachingDocumentGeneration(started.id, activeAttemptId, testDatabase.db),
  ).resolves.toBe(activeAttemptId);
  await expect(
    claimTeachingDocumentGeneration(started.id, activeAttemptId, testDatabase.db),
  ).resolves.toBe(activeAttemptId);

  await expect(
    updateTeachingDocumentGeneration(
      started.id,
      staleAttemptId,
      { draft: generationDraft("Stale title"), state: "generating" },
      testDatabase.db,
    ),
  ).rejects.toThrow("Teaching document generation is no longer writable");
  await expect(
    failTeachingDocumentGeneration(
      started.id,
      "teaching_document_generation_failed",
      staleAttemptId,
      testDatabase.db,
    ),
  ).resolves.toBe(false);
  await expect(
    getTeachingDocumentDetailForConversation(
      alice,
      { artifactId: started.id, conversationId: conversationA, workspaceId: workspace.id },
      testDatabase.db,
    ),
  ).resolves.toMatchObject({
    generationAttemptId: activeAttemptId,
    generationState: "generating",
  });
});

test("deletes a scoped artifact's content while retaining its creation tombstone", async () => {
  const workspace = await createWorkspace(alice, { name: "Disposable" }, testDatabase.db);
  const artifact = await createTeachingDocumentArtifact(
    alice,
    workspace.id,
    conversationA,
    content("First"),
    testDatabase.db,
  );
  const updatedArtifact = await saveTeachingDocumentRevision(
    alice,
    {
      artifactId: artifact.id,
      conversationId: conversationA,
      content: content("Second"),
      expectedRevisionId: artifact.currentRevision.id,
      workspaceId: workspace.id,
    },
    testDatabase.db,
  );
  const target = updatedArtifact.currentRevision.content.document.content[1];
  if (!target) throw new Error("Expected a target document block");
  await publishArtifactEditProposal(
    alice,
    {
      artifactId: artifact.id,
      conversationId: conversationA,
      groundingReceipt: emptyGroundingReceipt,
      proposal: {
        artifactId: artifact.id,
        baseRevisionId: updatedArtifact.currentRevision.id,
        edits: [{ blockId: target.attrs.id, operation: "delete_block" }],
        kind: "teaching_document",
        request: "删除正文",
        runId: crypto.randomUUID(),
        summary: "删除正文",
        title: artifact.title,
      },
      workspaceId: workspace.id,
    },
    testDatabase.db,
  );

  await deleteTeachingDocumentForConversationWithCleanupQueue(
    alice,
    { artifactId: artifact.id, conversationId: conversationA, workspaceId: workspace.id },
    testDatabase.db,
    { async enqueue() {} },
  );

  await purgeDeletedTeachingDocumentContent(artifact.id, testDatabase.db);

  await expect(
    getTeachingDocumentDetailForConversation(
      alice,
      { artifactId: artifact.id, conversationId: conversationA, workspaceId: workspace.id },
      testDatabase.db,
    ),
  ).rejects.toEqual(new TeachingDocumentError("teaching_document_not_found"));
  const revisions = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM artifact_revisions WHERE artifact_id = $1",
    [artifact.id],
  );
  expect(revisions.rows).toEqual([{ count: "0" }]);
  const proposals = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM artifact_edit_proposals WHERE artifact_id = $1",
    [artifact.id],
  );
  expect(proposals.rows).toEqual([{ count: "0" }]);
  const tombstone = await testDatabase.pool.query<{
    deletedAt: Date | null;
    failureCode: string | null;
    generationRequest: unknown;
    title: string;
  }>(
    'SELECT deleted_at AS "deletedAt", generation_failure_code AS "failureCode", generation_request AS "generationRequest", title FROM artifacts WHERE id = $1',
    [artifact.id],
  );
  expect(tombstone.rows).toEqual([
    {
      deletedAt: expect.any(Date),
      failureCode: null,
      generationRequest: null,
      title: "Deleted artifact",
    },
  ]);
});

test("rolls back a tombstone when atomic DBOS cleanup enqueue fails", async () => {
  const workspace = await createWorkspace(alice, { name: "Pending cleanup" }, testDatabase.db);
  const started = await startTeachingDocumentGeneration(
    alice,
    {
      conversationId: conversationA,
      locale: "en-US",
      prompt: "Create a document",
      sourceUserMessageId: "user:pending-cleanup",
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  await expect(
    deleteTeachingDocumentForConversationWithCleanupQueue(
      alice,
      { artifactId: started.id, conversationId: conversationA, workspaceId: workspace.id },
      testDatabase.db,
      {
        async enqueue() {
          throw new Error("dbos unavailable");
        },
      },
    ),
  ).rejects.toThrow("dbos unavailable");
  await expect(
    getTeachingDocumentDetailForConversation(
      alice,
      { artifactId: started.id, conversationId: conversationA, workspaceId: workspace.id },
      testDatabase.db,
    ),
  ).resolves.toMatchObject({ id: started.id, generationState: "queued" });

  await deleteTeachingDocumentForConversationWithCleanupQueue(
    alice,
    { artifactId: started.id, conversationId: conversationA, workspaceId: workspace.id },
    testDatabase.db,
    { async enqueue() {} },
  );
  const row = await testDatabase.pool.query<{ deletedAt: Date | null }>(
    'SELECT deleted_at AS "deletedAt" FROM artifacts WHERE id = $1',
    [started.id],
  );
  expect(row.rows[0]?.deletedAt).toEqual(expect.any(Date));
  await expect(
    testDatabase.pool.query<{ state: string }>(
      "SELECT state FROM artifact_generation_attempts WHERE id = $1",
      [requiredGenerationAttemptId(started)],
    ),
  ).resolves.toMatchObject({ rows: [{ state: "cancelled" }] });
  await purgeDeletedTeachingDocumentContent(started.id, testDatabase.db);
  const remaining = await testDatabase.pool.query<{
    count: string;
    generationState: string;
    purgedAt: Date | null;
  }>(
    'SELECT count(*) OVER ()::text AS count, generation_state AS "generationState", purged_at AS "purgedAt" FROM artifacts WHERE id = $1',
    [started.id],
  );
  expect(remaining.rows).toEqual([{ count: "1", generationState: "cancelled", purgedAt: null }]);
  await expect(
    startTeachingDocumentGeneration(
      alice,
      {
        conversationId: conversationA,
        locale: "en-US",
        prompt: "Recreate deleted content",
        sourceUserMessageId: "user:pending-cleanup",
        workspaceId: workspace.id,
      },
      { async enqueue() {} },
      testDatabase.db,
    ),
  ).rejects.toMatchObject({ code: "artifact_creation_conflict" });
});

test("does not delete an artifact outside the owned conversation scope", async () => {
  const workspace = await createWorkspace(alice, { name: "Private deletion" }, testDatabase.db);
  const artifact = await createTeachingDocumentArtifact(
    alice,
    workspace.id,
    conversationA,
    content("Keep"),
    testDatabase.db,
  );

  await expect(
    deleteTeachingDocumentForConversation(
      alice,
      { artifactId: artifact.id, conversationId: conversationB, workspaceId: workspace.id },
      testDatabase.db,
    ),
  ).rejects.toEqual(new TeachingDocumentError("teaching_document_not_found"));
  await expect(
    deleteTeachingDocumentForConversation(
      bob,
      { artifactId: artifact.id, conversationId: conversationA, workspaceId: workspace.id },
      testDatabase.db,
    ),
  ).rejects.toEqual(new TeachingDocumentError("teaching_document_not_found"));
  await expect(
    getTeachingDocumentArtifact(alice, artifact.id, testDatabase.db),
  ).resolves.toBeTruthy();
});

test("preserves the first terminal failure reason", async () => {
  const workspace = await createWorkspace(alice, { name: "Failure reason" }, testDatabase.db);
  const started = await startTeachingDocumentGeneration(
    alice,
    {
      conversationId: conversationA,
      locale: "en-US",
      prompt: "Create a document",
      sourceUserMessageId: "user:failure-reason",
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const attemptId = requiredGenerationAttemptId(started);
  expect(
    await failExhaustedTeachingDocumentGeneration(
      started.id,
      "teaching_document_rate_limited",
      attemptId,
      testDatabase.db,
    ),
  ).toBe(true);
  expect(
    await failExhaustedTeachingDocumentGeneration(
      started.id,
      "teaching_document_generation_failed",
      attemptId,
      testDatabase.db,
    ),
  ).toBe(false);
  await expect(
    getTeachingDocumentDetailForConversation(
      alice,
      { artifactId: started.id, conversationId: conversationA, workspaceId: workspace.id },
      testDatabase.db,
    ),
  ).resolves.toMatchObject({ failureCode: "teaching_document_rate_limited" });
});
