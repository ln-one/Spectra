import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  aiRuns,
  artifactEditProposals,
  artifacts,
  workspacePermissionGrants,
} from "@/database/schema";
import type { ArtifactOperationGroundingReceipt } from "@/features/artifacts/grounding";
import {
  dismissCurrentArtifactEditProposal,
  getCurrentArtifactEditProposal,
  publishArtifactEditProposal,
} from "@/features/artifacts/proposal-service.server";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import type { TeachingDocumentDraft } from "./contract";
import { TeachingDocumentError } from "./errors";
import { finalizeTeachingDocumentDraft } from "./finalize";
import { teachingDocumentMarkdownPageWithBlockIds } from "./refine";
import { acceptTeachingDocumentProposal } from "./refine-service.server";
import {
  claimTeachingDocumentGeneration,
  completeTeachingDocumentGeneration,
  saveTeachingDocumentRevision,
  startTeachingDocumentGeneration,
  updateTeachingDocumentGeneration,
} from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let actor: Actor;
let collaborator: Actor;
const conversationId = "00000000-0000-4000-8000-000000000201";
const emptyGroundingReceipt: ArtifactOperationGroundingReceipt = {
  operationEvidence: [],
  version: 1,
};

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.ai_runs, public.artifact_revisions, public.artifacts, public.workspaces, public.principals CASCADE",
  );
  actor = await ensurePrincipalForAuthUser("refine-alice", "refine-alice", testDatabase.db);
  collaborator = await ensurePrincipalForAuthUser("refine-bob", "refine-bob", testDatabase.db);
});

afterAll(async () => {
  await testDatabase.destroy();
});

function draft(): TeachingDocumentDraft {
  return {
    blocks: [
      { kind: "heading", level: 2, text: "核心概念" },
      { kind: "paragraph", text: "需要删除的重复说明。" },
      { kind: "paragraph", text: "应当保留的正文。" },
    ],
    title: "网络基础",
  };
}

async function createReadyDocument(workspaceId: string) {
  const started = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId,
      locale: "zh-CN",
      prompt: "创建网络基础文档",
      sourceUserMessageId: `test:${crypto.randomUUID()}`,
      workspaceId,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const attemptId = started.generationAttemptId;
  if (!attemptId) throw new Error("Generation attempt missing");
  await claimTeachingDocumentGeneration(started.id, attemptId, testDatabase.db);
  await updateTeachingDocumentGeneration(
    started.id,
    attemptId,
    {
      draft: {
        format: "markdown",
        markdown: "# 网络基础\n\n## 核心概念\n\n需要删除的重复说明。\n\n应当保留的正文。",
      },
      state: "finalizing",
    },
    testDatabase.db,
  );
  return completeTeachingDocumentGeneration(
    started.id,
    attemptId,
    actor.principalId,
    draft(),
    finalizeTeachingDocumentDraft(draft()),
    testDatabase.db,
  );
}

async function insertSucceededRun(workspaceId: string, runId: string) {
  await testDatabase.db
    .insert(aiRuns)
    .values({
      budget: {},
      budgetUsage: {},
      clientRequestId: `request:${runId}`,
      conversationId,
      deadlineAt: new Date(Date.now() + 60_000),
      finishedAt: new Date(),
      id: runId,
      inputMessageId: `user:${runId}`,
      operation: "send",
      requestHash: "a".repeat(64),
      state: "succeeded",
      workspaceId,
    })
    .returning({ id: aiRuns.id });
}

test("accepts a canonical proposal once and makes repeated acceptance idempotent", async () => {
  const workspace = await createWorkspace(actor, { name: "Refine" }, testDatabase.db);
  const artifact = await createReadyDocument(workspace.id);
  const target = artifact.currentRevision.content.document.content[1];
  if (!target) throw new Error("Expected a target document block");
  const runId = crypto.randomUUID();
  const output = {
    artifactId: artifact.id,
    baseRevisionId: artifact.currentRevision.id,
    edits: [{ blockId: target.attrs.id, operation: "delete_block" as const }],
    kind: "teaching_document" as const,
    request: "删除重复说明",
    runId,
    summary: "删除重复段落",
    title: artifact.title,
  };
  await insertSucceededRun(workspace.id, runId);
  await publishArtifactEditProposal(
    actor,
    {
      artifactId: artifact.id,
      conversationId,
      groundingReceipt: {
        operationEvidence: [
          {
            contentHash: "a".repeat(64),
            evidenceId: "11111111-1111-4111-8111-111111111111",
            fidelity: "source",
            locator: { end: 28, kind: "text_range", start: 0 },
            representationHash: "b".repeat(64),
            sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            sourceName: "网络课程讲义.pdf",
            sourceRevision: 2,
          },
        ],
        version: 1,
      },
      proposal: output,
      workspaceId: workspace.id,
    },
    testDatabase.db,
  );

  const input = {
    artifactId: artifact.id,
    conversationId,
    expectedRevisionId: artifact.currentRevision.id,
    runId,
    workspaceId: workspace.id,
  };
  const accepted = await acceptTeachingDocumentProposal(actor, input, testDatabase.db);
  const repeated = await acceptTeachingDocumentProposal(actor, input, testDatabase.db);

  expect(repeated.acceptedRevisionId).toBe(accepted.acceptedRevisionId);
  const acceptedMarkdown = teachingDocumentMarkdownPageWithBlockIds(
    accepted.artifact.currentRevision.content,
  )?.markdown;
  expect(acceptedMarkdown).not.toContain("重复说明");
  expect(acceptedMarkdown).toContain("应当保留");
  expect(accepted.artifact.groundingSources).toEqual([
    {
      sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sourceName: "网络课程讲义.pdf",
    },
  ]);
  const metadata = await testDatabase.pool.query<{ generationMetadata: unknown }>(
    `SELECT generation_metadata AS "generationMetadata"
       FROM artifact_revisions
      WHERE id = $1`,
    [accepted.acceptedRevisionId],
  );
  expect(metadata.rows[0]?.generationMetadata).toMatchObject({
    groundingReceipt: {
      lineageSources: accepted.artifact.groundingSources,
      operationEvidence: [
        expect.objectContaining({
          evidenceId: "11111111-1111-4111-8111-111111111111",
        }),
      ],
      version: 1,
    },
  });
  const revisions = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM artifact_revisions WHERE artifact_id = $1",
    [artifact.id],
  );
  expect(revisions.rows).toEqual([{ count: "2" }]);
});

test("persists one current proposal and keeps same-run replay idempotent", async () => {
  const workspace = await createWorkspace(actor, { name: "Proposal persistence" }, testDatabase.db);
  const artifact = await createReadyDocument(workspace.id);
  const target = artifact.currentRevision.content.document.content[1];
  if (!target) throw new Error("Expected a target document block");
  const proposal = {
    artifactId: artifact.id,
    baseRevisionId: artifact.currentRevision.id,
    edits: [{ blockId: target.attrs.id, operation: "delete_block" as const }],
    kind: "teaching_document" as const,
    request: "删除重复说明",
    runId: crypto.randomUUID(),
    summary: "删除重复段落",
    title: artifact.title,
  };
  const lookup = {
    artifactId: artifact.id,
    conversationId,
    workspaceId: workspace.id,
  };

  await publishArtifactEditProposal(
    actor,
    { ...lookup, groundingReceipt: emptyGroundingReceipt, proposal },
    testDatabase.db,
  );
  await publishArtifactEditProposal(
    actor,
    { ...lookup, groundingReceipt: emptyGroundingReceipt, proposal },
    testDatabase.db,
  );
  await expect(
    publishArtifactEditProposal(
      actor,
      {
        ...lookup,
        groundingReceipt: {
          operationEvidence: [
            {
              contentHash: "a".repeat(64),
              evidenceId: "11111111-1111-4111-8111-111111111111",
              fidelity: "source",
              locator: { end: 10, kind: "text_range", start: 0 },
              representationHash: "b".repeat(64),
              sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              sourceName: "不同回执.pdf",
              sourceRevision: 1,
            },
          ],
          version: 1,
        },
        proposal,
      },
      testDatabase.db,
    ),
  ).rejects.toMatchObject({ code: "artifact_proposal_conflict" });
  await expect(getCurrentArtifactEditProposal(actor, lookup, testDatabase.db)).resolves.toEqual(
    proposal,
  );

  const replacement = {
    ...proposal,
    request: "删除重复说明并重新确认",
    runId: crypto.randomUUID(),
    summary: "替换上一条修改建议",
  };
  await publishArtifactEditProposal(
    actor,
    { ...lookup, groundingReceipt: emptyGroundingReceipt, proposal: replacement },
    testDatabase.db,
  );
  await expect(getCurrentArtifactEditProposal(actor, lookup, testDatabase.db)).resolves.toEqual(
    replacement,
  );
  await dismissCurrentArtifactEditProposal(
    actor,
    { ...lookup, runId: replacement.runId },
    testDatabase.db,
  );
  await expect(getCurrentArtifactEditProposal(actor, lookup, testDatabase.db)).resolves.toBeNull();
  const rows = await testDatabase.pool.query<{ count: string; state: string }>(
    `SELECT state, count(*)::text AS count
       FROM artifact_edit_proposals
      WHERE artifact_id = $1
      GROUP BY state
      ORDER BY state`,
    [artifact.id],
  );
  expect(rows.rows).toEqual([{ count: "2", state: "dismissed" }]);
});

test("rejects a bare proposal payload instead of synthesizing an operation receipt", async () => {
  const workspace = await createWorkspace(actor, { name: "Invalid proposal" }, testDatabase.db);
  const artifact = await createReadyDocument(workspace.id);
  const target = artifact.currentRevision.content.document.content[1];
  if (!target) throw new Error("Expected a target document block");
  const proposal = {
    artifactId: artifact.id,
    baseRevisionId: artifact.currentRevision.id,
    edits: [{ blockId: target.attrs.id, operation: "delete_block" as const }],
    kind: "teaching_document" as const,
    request: "删除重复说明",
    runId: crypto.randomUUID(),
    summary: "历史裸 proposal",
    title: artifact.title,
  };
  await testDatabase.db.insert(artifactEditProposals).values({
    artifactId: artifact.id,
    baseRevisionId: artifact.currentRevision.id,
    createdByPrincipalId: actor.principalId,
    kind: "teaching_document",
    payload: proposal,
    runId: proposal.runId,
  });

  await expect(
    getCurrentArtifactEditProposal(
      actor,
      {
        artifactId: artifact.id,
        conversationId,
        workspaceId: workspace.id,
      },
      testDatabase.db,
    ),
  ).rejects.toMatchObject({ name: "ZodError" });
});

test("Proposal access follows the private Artifact creator instead of the Workspace owner", async () => {
  const workspace = await createWorkspace(actor, { name: "Collaborative refine" }, testDatabase.db);
  const artifact = await createReadyDocument(workspace.id);
  await testDatabase.db
    .update(artifacts)
    .set({ createdByPrincipalId: collaborator.principalId })
    .where(eq(artifacts.id, artifact.id));
  await testDatabase.db.insert(workspacePermissionGrants).values({
    grantedByPrincipalId: actor.principalId,
    permission: "artifact.private.manage",
    principalId: collaborator.principalId,
    workspaceId: workspace.id,
  });
  const target = artifact.currentRevision.content.document.content[1];
  if (!target) throw new Error("Expected a target document block");
  const proposal = {
    artifactId: artifact.id,
    baseRevisionId: artifact.currentRevision.id,
    edits: [{ blockId: target.attrs.id, operation: "delete_block" as const }],
    kind: "teaching_document" as const,
    request: "删除重复说明",
    runId: crypto.randomUUID(),
    summary: "协作者修改",
    title: artifact.title,
  };
  const lookup = { artifactId: artifact.id, conversationId, workspaceId: workspace.id };

  await expect(
    publishArtifactEditProposal(
      collaborator,
      { ...lookup, groundingReceipt: emptyGroundingReceipt, proposal },
      testDatabase.db,
    ),
  ).resolves.toEqual(proposal);
  await expect(
    getCurrentArtifactEditProposal(collaborator, lookup, testDatabase.db),
  ).resolves.toEqual(proposal);
  await expect(
    getCurrentArtifactEditProposal(actor, lookup, testDatabase.db),
  ).rejects.toMatchObject({ code: "artifact_not_found" });
});

test("does not treat an unrelated producing run as an accepted proposal", async () => {
  const workspace = await createWorkspace(actor, { name: "Fail closed" }, testDatabase.db);
  const artifact = await createReadyDocument(workspace.id);
  const unrelatedRunId = crypto.randomUUID();
  await insertSucceededRun(workspace.id, unrelatedRunId);
  const target = artifact.currentRevision.content.document.content[1];
  if (!target) throw new Error("Expected a target document block");
  await publishArtifactEditProposal(
    actor,
    {
      artifactId: artifact.id,
      conversationId,
      groundingReceipt: emptyGroundingReceipt,
      proposal: {
        artifactId: artifact.id,
        baseRevisionId: artifact.currentRevision.id,
        edits: [{ blockId: target.attrs.id, operation: "delete_block" }],
        kind: "teaching_document",
        request: "删除重复说明",
        runId: unrelatedRunId,
        summary: "删除重复段落",
        title: artifact.title,
      },
      workspaceId: workspace.id,
    },
    testDatabase.db,
  );
  await saveTeachingDocumentRevision(
    actor,
    {
      artifactId: artifact.id,
      content: artifact.currentRevision.content,
      conversationId,
      expectedRevisionId: artifact.currentRevision.id,
      producingRunId: unrelatedRunId,
      workspaceId: workspace.id,
    },
    testDatabase.db,
  );

  await expect(
    acceptTeachingDocumentProposal(
      actor,
      {
        artifactId: artifact.id,
        conversationId,
        expectedRevisionId: artifact.currentRevision.id,
        runId: unrelatedRunId,
        workspaceId: workspace.id,
      },
      testDatabase.db,
    ),
  ).rejects.toEqual(new TeachingDocumentError("teaching_document_proposal_stale"));
});

test("a delayed dismissal cannot dismiss a replacement proposal", async () => {
  const workspace = await createWorkspace(actor, { name: "Dismiss race" }, testDatabase.db);
  const artifact = await createReadyDocument(workspace.id);
  const target = artifact.currentRevision.content.document.content[1];
  if (!target) throw new Error("Expected a target document block");
  const lookup = {
    artifactId: artifact.id,
    conversationId,
    workspaceId: workspace.id,
  };
  const first = {
    artifactId: artifact.id,
    baseRevisionId: artifact.currentRevision.id,
    edits: [{ blockId: target.attrs.id, operation: "delete_block" as const }],
    kind: "teaching_document" as const,
    request: "删除重复说明",
    runId: crypto.randomUUID(),
    summary: "第一份建议",
    title: artifact.title,
  };
  const replacement = {
    ...first,
    request: "改写重复说明",
    runId: crypto.randomUUID(),
    summary: "替代建议",
  };
  await publishArtifactEditProposal(
    actor,
    { ...lookup, groundingReceipt: emptyGroundingReceipt, proposal: first },
    testDatabase.db,
  );
  await publishArtifactEditProposal(
    actor,
    { ...lookup, groundingReceipt: emptyGroundingReceipt, proposal: replacement },
    testDatabase.db,
  );
  await dismissCurrentArtifactEditProposal(
    actor,
    { ...lookup, runId: first.runId },
    testDatabase.db,
  );

  await expect(getCurrentArtifactEditProposal(actor, lookup, testDatabase.db)).resolves.toEqual(
    replacement,
  );
});
